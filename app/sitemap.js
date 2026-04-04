import { getSortedPostsData } from '@/lib/posts';
import { absoluteUrl } from '@/lib/site-config';

export default async function sitemap() {
    // Get all blog posts
    const posts = await getSortedPostsData();

    const blogUrls = posts.map((post) => ({
        url: absoluteUrl(`/blog/${post.slug}`),
        lastModified: new Date(post.date || new Date()),
        changeFrequency: 'weekly',
        priority: 0.8,
    }));

    // Add static routes
    const routes = ['', '/blog', '/about', '/archives', '/categories'].map((route) => ({
        url: absoluteUrl(route || '/'),
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: route === '' ? 1 : 0.9,
    }));

    return [...routes, ...blogUrls];
}
