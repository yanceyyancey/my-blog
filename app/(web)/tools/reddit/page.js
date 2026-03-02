'use client';

import { useState } from 'react';
import Navigation from '@/components/Navigation';

export default function RedditScraperPage() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    const handleScrape = async (e) => {
        e.preventDefault();
        if (!url) return;

        setLoading(true);
        setError(null);
        setResult(null);

        // 新的纯前端代理请求逻辑，彻底抛弃容易被封的后端 API
        try {
            let jsonUrl = url;
            if (!jsonUrl.endsWith('.json')) {
                jsonUrl = jsonUrl.replace(/\/$/, '') + '/.json';
            }

            // 使用免费的公共 CORS 代理，让请求完全看起来像普通的浏览器前端请求
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(jsonUrl)}`;

            const res = await fetch(proxyUrl);
            if (!res.ok) {
                throw new Error(`网络限制或链接失效 (状态码: ${res.status})。请尝试更换链接或检查网络。`);
            }

            const data = await res.json();

            // 在前端直接解析数据
            const postTitle = data[0]?.data?.children?.[0]?.data?.title || 'Unknown Title';
            const commentsData = data[1]?.data?.children || [];
            const extracted = [];

            for (const item of commentsData) {
                if (item.kind === 'more') continue;

                const body = item.data?.body || '';
                const author = item.data?.author || '';
                const score = item.data?.ups || 0;

                // 复用之前的过滤条件
                if (author && !["[deleted]", "[removed]", "AutoModerator"].includes(author) &&
                    body && !["[deleted]", "[removed]"].includes(body) &&
                    score >= 1 && body.split(/\s+/).length >= 3) {

                    // 清理掉多余换行
                    let cleanedBody = body.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

                    extracted.push({ author, score, body: cleanedBody });
                }
            }

            setResult({
                title: postTitle,
                count: extracted.length,
                comments: extracted
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
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
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 font-sans text-gray-800">
            <Navigation />

            {/* 居中且充满视觉冲击力的 Hero 区域 */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 pt-32 text-center">
                <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 drop-shadow-sm px-2 break-words">
                    Reddit Comment Miner
                </h1>
                <p className="text-xl text-gray-500 mb-12 leading-relaxed max-w-2xl mx-auto font-light px-4 break-words">
                    Extract, filter, and export high-quality Reddit discussions directly into an organized CSV spreadsheet in seconds.
                </p>

                {/* 增大尺寸并且极具现代感的输入框 */}
                <form onSubmit={handleScrape} className="mb-12 relative z-10 max-w-3xl mx-auto">
                    <div className="relative flex items-center group">
                        <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                            <svg className="w-8 h-8 text-gray-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                        </div>
                        <input
                            type="url"
                            placeholder="Paste your Reddit post link here..."
                            required
                            className="w-full pl-16 pr-40 py-6 text-xl rounded-2xl border-2 border-white focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 placeholder-gray-300 shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all bg-white/80 backdrop-blur-md"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={loading || !url}
                            className={`absolute right-3 top-3 bottom-3 px-8 rounded-xl font-bold text-lg text-white shadow-lg transition-all ${loading
                                ? 'bg-blue-400/80 cursor-not-allowed scale-95'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl active:scale-95'
                                }`}
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Mining...
                                </span>
                            ) : 'Extract Now'}
                        </button>
                    </div>
                </form>

                {/* 悬浮风格的错误提示 */}
                {error && (
                    <div className="max-w-2xl mx-auto p-5 mb-8 rounded-2xl bg-red-50/90 backdrop-blur-sm border-2 border-red-100 text-red-700 shadow-md animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95">
                        <p className="font-bold flex items-center justify-center gap-2 text-lg">
                            <span className="p-1.5 bg-red-100 rounded-full">
                                <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                            </span>
                            Whoops! {error}
                        </p>
                    </div>
                )}

                {/* 玻璃拟物态的抓取结果容器 */}
                {result && (
                    <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden animate-in slide-in-from-bottom-8 duration-700 max-w-5xl mx-auto text-left relative z-10">
                        <div className="p-8 border-b border-gray-100/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-gradient-to-r from-gray-50/50 to-white/30">
                            <div className="flex-1">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold tracking-wide uppercase mb-3">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                    Extraction Complete
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 line-clamp-2 leading-tight" title={result.title}>
                                    {result.title}
                                </h3>
                                <p className="text-gray-500 mt-2 font-medium">
                                    Found <strong className="text-gray-900 bg-yellow-100 px-1 py-0.5 rounded">{result.count}</strong> high-quality comments matching filters.
                                </p>
                            </div>

                            <button
                                onClick={downloadCSV}
                                className="flex-shrink-0 flex items-center justify-center gap-3 w-full md:w-auto px-6 py-4 bg-gray-900 hover:bg-black text-white text-base font-bold rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Download CSV
                            </button>
                        </div>

                        {/* 评论预览卡片列表 - 美化的暗色阴影与边框 */}
                        <div className="p-6 bg-gray-50/50 max-h-[600px] overflow-y-auto space-y-4">
                            {result.comments.length > 0 ? (
                                result.comments.map((comment, index) => (
                                    <div key={index} className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-blue-700 font-bold shadow-inner">
                                                    {comment.author.charAt(0).toUpperCase() || 'U'}
                                                </div>
                                                <div>
                                                    <span className="block font-bold text-sm text-gray-900">u/{comment.author}</span>
                                                    <span className="block text-xs text-gray-400 mt-0.5">Reddit User</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100 text-orange-700 font-bold text-sm shadow-sm">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
                                                {comment.score}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-gray-700 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                                                {comment.body}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-16 text-center">
                                    <div className="inline-flex w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-4">
                                        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                    </div>
                                    <h4 className="text-lg font-bold text-gray-900 mb-1">No relevant comments</h4>
                                    <p className="text-gray-500 max-w-sm mx-auto">All fetched comments were either heavily downvoted, deleted, or too short to be considered extremely useful.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 装饰性背景 */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-400/10 blur-[120px]"></div>
            </div>
        </div>
    );
}
