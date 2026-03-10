import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { remark } from 'remark';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { cache } from 'react';

const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Lazy initialize clients to prevent Next.js build-time Webpack errors
let _notionClient = null;
let _n2mClient = null;

const getNotion = () => {
    if (!_notionClient) {
        _notionClient = new Client({ auth: process.env.NOTION_TOKEN });
    }
    return _notionClient;
};

const getN2M = () => {
    if (!_n2mClient) {
        _n2mClient = new NotionToMarkdown({ notionClient: getNotion() });

        // Custom transformer for image blocks:
        // Notion's image URLs are signed S3 links that expire after ~1 hour.
        // Instead, output a persistent /api/notion-image?id=<block_id> URL
        // so the browser always gets a fresh redirect from our proxy.
        _n2mClient.setCustomTransformer('image', async (block) => {
            const { image } = block;
            const caption = image?.caption?.map(t => t.plain_text).join('') || '';
            const blockId = block.id;

            // For external images (e.g. pasted from URL), use the URL directly
            if (image?.type === 'external') {
                const url = image.external.url;
                return `<img src="${url}" alt="${caption}" style="max-width:100%;height:auto;border-radius:12px;margin:1.5rem auto;display:block;box-shadow:var(--shadow-md)" loading="lazy" />`;
            }

            // For hosted Notion images, proxy through our API to always get fresh URLs
            return `<img src="/api/notion-image?id=${blockId}" alt="${caption}" style="max-width:100%;height:auto;border-radius:12px;margin:1.5rem auto;display:block;box-shadow:var(--shadow-md)" loading="lazy" />`;
        });
    }
    return _n2mClient;
};

/**
 * Helper: sleep for ms milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper: Retry a Notion API call on rate_limited errors with exponential backoff
 */
async function withRetry(fn, maxRetries = 5, baseDelay = 2000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isRateLimited = error?.code === 'rate_limited' || error?.message?.includes('rate limit');
            if (isRateLimited && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, 32s
                console.warn(`Notion rate limited. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
                await sleep(delay);
            } else {
                throw error;
            }
        }
    }
}

/**
 * Helper: Safely extract text from Notion's rich_text/title arrays
 */
const getText = (property) => {
    if (!property) return '';
    if (property.type === 'title') {
        return property.title.map((t) => t.plain_text).join('');
    }
    if (property.type === 'rich_text') {
        return property.rich_text.map((t) => t.plain_text).join('');
    }
    return '';
};

/**
 * Helper: Map a raw Notion Page object into our standard frontmatter format
 */
const mapNotionPage = (page) => {
    const props = page.properties;

    // Fallbacks just in case the Notion column hasn't been filled out
    return {
        slug: getText(props.Slug) || page.id,
        id: getText(props.Slug) || page.id,
        title: getText(props.Name) || 'Untitled Post',
        date: props.Date?.date?.start || page.created_time,
        tags: props.Tags?.multi_select?.map(tag => tag.name) || [],
        category: props.Category?.select?.name || 'Uncategorized',
        author: { name: 'yancey', picture: 'https://github.com/yanceyyancey.png' },
    };
};

/**
 * Fetch all published posts from the Notion Database, sorted by date
 */
export async function getSortedPostsData() {
    try {
        const notion = getNotion();
        const response = await withRetry(() => notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                and: [
                    {
                        property: 'Status',
                        status: {
                            equals: '完成'
                        }
                    },
                    {
                        property: 'Category',
                        select: {
                            does_not_equal: 'Journal'
                        }
                    }
                ]
            },
            sorts: [
                {
                    property: 'Date',
                    direction: 'descending',
                },
            ],
        }));

        return response.results.map(mapNotionPage);
    } catch (error) {
        console.error("Error fetching posts from Notion:", error.body || error.message);
        return [];
    }
}

/**
 * Fast path to get all valid slugs for Next.js static generation (getStaticPaths)
 */
export async function getAllPostIds() {
    try {
        const posts = await getSortedPostsData();
        return posts.map(post => ({
            params: {
                slug: post.slug,
            },
        }));
    } catch (error) {
        console.error("Error fetching slugs from Notion:", error.message);
        return [];
    }
}

/**
 * Fetch full content (blocks) + metadata for a specific slug
 */
// Wrapped with React.cache() to deduplicate within the same render pass.
// generateMetadata() and Post() both call this, but only 1 Notion API round-trip happens.
export const getPostData = cache(async function getPostData(slug) {
    // 1. Query the database to find the exact page by Slug (with retry)
    const notion = getNotion();
    const response = await withRetry(() => notion.databases.query({
        database_id: DATABASE_ID,
        filter: {
            property: 'Slug',
            rich_text: {
                equals: slug,
            },
        },
    }));

    if (!response.results.length) {
        throw new Error(`Post with slug "${slug}" not found in Notion.`);
    }

    const page = response.results[0];
    const metadata = mapNotionPage(page);

    // 2. Fetch all blocks belonging to this page and convert them to Markdown (with retry)
    const n2m = getN2M();
    const mdBlocks = await withRetry(() => n2m.pageToMarkdown(page.id));
    const mdString = n2m.toMarkdownString(mdBlocks);

    const rawMarkdown = mdString.parent || mdString;

    // Remove legacy frontmatter block (--- YAML ---) explicitly
    const cleanMarkdown = rawMarkdown.replace(/^---\n[\s\S]*?\n---\n/, '');

    // 3. Convert Markdown → HTML with GFM and Syntax Highlighting
    // remark (markdown) -> rehype (html AST) -> syntax highlight -> stringify
    const processedContent = await remark()
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeHighlight, { ignoreMissing: true })
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(cleanMarkdown);
    const contentHtml = processedContent.toString();

    // 4. Return the exact payload structure the frontend expects
    return {
        slug,
        contentHtml,
        ...metadata,
    };
});

/**
 * Fetch all Journals/microblogs (Status = '完成' AND Category = 'Journal')
 * Along with their pre-rendered HTML content for instant timeline display
 */
export async function getJournalsData() {
    try {
        const notion = getNotion();
        const response = await withRetry(() => notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                and: [
                    {
                        property: 'Status',
                        status: {
                            equals: '完成'
                        }
                    },
                    {
                        property: 'Category',
                        select: {
                            equals: 'Journal'
                        }
                    }
                ]
            },
            sorts: [
                {
                    property: 'Date',
                    direction: 'descending',
                },
            ],
        }));

        const partialJournals = response.results.map(mapNotionPage);

        // Fetch HTML content SEQUENTIALLY to avoid hitting Notion rate limits
        const fullJournals = [];
        for (const journal of partialJournals) {
            const data = await getPostData(journal.slug);
            fullJournals.push(data);
            await sleep(300); // Small delay between requests to be kind to the API
        }

        return fullJournals;
    } catch (error) {
        console.error("Error fetching journals from Notion:", error.body || error.message);
        return [];
    }
}

/**
 * Derive site stats (categories, tags, post counts)
 */
export async function getSiteStats() {
    const allPostsData = await getSortedPostsData();
    const categories = new Set();
    const tags = new Set();

    allPostsData.forEach(post => {
        if (post.category) categories.add(post.category);
        if (post.tags && Array.isArray(post.tags)) {
            post.tags.forEach(tag => tags.add(tag));
        }
    });

    return {
        postCount: allPostsData.length,
        categoryCount: categories.size,
        tagCount: tags.size
    };
}
