import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { remark } from 'remark';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { visit } from 'unist-util-visit';
import remarkGfm from 'remark-gfm';
import { cache } from 'react';
import { siteConfig } from '@/lib/site-config';
import { notionSchema } from '@/lib/notion-schema';

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

const getProperty = (properties, names) => {
    for (const name of names) {
        if (properties?.[name]) return properties[name];
    }
    return null;
};

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
    if (property.type === 'formula') {
        const { formula } = property;
        if (formula.type === 'string') return formula.string || '';
    }
    if (property.type === 'select') {
        return property.select?.name || '';
    }
    if (property.type === 'status') {
        return property.status?.name || '';
    }
    if (property.type === 'url') {
        return property.url || '';
    }
    return '';
};

const getCoverImage = (property) => {
    if (!property || property.type !== 'files' || property.files.length === 0) return '';
    const [file] = property.files;
    if (file.type === 'external') return file.external.url;
    if (file.type === 'file') return file.file.url;
    return '';
};

const createExcerpt = (text, maxLength = 160) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const stripMarkdown = (markdown) => markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, ' $1 ')
    .replace(/!\[.*?\]\(.*?\)/g, ' ')
    .replace(/\[([^\]]+)\]\((.*?)\)/g, ' $1 ')
    .replace(/^>\s?/gm, ' ')
    .replace(/[#*_~>-]/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Helper: Map a raw Notion Page object into our standard frontmatter format
 */
const mapNotionPage = (page) => {
    const props = page.properties;
    const summary = getText(getProperty(props, notionSchema.aliases.summary));

    // Fallbacks just in case the Notion column hasn't been filled out
    return {
        slug: getText(props[notionSchema.properties.slug]) || page.id,
        id: page.id,
        title: getText(getProperty(props, notionSchema.aliases.title)) || 'Untitled Post',
        date: props[notionSchema.properties.date]?.date?.start || page.created_time,
        tags: props[notionSchema.properties.tags]?.multi_select?.map(tag => tag.name) || [],
        category: props[notionSchema.properties.category]?.select?.name || notionSchema.values.uncategorizedCategory,
        description: createExcerpt(summary),
        coverImage: getCoverImage(getProperty(props, notionSchema.aliases.cover)),
        author: { name: siteConfig.author.name, picture: siteConfig.author.avatar },
    };
};

async function queryPublishedPages() {
    const notion = getNotion();
    const results = [];
    let nextCursor;

    do {
        const response = await withRetry(() => notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                property: notionSchema.properties.status,
                status: {
                    equals: notionSchema.values.publishedStatus
                }
            },
            sorts: [
                {
                    property: notionSchema.properties.date,
                    direction: 'descending',
                },
            ],
            start_cursor: nextCursor,
        }));

        results.push(...response.results);
        nextCursor = response.has_more ? response.next_cursor : null;
    } while (nextCursor);

    return results;
}

/**
 * Fetch all published posts from the Notion Database, sorted by date
 */
export async function getSortedPostsData() {
    try {
        const pages = await queryPublishedPages();

        // Exclude Journal posts in JavaScript (more robust than Notion API filter)
        return pages
            .map(mapNotionPage)
            .filter(post => post.category !== notionSchema.values.journalCategory);
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
            and: [
                {
                    property: notionSchema.properties.slug,
                    rich_text: {
                        equals: slug,
                    },
                },
                {
                    property: notionSchema.properties.status,
                    status: {
                        equals: notionSchema.values.publishedStatus,
                    },
                },
            ],
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
    const fallbackDescription = createExcerpt(stripMarkdown(cleanMarkdown));

    // Plugin to extract TOC
    const toc = [];
    const extractToc = () => (tree) => {
        visit(tree, 'element', (node) => {
            if (['h1', 'h2', 'h3'].includes(node.tagName)) {
                // Find inner text
                let text = '';
                visit(node, 'text', (textNode) => {
                    text += textNode.value;
                });

                // rehype-slug ensures node.properties.id exists
                if (node.properties && node.properties.id) {
                    toc.push({
                        id: node.properties.id,
                        text,
                        level: parseInt(node.tagName.charAt(1), 10),
                    });
                }
            }
        });
    };

    // 3. Convert Markdown → HTML with GFM and Syntax Highlighting
    // remark (markdown) -> rehype (html AST) -> syntax highlight -> stringify
    const processedContent = await remark()
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeSlug) // Add IDs to headings
        .use(extractToc) // Extract TOC data
        .use(rehypeHighlight, { ignoreMissing: true })
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(cleanMarkdown);
    const contentHtml = processedContent.toString();

    // 4. Return the exact payload structure the frontend expects
    return {
        slug,
        contentHtml,
        toc,
        ...metadata,
        description: metadata.description || fallbackDescription,
    };
});

/**
 * Fetch all Journals/microblogs (Status = '完成' AND Category = 'Journal')
 * Along with their pre-rendered HTML content for instant timeline display
 */
export async function getJournalsData() {
    try {
        const pages = await queryPublishedPages();

        // Filter to Journal posts in JavaScript
        const journalPages = pages
            .map(mapNotionPage)
            .filter(post => post.category === notionSchema.values.journalCategory);

        // Fetch HTML content SEQUENTIALLY to avoid hitting Notion rate limits
        const fullJournals = [];
        for (const journal of journalPages) {
            const data = await getPostData(journal.slug);
            fullJournals.push(data);
            await sleep(300);
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
