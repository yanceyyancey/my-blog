'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SearchModal({ isOpen, onClose }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);
    const router = useRouter();

    // Fetch post data when modal is open
    useEffect(() => {
        const handleOpen = async () => {
            if (isOpen) {
                setTimeout(() => {
                    if (inputRef.current) inputRef.current.focus();
                }, 100);

                if (posts.length === 0) {
                    setLoading(true);
                    try {
                        const res = await fetch('/api/search');
                        const data = await res.json();
                        setPosts(data);
                    } catch (e) {
                        console.error('Failed to load search data:', e);
                    } finally {
                        setLoading(false);
                    }
                }
            } else {
                setQuery('');
                setResults([]);
            }
        };
        handleOpen();
    }, [isOpen, posts.length]);

    // Handle search filtering
    useEffect(() => {
        const runFilter = () => {
            if (!query.trim()) {
                setResults([]);
                return;
            }

            const lowerQuery = query.toLowerCase();
            const filtered = posts.filter(post =>
                (post.title && post.title.toLowerCase().includes(lowerQuery)) ||
                (post.description && post.description.toLowerCase().includes(lowerQuery)) ||
                (post.category && post.category.toLowerCase().includes(lowerQuery)) ||
                (post.tags && post.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
            );

            setResults(filtered.slice(0, 8)); // Limit to top 8 results
        };
        runFilter();
    }, [query, posts]);
    // Close on escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Helper to highlight matching text
    const highlightMatch = (text, highlight) => {
        if (!text || !highlight) return text;
        const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === highlight.toLowerCase() ?
                <span key={i} style={{ color: 'red', fontWeight: 'bold' }}>{part}</span> : part
        );
    };

    // Helper to get an excerpt around the match
    const getExcerpt = (content, highlight) => {
        if (!content || !highlight) return '';
        const lowerContent = content.toLowerCase();
        const lowerHighlight = highlight.toLowerCase();
        const index = lowerContent.indexOf(lowerHighlight);

        if (index === -1) return '';

        const start = Math.max(0, index - 30);
        const end = Math.min(content.length, index + highlight.length + 30);

        let excerpt = content.substring(start, end);
        if (start > 0) excerpt = '...' + excerpt;
        if (end < content.length) excerpt = excerpt + '...';

        return highlightMatch(excerpt, highlight);
    };

    if (!isOpen) return null;

    return (
        <div className="search-overlay" onClick={onClose}>
            <div className="search-modal" onClick={e => e.stopPropagation()}>
                <div className="search-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem 0.5rem 2rem' }}>
                    <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.25rem', fontWeight: 'bold' }}>搜索</h2>
                    <button className="search-close" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div style={{ padding: '0.5rem 2rem 1rem 2rem' }}>
                    <div className="search-input-wrapper" style={{ display: 'flex', alignItems: 'center', border: '2px solid var(--accent)', borderRadius: '24px', padding: '0.5rem 1rem' }}>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="搜索文章标题、内容或分类..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="search-input"
                            style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '1.05rem', color: 'var(--text-primary)' }}
                        />
                    </div>
                </div>

                <div className="search-results">
                    {loading && <div className="search-loading">正在加载数据... (这可能需要几秒钟)</div>}

                    {!loading && query.trim() !== '' && results.length === 0 && (
                        <div className="search-empty">没有找到与 &quot;{query}&quot; 相关的文章</div>
                    )}

                    {!loading && results.length > 0 && (
                        <ul className="search-list">
                            {results.map((post) => {
                                // Check if match is in content but not in title/description
                                const lowerQuery = query.toLowerCase();
                                const inTitleOrDesc =
                                    (post.title && post.title.toLowerCase().includes(lowerQuery)) ||
                                    (post.description && post.description.toLowerCase().includes(lowerQuery));

                                return (
                                    <li key={post.slug}>
                                        <Link href={`/blog/${post.slug}`} className="search-result-item" onClick={onClose}>
                                            <div className="search-result-title">
                                                {highlightMatch(post.title, query)}
                                            </div>

                                            {/* Show matched excerpt if found in description */}
                                            {(inTitleOrDesc && post.description) && (
                                                <div className="search-result-excerpt" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                                                    {highlightMatch(post.description, query)}
                                                </div>
                                            )}

                                            {(inTitleOrDesc && post.description) && (
                                                <div className="search-result-excerpt" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                                                    {highlightMatch(post.description, query)}
                                                </div>
                                            )}

                                            <div className="search-result-meta">
                                                <span>{highlightMatch(post.category || '未分类', query)}</span>
                                                <span>{new Date(post.date).toLocaleDateString('zh-CN')}</span>
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
