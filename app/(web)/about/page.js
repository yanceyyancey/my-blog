import Link from 'next/link';
import { getSortedPostsData } from '@/lib/posts';
import { siteConfig } from '@/lib/site-config';

export const metadata = {
    title: '关于 | yancey',
};

export const revalidate = 60; // ISR Support

export default async function About() {
    const allPostsData = await getSortedPostsData();

    // Group posts by Year for the timeline
    const groupedPosts = allPostsData.reduce((acc, post) => {
        const year = new Date(post.date).getFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(post);
        return acc;
    }, {});

    const sortedYears = Object.keys(groupedPosts).sort((a, b) => b - a);

    return (
        <div className="container layout-wrapper" style={{ marginTop: 'calc(var(--nav-height) + 2rem)' }}>
            <div className="main-content">
                <div style={{ padding: '1rem 0 2rem 0' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '1rem', letterSpacing: '-0.04em' }}>关于 / About</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: '1.6' }}>
                        {siteConfig.author.headline}。{siteConfig.author.intro}
                    </p>
                </div>

                <div className="markdown-content" style={{ marginTop: '1rem', fontSize: '1.05rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '1.5rem', marginBottom: '1rem' }}>找到我</h2>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem' }}>
                        <a href="https://github.com/yanceyyancey" target="_blank" rel="noopener noreferrer" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 1rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem',
                            color: 'var(--text-primary)', textDecoration: 'none', border: '1px solid var(--border)'
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                            GitHub
                        </a>
                        <a href="mailto:yancey@example.com" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 1rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem',
                            color: 'var(--text-primary)', textDecoration: 'none', border: '1px solid var(--border)'
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            Email
                        </a>
                    </div>
                </div>

                {/* Timeline Archives rendered directly in the About page */}
                <div style={{ marginTop: '2rem', paddingTop: '3rem', borderTop: '1px solid var(--border)' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem' }}>所有归档 ({allPostsData.length})</h2>
                    <div className="timeline-container">
                        {sortedYears.map((year) => (
                            <div key={year} className="timeline-year-group">
                                <h2 className="timeline-year">{year}</h2>
                                <div className="timeline-posts">
                                    {groupedPosts[year].map(({ slug, title, date, category }) => {
                                        const postDate = new Date(date);
                                        const monthDay = `${(postDate.getMonth() + 1).toString().padStart(2, '0')}-${postDate.getDate().toString().padStart(2, '0')}`;

                                        return (
                                            <div key={slug} className="timeline-item">
                                                <div className="timeline-dot"></div>
                                                <div className="timeline-content">
                                                    <span className="timeline-date">{monthDay}</span>
                                                    <Link href={`/blog/${slug}`} className="timeline-title">
                                                        {title}
                                                    </Link>
                                                    {category && (
                                                        <span className="timeline-category">{category}</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
