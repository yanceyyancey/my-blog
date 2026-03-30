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
        setResults([]);
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
            const displayResults = [];

            for (const item of scrapeData.results) {
                if (item.book) {
                    successBooks.push(item.book);
                    displayResults.push({ query: item.query, success: true, title: item.book.title });
                } else {
                    displayResults.push({ query: item.query, success: false, error: item.error });
                }
            }

            setResults(displayResults);

            // Step 2: 将成功解析的书籍逐一写入 Gist
            const addedBooks = [];
            for (const book of successBooks) {
                try {
                    const res = await fetch('/api/reading/gist', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ gistId, action: 'add', book }),
                    });
                    const data = await res.json();
                    if (res.ok) addedBooks.push(book);
                } catch (err) {
                    console.warn('写入 Gist 失败:', err);
                }
            }

            if (addedBooks.length > 0) {
                onBooksAdded(addedBooks);
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

                {/* 进度结果 */}
                {results.length > 0 && (
                    <div className={styles.importResult}>
                        {results.map((r, i) => (
                            <div
                                key={i}
                                className={`${styles.importResultItem} ${r.success ? styles.success : styles.error}`}
                            >
                                <span>{r.success ? '✅' : '❌'}</span>
                                <span>
                                    {r.success
                                        ? `《${r.title}》已加入星图`
                                        : `「${r.query}」— ${r.error}`
                                    }
                                </span>
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
