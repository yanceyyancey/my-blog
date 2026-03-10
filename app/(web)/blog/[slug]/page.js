import { getPostData, getAllPostIds } from '@/lib/posts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Comments from '@/components/Comments';
import ArticleContent from '@/components/ArticleContent';
import TableOfContents from '@/components/TableOfContents';
import ReadingProgressBar from '@/components/ReadingProgressBar';

// Return empty array: posts are rendered on-demand (ISR) instead of at build time.
// This prevents Notion API rate limiting from mass-fetching all posts during every deploy.
export async function generateStaticParams() {
    return [];
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    try {
        const postData = await getPostData(slug);
        return {
            title: `${postData.title} | Blog`,
            description: postData.description || '阅读此文章了解更多',
        };
    } catch (error) {
        return {
            title: '文章不存在',
        };
    }
}

export const revalidate = 300; // Refresh cached page every 5 minutes (ISR)
export const dynamicParams = true; // Allow slugs not in generateStaticParams (new posts) to be rendered on demand


export default async function Post({ params }) {
    const { slug } = await params;
    try {
        const postData = await getPostData(slug);

        return (
            <div className="layout-wrapper container" style={{ marginTop: 'calc(var(--nav-height) + 2rem)' }}>
                <ReadingProgressBar />
                <main className="main-content">
                    <article>
                        <Link href="/blog" className="back-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                            返回文章列表
                        </Link>

                        <header className="article-header">
                            <div className="post-tags" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                {postData.category && <span style={{ fontSize: '0.85rem', padding: '0.3rem 0.8rem', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: '16px', fontWeight: '600' }}>{postData.category}</span>}
                                {postData.tags && postData.tags.map(tag => (
                                    <span key={tag} style={{ fontSize: '0.85rem', padding: '0.3rem 0.8rem', background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderRadius: '16px' }}>#{tag}</span>
                                ))}
                            </div>
                            <h1 className="article-title">{postData.title}</h1>
                            <div className="article-meta">
                                <span>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    {postData.date}
                                </span>
                                {postData.author && (
                                    <>
                                        <span style={{ color: 'var(--border)' }}>|</span>
                                        <span>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                            {postData.author?.name || postData.author}
                                        </span>
                                    </>
                                )}
                                <span style={{ color: 'var(--border)' }}>|</span>
                                <span>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                    {Math.ceil(postData.contentHtml.length / 500)} 分钟阅读
                                </span>
                            </div>
                        </header>

                        <ArticleContent contentHtml={postData.contentHtml} />

                        <div style={{ marginTop: '5rem', paddingTop: '3rem', borderTop: '1px solid var(--border)' }}>
                            <Comments />
                        </div>
                    </article>
                </main>

                <aside className="sidebar">
                    <TableOfContents toc={postData.toc} />
                </aside>
            </div>
        );
    } catch (error) {
        return notFound();
    }
}
