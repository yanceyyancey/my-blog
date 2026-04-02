'use client';

import { useState } from 'react';
import styles from './reading.module.css';

export default function AddBookModal({ gistId, onClose, onBooksAdded }) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        setLoading(true);
        // 初始化待处理列表，显示为“扫描中”
        setResults(lines.map(q => ({ query: q, status: 'pending' })));
        setDone(false);

        try {
            // Step 1: 调用 scrape API 批量处理
            const scrapeRes = await fetch('/api/reading/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ books: lines }),
            });
            const scrapeData = await scrapeRes.json();

            if (!scrapeRes.ok) throw new Error(scrapeData.error || '抓取失败');

            const successBooks = [];
            const finalResults = [];

            for (const item of scrapeData.results) {
                if (item.book) {
                    successBooks.push(item.book);
                    finalResults.push({ query: item.query, status: 'success', title: item.book.title, cover: item.book.coverUrl });
                } else {
                    finalResults.push({ query: item.query, status: 'error', error: item.error });
                }
            }

            setResults(finalResults);

            setResults(finalResults);

            // Step 2: 批量写入 Gist（从 N 次请求优化为 1 次）
            if (successBooks.length > 0) {
                try {
                    const res = await fetch('/api/reading/gist', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ gistId, action: 'batchAdd', books: successBooks }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    onBooksAdded(successBooks);
                } catch (err) {
                    console.error('批量更新 Gist 失败:', err);
                    showToast('同步到云端失败，请稍后重试', 'error');
                }
            }

            setDone(true);
        } catch (err) {
            setResults([{ query: '请求失败', success: false, error: err.message }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
            <div className={styles.modalCard}>
                <h2 className={styles.modalTitle}>📚 添加书籍到星图</h2>
                <p className={styles.modalSubtitle}>
                    每行输入一本书的名称或作者，系统会自动搜索封面、作者和地理信息。<br />
                    单次最多添加 20 本，请耐心等待（需约 1-2 分钟）。
                </p>

                <form onSubmit={handleSubmit}>
                    <textarea
                        className={styles.modalTextarea}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={'百年孤独\n三体\nThe Alchemist\n挪威的森林'}
                        disabled={loading || done}
                        rows={6}
                    />

                    {!done && (
                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className={styles.modalCancelBtn}
                                onClick={onClose}
                                disabled={loading}
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                className={styles.modalSubmitBtn}
                                disabled={loading || !input.trim()}
                            >
                                {loading ? '星际数据检索中...' : '开始导入'}
                            </button>
                        </div>
                    )}
                </form>

                {/* 进度结果网格 */}
                {results.length > 0 && (
                    <div className={styles.importGrid}>
                        {results.map((r, i) => (
                            <div key={i} className={styles.importItem} style={{ animationDelay: `${i * 0.1}s` }}>
                                {r.status === 'success' && r.cover ? (
                                    <img src={r.cover} className={styles.importItemCover} alt={r.title} />
                                ) : (
                                    <div className={styles.importItemCoverPending}>
                                        {r.status === 'success' ? '📚' : r.status === 'error' ? '❌' : '📡'}
                                    </div>
                                )}
                                <div className={styles.importItemTitle}>
                                    {r.status === 'success' ? r.title : r.query}
                                </div>
                                <div className={`${styles.importItemStatus} ${
                                    r.status === 'success' ? styles.statusSuccess :
                                    r.status === 'error' ? styles.statusError : styles.statusPending
                                }`}>
                                    {r.status === 'success' ? '已入库' : r.status === 'error' ? '失败' : '扫描中...'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {done && (
                    <div className={styles.modalActions} style={{ marginTop: '1.5rem' }}>
                        <button className={styles.modalSubmitBtn} onClick={onClose}>
                            完成，返回星图
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
