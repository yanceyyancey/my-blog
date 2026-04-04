import { getSortedPostsData } from '@/lib/posts';
import { absoluteUrl, siteConfig } from '@/lib/site-config';

export const revalidate = 3600; // Cache the RSS feed for 1 hour

export async function GET() {
    try {
        const posts = await getSortedPostsData();

        // Limit feed to the 20 most recent posts to keep size reasonable
        const feedPosts = posts.slice(0, 20);

        const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${siteConfig.title}</title>
    <link>${siteConfig.url}</link>
    <description><![CDATA[${siteConfig.description}]]></description>
    <atom:link href="${absoluteUrl(siteConfig.links.rss)}" rel="self" type="application/rss+xml" />
    <language>${siteConfig.locale}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${feedPosts.map(post => `
      <item>
        <title><![CDATA[${post.title}]]></title>
        <link>${absoluteUrl(`/blog/${post.slug}`)}</link>
        <guid isPermaLink="true">${absoluteUrl(`/blog/${post.slug}`)}</guid>
        <pubDate>${new Date(post.date).toUTCString()}</pubDate>
        ${post.description ? `<description><![CDATA[${post.description}]]></description>` : ''}
      </item>`).join('')}
  </channel>
</rss>`;

        return new Response(rssXml, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
            },
        });
    } catch (error) {
        console.error("Error generating RSS feed:", error);
        return new Response("Error generating RSS feed", { status: 500 });
    }
}
