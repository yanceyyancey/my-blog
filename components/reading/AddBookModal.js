'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import styles from './reading.module.css';

const IMPORT_MODES = {
    smart: {
        label: '智能粘贴',
        hint: '支持一行一本，也支持分号、顿号、列表粘贴；推荐用“书名 / 作者 / 国度”。',
        placeholder: '百年孤独\n流俗地 / 黎紫书 / 马来西亚\nThe Left Hand of Darkness / Ursula K. Le Guin / United States',
    },
    isbn: {
        label: 'ISBN / 链接',
        hint: '支持 ISBN、OpenLibrary 链接，以及带 ISBN 的网页链接。',
        placeholder: '9787544270878\nhttps://openlibrary.org/isbn/9780141182803',
    },
};

function normalizeLine(line) {
    return line
        .replace(/^[\s>*\-•\d\.\)\(]+/, '')
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .trim();
}

function extractIdentifier(line, mode) {
    const normalized = normalizeLine(line);
    if (!normalized) return '';

    const urlDecoded = decodeURIComponent(normalized);
    const isbnMatch = urlDecoded.match(/(?:isbn(?:-1[03])?[/:=\s-]*)?([0-9Xx-]{10,17})/i);
    const cleanIsbn = isbnMatch?.[1]?.replace(/-/g, '');

    if (mode === 'isbn') {
        if (cleanIsbn && /^[0-9Xx]{10,13}$/.test(cleanIsbn)) {
            return cleanIsbn.toUpperCase();
        }
        const openLibraryIsbn = urlDecoded.match(/openlibrary\.org\/isbn\/([0-9Xx-]+)/i)?.[1];
        if (openLibraryIsbn) {
            return openLibraryIsbn.replace(/-/g, '').toUpperCase();
        }
    }

    return normalized;
}

function parseImportEntries(rawInput, mode) {
    if (!rawInput) return [];

    const normalized = rawInput.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    let chunks = normalized
        .split('\n')
        .flatMap(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return [];

            if (mode === 'smart') {
                return trimmedLine
                    .split(/[；;]+/g)
                    .flatMap(part => {
                        const cleanPart = part.trim();
                        const commaCount = (cleanPart.match(/[，,]/g) || []).length;
                        if (commaCount >= 2 && !cleanPart.includes('http')) {
                            return cleanPart.split(/[，,]/g);
                        }
                        return [cleanPart];
                    });
            }

            return [trimmedLine];
        })
        .map(line => extractIdentifier(line, mode))
        .filter(Boolean);

    const seen = new Set();
    chunks = chunks.filter(item => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return chunks;
}

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

