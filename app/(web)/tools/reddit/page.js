'use client';

import { useState } from 'react';
import Navigation from '@/components/Navigation';
import styles from './reddit.module.css';

export default function RedditScraperPage() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [fallbackStatus, setFallbackStatus] = useState('');

    const handleScrape = async (e) => {
        e.preventDefault();
        if (!url) return;

        setLoading(true);
        setError(null);
        setResult(null);
        setFallbackStatus('');

        try {
            // Step 1: Attempt Server-Side Scraping (Vercel Backend)
            const res = await fetch(`/api/scrape-reddit?url=${encodeURIComponent(url)}`);
            const data = await res.json();

            // Step 2: Check for Server IP blocks (Needs Client Fallback)
            if (data.needsClientSideFallback) {
                setFallbackStatus('Vercel 服务器已被限流，正在尝试从您的本地浏览器抓取 (Hybrid Mode)...');
                await runClientSideFallback(data.postId, url);
                return;
            }

            if (!res.ok) {
                throw new Error(data.error || '抓取失败，请检查链接或稍后再试');
            }

            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            if (!fallbackStatus) setLoading(false);
        }
    };

    // Phase 2: Client-Side Browser Fallback (Uses User Residential IP)
    const runClientSideFallback = async (postId, originalUrl) => {
        const corsProxies = [
            (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
            (url) => `https://api.codetabs.com/v1/proxy?quest=${url}`,
            (url) => `https://thingproxy.freeboard.io/fetch/${url}`
        ];

        let success = false;
        let redditJson = null;

        for (const getProxyUrl of corsProxies) {
            try {
                const targetUrl = `https://www.reddit.com/comments/${postId}.json`;
                const proxyUrl = getProxyUrl(targetUrl);

                // Add a timeout to avoid hanging on a bad proxy
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);

                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) continue;

                const data = await response.text();
                redditJson = JSON.parse(data);

                if (redditJson && Array.isArray(redditJson) && redditJson[0]) {
                    success = true;
                    break;
                }
            } catch (err) {
                console.warn('CORS Proxy failed:', err);
                continue;
            }
        }

        if (!success || !redditJson) {
            setError('浏览器本地代理抓取失败。这通常是由于您的网络坏境（如防火墙或广告拦截插件）阻断了跨域请求。请尝试刷新页面或换个网络再试。');
            setLoading(false);
            setFallbackStatus('');
            return;
        }

        try {
            // Basic parsing of Reddit JSON structure (post is [0], comments are [1])
            const postInfo = redditJson[0].data.children[0].data;
            const commentsContainer = redditJson[1].data.children;

            const extracted = [];

            // Apply similar high-quality filtering logic as the backend
            commentsContainer.forEach(child => {
                if (child.kind === 't1') {
                    const c = child.data;
                    const author = c.author || '';
                    const body = c.body || '';
                    const score = c.score || 0;

                    // Robust Author check: handle both u/name and name
                    const cleanAuthor = author.replace(/^u\//, '').toLowerCase();
                    const isBlacklisted = ["deleted", "removed", "automoderator"].includes(cleanAuthor);

                    if (author && !isBlacklisted &&
                        body && !["[deleted]", "[removed]"].includes(body)) {

                        if (body.split(/\s+/).length >= 3) {
                            const cleanedBody = body.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
                            extracted.push({
                                author: author,
                                score: score,
                                body: cleanedBody
                            });
                        }
                    }
                }
            });

            if (extracted.length === 0) {
                throw new Error('成功从浏览器抓取，但该帖子下没有发现符合质量条件的有效评论');
            }

            setResult({
                title: postInfo.title,
                count: extracted.length,
                comments: extracted,
                source: 'Browser-Direct (Hybrid Local)'
            });
            setFallbackStatus('Success: 本地代理抓取已完成');

        } catch (err) {
            setError(`解析抓取内容失败: ${err.message}`);
        } finally {
            setLoading(false);
            setFallbackStatus('');
        }
    };

    const downloadCSV = () => {
        if (!result || !result.comments || result.comments.length === 0) return;

        const headers = ['Author,Score,Body'];
        const rows = result.comments.map(c => {
            const safeBody = `"${c.body.replace(/"/g, '""')}"`;
            return `${c.author},${c.score},${safeBody}`;
        });

        const csvContent = headers.concat(rows).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const urlBlob = URL.createObjectURL(blob);
        link.setAttribute('href', urlBlob);

        const timestamp = new Date().getTime();
        link.setAttribute('download', `reddit_comments_${timestamp}.csv`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <Navigation />
            <main className={styles.container}>
                <div className={styles.hero}>
                    <h1 className={styles.title}>
                        Reddit Comment Miner
                    </h1>
                    <p className={styles.subtitle}>
                        Extract, filter, and export high-quality Reddit discussions directly into an organized CSV spreadsheet in seconds.
                    </p>
                </div>

                <form onSubmit={handleScrape} className={styles.formBox}>
                    <div className={styles.inputIcon}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </div>
                    <input
                        type="url"
                        placeholder="Paste your Reddit post link here..."
                        required
                        className={styles.input}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !url}
                        className={styles.submitBtn}
                    >
                        {loading ? (
                            <>
                                <svg className={styles.spinAnimation} width="20" height="20" viewBox="0 0 24 24">
                                    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {fallbackStatus ? 'Capturing Local...' : 'Extracting...'}
                            </>
                        ) : 'Extract Now'}
                    </button>
                </form>

                {fallbackStatus && (
                    <div className={styles.errorBox} style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent)' }}>
                        <div className={styles.pulseDot}></div>
                        {fallbackStatus}
                    </div>
                )}

                {error && (
                    <div className={styles.errorBox}>
                        <div className={styles.errorIcon}>
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                        </div>
                        Whoops! {error}
                    </div>
                )}

                {result && (
                    <div className={styles.resultContainer}>
                        <div className={styles.resultHeader}>
                            <div className={styles.resultInfo}>
                                <div className={styles.statusBadge}>
                                    <span className={styles.pulseDot}></span>
                                    {result.source.includes('Browser') ? 'Hybrid (Safe) Mode Active' : 'Extraction Complete'}
                                </div>
                                <h3 className={styles.resultTitle} title={result.title}>
                                    {result.title}
                                </h3>
                                <p className={styles.resultMeta}>
                                    Found <span className={styles.highlightCount}>{result.count}</span> high-quality comments via <span className={styles.highlightCount}>{result.source}</span>.
                                </p>
                            </div>

                            <button onClick={downloadCSV} className={styles.downloadBtn}>
                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Download CSV
                            </button>
                        </div>

                        <div className={styles.commentsList}>
                            {result.comments.length > 0 ? (
                                result.comments.map((comment, index) => (
                                    <div key={index} className={styles.commentCard}>
                                        <div className={styles.commentTop}>
                                            <div className={styles.commentAuthorBox}>
                                                <div className={styles.authorAvatar}>
                                                    {comment.author.charAt(0).toUpperCase() || 'U'}
                                                </div>
                                                <div className={styles.authorData}>
                                                    <span className={styles.authorName}>u/{comment.author}</span>
                                                    <span className={styles.authorSub}>Reddit User</span>
                                                </div>
                                            </div>
                                            <div className={styles.scoreBadge}>
                                                <svg className={styles.scoreIcon} width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
                                                {comment.score}
                                            </div>
                                        </div>
                                        <div className={styles.commentBody}>
                                            {comment.body}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className={styles.emptyState}>
                                    <div className={styles.emptyIcon}>
                                        <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                    </div>
                                    <h4 className={styles.emptyTitle}>No relevant comments</h4>
                                    <p className={styles.emptyDesc}>All fetched comments were either heavily downvoted, deleted, or too short to be considered extremely useful.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}
