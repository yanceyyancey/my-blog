import Link from 'next/link';
import { getSortedPostsData } from '@/lib/posts';
import Sidebar from '@/components/Sidebar';
import InteractiveBoy from '@/components/InteractiveBoy';

export const revalidate = 300; // Regenerate every 5 minutes

export default async function Home() {
    const allPostsData = await getSortedPostsData();
    const recentPosts = allPostsData.slice(0, 4);

    return (
        <div className="home-wrapper">
            <section className="full-hero">
                <InteractiveBoy />
                <div className="scroll-down">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </section>

            <div className="container layout-wrapper" style={{ marginTop: '2rem' }}>
                <div className="main-content">
                    <section className="recent-posts">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', marginTop: '1rem' }}>
                            <h2 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                发现文章
                            </h2>
                            <Link href="/blog" style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>
                                全部文章 →
                            </Link>
                        </div>

                        <div className="post-list list-view">
                            {recentPosts.map(({ slug, date, title, category, tags }) => (
                                <Link href={`/blog/${slug}`} key={slug} className="post-card">
                                    <div className="post-card-content">
                                        <h3>{title}</h3>
                                        <div className="date">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                            {date}
                                        </div>
                                        <div className="post-tags" style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {category && <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: '12px', fontWeight: '600' }}>{category}</span>}
                                            {tags && tags.map(tag => (
                                                <span key={tag} style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderRadius: '12px' }}>#{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                </div>

                <aside className="sidebar">
                    <Sidebar />
                </aside>
            </div>
        </div>
    );
}