export default function AddBookModal({
    gistId,
    onClose,
    onBooksAdded,
    showToast,
    onAutoEnrich,
    isAutoEnriching = false,
    totalBooks = 0,
    enrichableCount = 0,
}) {
    const [input, setInput] = useState('');
    const [importMode, setImportMode] = useState('smart');
    const [inputSource, setInputSource] = useState('manual');
    const [fileLabel, setFileLabel] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [done, setDone] = useState(false);
    const [pendingBooks, setPendingBooks] = useState([]);
    const [syncError, setSyncError] = useState('');
    const fileInputRef = useRef(null);
    const isBusy = loading || isAutoEnriching;
    const hasLibraryBooks = totalBooks > 0;
    const canAutoEnrich = enrichableCount > 0 && typeof onAutoEnrich === 'function';

    const auditMessage = !hasLibraryBooks
        ? '先导入第一批书，之后就可以在这里巡检缺封面、缺作者和缺国度的条目。'
        : canAutoEnrich
            ? `当前有 ${enrichableCount} 本书缺封面或关键信息，可直接一键补全。`
            : '当前书库里的封面、作者和国度信息已经比较完整。';

    const markSyncState = (nextSyncState, syncMessage = '') => {
        setResults(prev => prev.map(item => {
            if (item.status !== 'success') return item;
            return {
                ...item,
                syncState: nextSyncState,
                syncMessage,
            };
        }));
    };

    const syncBooksToGist = async (booksToSync) => {
        if (!booksToSync.length) return true;

        markSyncState('syncing');

        try {
            const res = await fetch('/api/reading/gist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gistId, action: 'batchAdd', books: booksToSync }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const addedIdSet = new Set(data.addedIds || []);
            const skippedIdSet = new Set(data.skippedIds || []);
            const addedBooks = booksToSync.filter(book => addedIdSet.has(book.id));
            if (skippedIdSet.size > 0) {
                showToast?.(`已跳过 ${skippedIdSet.size} 本重复书籍`);
            }

            setResults(prev => prev.map(item => {
                if (item.status !== 'success') return item;
                if (skippedIdSet.has(item.bookId)) {
                    return { ...item, syncState: 'duplicate', syncMessage: '已在书库中' };
                }
                if (addedIdSet.has(item.bookId)) {
                    return { ...item, syncState: 'synced', syncMessage: '' };
                }
                return item;
            }));

            if (addedBooks.length > 0) {
                onBooksAdded(addedBooks, { source: inputSource === 'file' ? 'file' : importMode });
            }
            setPendingBooks([]);
            setSyncError('');
            return true;
        } catch (err) {
            console.error('批量更新 Gist 失败:', err);
            markSyncState('syncError', err.message || '同步到云端失败');
            setPendingBooks(booksToSync);
            setSyncError(err.message || '同步到云端失败，请稍后重试');
            showToast?.('同步到云端失败，请稍后重试', 'error');
            return false;
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const entries = parseImportEntries(input, importMode);
        if (entries.length === 0) {
            showToast?.('没有识别到可导入的书籍信息', 'error');
            return;
        }
        if (entries.length > 20) {
            showToast?.('单次最多导入 20 本书，请分批添加', 'error');
            return;
        }

        setLoading(true);
        setSyncError('');
        setPendingBooks([]);
        // 初始化待处理列表，显示为“扫描中”
        setResults(entries.map(q => ({ query: q, status: 'pending' })));
        setDone(false);

        try {
            // Step 1: 调用 scrape API 批量处理
            const scrapeRes = await fetch('/api/reading/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ books: entries }),
            });
            const scrapeData = await scrapeRes.json();

            if (!scrapeRes.ok) throw new Error(scrapeData.error || '抓取失败');

            const successBooks = [];
            const finalResults = [];

            for (const item of scrapeData.results) {
                if (item.book) {
                    successBooks.push(item.book);
                    finalResults.push({
                        query: item.query,
                        bookId: item.book.id,
                        status: 'success',
                        syncState: 'pending',
                        title: item.book.title,
                        author: item.book.author,
                        country: item.book.country,
                        cover: item.book.coverUrl,
                    });
                } else {
                    finalResults.push({ query: item.query, status: 'error', error: item.error });
                }
            }

            setResults(finalResults);

            // Step 2: 批量写入 Gist（从 N 次请求优化为 1 次）
            if (successBooks.length > 0) {
                const importBaseTime = Date.now();
                const booksForSync = successBooks.map((book, index) => {
                    const ts = new Date(importBaseTime + index).toISOString();
                    return {
                        ...book,
                        metadataUpdatedAt: book.metadataUpdatedAt || ts,
                        textureSpotlightAt: book.textureSpotlightAt || ts,
                        texturePriorityBoost: book.texturePriorityBoost ?? (importBaseTime + index),
                    };
                });
                const synced = await syncBooksToGist(booksForSync);
                if (!synced) {
                    return;
                }
            }

            setDone(true);
        } catch (err) {
            setResults([{ query: '请求失败', status: 'error', error: err.message }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
            <div className={styles.modalCard}>
                <h2 className={styles.modalTitle}>📚 添加书籍到星图</h2>
                <p className={styles.modalSubtitle}>
                    在这里导入新书，也可以顺手巡检旧书。<br />
                    支持智能粘贴、ISBN/链接，以及本地 `txt/csv` 文件导入；单次最多添加 20 本。
                </p>

                <div className={styles.libraryAuditRow}>
                    <div className={styles.libraryAuditContent}>
                        <span className={styles.libraryAuditEyebrow}>书库巡检</span>
                        <div className={styles.libraryAuditTitle}>把缺封面、缺作者、缺国度的书一起补齐</div>
                        <p className={styles.libraryAuditText}>{auditMessage}</p>
                    </div>
                    {hasLibraryBooks && (
                        <button
                            type="button"
                            className={styles.libraryAuditBtn}
                            onClick={onAutoEnrich}
                            disabled={isAutoEnriching || !canAutoEnrich || loading}
                        >
                            {isAutoEnriching ? '补全中...' : canAutoEnrich ? '自动补全' : '无需补全'}
                        </button>
                    )}
                </div>

                {syncError && (
                    <div className={styles.modalErrorBanner}>
                        云端同步失败：{syncError}
                    </div>
                )}

                <div className={styles.importModeTabs}>
                    {Object.entries(IMPORT_MODES).map(([mode, config]) => (
                        <button
                            key={mode}
                            type="button"
                            className={`${styles.importModeBtn} ${importMode === mode ? styles.importModeBtnActive : ''}`}
                            onClick={() => {
                                setImportMode(mode);
                                setInputSource('manual');
                                setFileLabel('');
                            }}
                            disabled={isBusy}
                        >
                            {config.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={styles.importModeBtn}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBusy}
                    >
                        文件导入
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.csv,text/plain,text/csv"
                        className={styles.hiddenFileInput}
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            try {
                                const content = await readFileContent(file);
                                setInput(content);
                                setInputSource('file');
                                setFileLabel(file.name);
                                setDone(false);
                                setResults([]);
                                setSyncError('');
                                showToast?.(`已载入文件：${file.name}`, 'success');
                            } catch (err) {
                                showToast?.(err.message || '文件读取失败', 'error');
                            } finally {
                                e.target.value = '';
                            }
                        }}
                    />
                </div>

                <div className={styles.importHintRow}>
                    <span className={styles.importHintText}>{IMPORT_MODES[importMode].hint}</span>
                    {fileLabel && <span className={styles.importHintFile}>文件: {fileLabel}</span>}
                </div>

                <form onSubmit={handleSubmit}>
                    <textarea
                        className={styles.modalTextarea}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            if (inputSource !== 'manual') {
                                setInputSource('manual');
                                setFileLabel('');
                            }
                        }}
                        placeholder={IMPORT_MODES[importMode].placeholder}
                        disabled={isBusy || done}
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
                                disabled={isBusy || !input.trim()}
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
                                    <Image
                                        src={r.cover}
                                        className={styles.importItemCover}
                                        alt={r.title}
                                        width={60}
                                        height={80}
                                        unoptimized
                                    />
                                ) : (
                                    <div className={styles.importItemCoverPending}>
                                        {r.status === 'success' ? '📚' : r.status === 'error' ? '❌' : '📡'}
                                    </div>
                                )}
                                <div className={styles.importItemTitle}>
                                    {r.status === 'success' ? r.title : r.query}
                                </div>
                                {r.status === 'success' && (r.author || r.country) && (
                                    <div className={styles.importItemMeta}>
                                        {[r.author, r.country].filter(Boolean).join(' · ')}
                                    </div>
                                )}
                                <div className={`${styles.importItemStatus} ${
                                    r.status === 'success' && r.syncState !== 'syncError' ? styles.statusSuccess :
                                    r.status === 'error' ? styles.statusError : styles.statusPending
                                }`}>
                                    {r.status === 'success'
                                        ? (
                                            r.syncState === 'syncing' ? '同步中...'
                                            : r.syncState === 'duplicate' ? '重复跳过'
                                            : r.syncState === 'syncError' ? '待重试'
                                            : '已入库'
                                        )
                                        : r.status === 'error' ? '失败' : '扫描中...'}
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

                {!done && syncError && pendingBooks.length > 0 && (
                    <div className={styles.modalActions} style={{ marginTop: '1.5rem' }}>
                        <button
                            type="button"
                            className={styles.modalCancelBtn}
                            onClick={onClose}
                            disabled={loading}
                        >
                            先关闭
                        </button>
                        <button
                            type="button"
                            className={styles.modalSubmitBtn}
                            onClick={async () => {
                                setLoading(true);
                                const synced = await syncBooksToGist(pendingBooks);
                                setLoading(false);
                                if (synced) {
                                    setDone(true);
                                }
                            }}
                            disabled={isBusy}
                        >
                            {loading ? '重试同步中...' : '重试同步'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
