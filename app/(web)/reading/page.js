'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import styles from '@/components/reading/reading.module.css';
import BookHUD from '@/components/reading/BookHUD';
import AddBookModal from '@/components/reading/AddBookModal';

// 动态加载（防 SSR 报错）
const LoginScene = dynamic(() => import('@/components/reading/LoginScene'), { ssr: false });
const GalaxyScene = dynamic(() => import('@/components/reading/GalaxyScene'), { ssr: false });
const GlobeScene = dynamic(() => import('@/components/reading/GlobeScene'), { ssr: false });

const UNKNOWN_LABELS = new Set(['', '未知', '未知作者', '未知地点', 'unknown']);

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function hasMeaningfulValue(value) {
    return !UNKNOWN_LABELS.has(String(value || '').trim());
}

function bookNeedsEnrichment(book) {
    return !hasMeaningfulValue(book.author)
        || !hasMeaningfulValue(book.country)
        || !hasMeaningfulValue(book.authorCountry)
        || !hasMeaningfulValue(book.placeCountry)
        || !book.coverUrl;
}

function buildAuditPayload(book) {
    return {
        title: book.title || '',
        author: hasMeaningfulValue(book.author) ? book.author : '',
        country: hasMeaningfulValue(book.country) ? book.country : '',
    };
}

function mergeEnrichedBook(currentBook, enrichedBook) {
    if (!enrichedBook) return { book: currentBook, changed: false };

    const nextBook = { ...currentBook };
    let changed = false;

    const assignIfBetter = (key, nextValue, shouldReplace = false) => {
        if (nextValue === undefined || nextValue === null) return;
        const currentValue = nextBook[key];
        const nextHasValue = typeof nextValue === 'number'
            ? Number.isFinite(nextValue) && nextValue !== 0
            : hasMeaningfulValue(nextValue);
        const currentHasValue = typeof currentValue === 'number'
            ? Number.isFinite(currentValue) && currentValue !== 0
            : hasMeaningfulValue(currentValue);

        if ((shouldReplace || !currentHasValue) && nextHasValue && currentValue !== nextValue) {
            nextBook[key] = nextValue;
            changed = true;
        }
    };

    assignIfBetter('author', enrichedBook.author);
    assignIfBetter('coverUrl', enrichedBook.coverUrl);
    assignIfBetter('authorCountry', enrichedBook.authorCountry);
    assignIfBetter('authorCountryCode', enrichedBook.authorCountryCode);
    assignIfBetter('placeCountry', enrichedBook.placeCountry);
    assignIfBetter('placeCountryCode', enrichedBook.placeCountryCode);
    assignIfBetter('mapCountry', enrichedBook.mapCountry);
    assignIfBetter('mapCountryCode', enrichedBook.mapCountryCode);
    assignIfBetter('countrySource', enrichedBook.countrySource);
    assignIfBetter('country', enrichedBook.country, !hasMeaningfulValue(currentBook.country));
    assignIfBetter('countryCode', enrichedBook.countryCode);
    assignIfBetter('lat', enrichedBook.lat);
    assignIfBetter('lon', enrichedBook.lon);

    return { book: nextBook, changed };
}

export default function ReadingOdysseyPage() {
    // ---- 隐藏博客全局导航（沉浸模式）----
    useEffect(() => {
        document.body.classList.add('reading-odyssey-mode');
        const style = document.createElement('style');
        style.id = 'reading-nav-hide';
        style.textContent = `
            body.reading-odyssey-mode nav,
            body.reading-odyssey-mode header {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
        return () => {
            document.body.classList.remove('reading-odyssey-mode');
            document.getElementById('reading-nav-hide')?.remove();
        };
    }, []);

    // ---- 状态机 ----
    const [phase, setPhase] = useState('login'); // 'login' | 'galaxy'
    const [viewMode, setViewMode] = useState('galaxy'); // 'galaxy' | 'globe'
    const [transitioningTo, setTransitioningTo] = useState(null); // 'globe' 或 null
    const [user, setUser] = useState(null); // { code, gistId, isNew }
    const [books, setBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [autoFlyTarget, setAutoFlyTarget] = useState(null);
    const [toast, setToast] = useState(null);
    const [searchText, setSearchText] = useState(''); // 关键：补齐搜索状态
    const [galaxyEntryMode, setGalaxyEntryMode] = useState('intro');
    const [globeReady, setGlobeReady] = useState(false);
    const [awaitingGlobeReady, setAwaitingGlobeReady] = useState(false);
    const [globePrewarmEnabled, setGlobePrewarmEnabled] = useState(false);
    const [isAutoEnriching, setIsAutoEnriching] = useState(false);
    const galaxyRef = useRef(null);
    const globeReadyRef = useRef(false);
    const hasBooksRef = useRef(false);
    const transitioningToRef = useRef(null);
    const awaitingGlobeReadyRef = useRef(false);

    useEffect(() => {
        globeReadyRef.current = globeReady;
    }, [globeReady]);

    useEffect(() => {
        hasBooksRef.current = books.length > 0;
    }, [books.length]);

    useEffect(() => {
        transitioningToRef.current = transitioningTo;
    }, [transitioningTo]);

    useEffect(() => {
        awaitingGlobeReadyRef.current = awaitingGlobeReady;
    }, [awaitingGlobeReady]);

    const handleGlobeReadyChange = useCallback((ready) => {
        setGlobeReady(ready);
        if (ready && transitioningToRef.current === 'globe' && awaitingGlobeReadyRef.current) {
            setViewMode('globe');
            setTransitioningTo(null);
            setAwaitingGlobeReady(false);
        }
    }, []);

    // 关键：稳定回调引用，防止 GalaxyScene 与 Page 之间的状态同步死循环
    const handleExited = useCallback(() => {
        if (hasBooksRef.current && !globeReadyRef.current) {
            setAwaitingGlobeReady(true);
            return;
        }
        setViewMode('globe');
        setTransitioningTo(null);
        setAwaitingGlobeReady(false);
    }, []);

    const showToast = useCallback((msg, type = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ---- 登录成功 ----
    const handleLogin = useCallback(async (userData) => {
        setUser(userData);
        setGalaxyEntryMode('intro');
        setGlobeReady(false);
        setAwaitingGlobeReady(false);
        setGlobePrewarmEnabled(false);

        try {
            const url = new URL('/api/reading/gist', window.location.origin);
            url.searchParams.set('id', userData.gistId);

            const res = await fetch(url.toString(), {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store'
            });
            const data = await res.json();

            setBooks(data.books || []);
            setPhase('galaxy');
            if (userData.isNew || (data.books || []).length === 0) {
                setShowAddModal(true);
            }
        } catch (err) {
            console.error('读取书单失败:', err);
            setPhase('galaxy');
        }
    }, []);

    // ---- 点击粒子书 ----
    const handleBookClick = useCallback((book) => {
        if (viewMode === 'galaxy') {
            setAutoFlyTarget(book);
            setTransitioningTo('globe'); // 也要触发书墙飞入球体的动画
        } else {
            setSelectedBook(book);
        }
    }, [viewMode]);

    // ---- 金句保存后更新本地状态 ----
    const handleQuoteSaved = useCallback((updatedBook) => {
        setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
        setSelectedBook(updatedBook);
    }, []);

    // ---- 删除书后更新 ----
    const handleDelete = useCallback((bookId) => {
        setGlobeReady(false);
        setBooks(prev => prev.filter(b => b.id !== bookId));
    }, []);

    // ---- 添加书成功后更新 ----
    const handleBooksAdded = useCallback((newBooks) => {
        if (!Array.isArray(newBooks)) return;
        let firstNewBook = null;
        setGlobeReady(false);
        setBooks(prev => {
            const existingIds = new Set(prev.map(b => b.id));
            const importBaseTime = Date.now();
            const filteredNew = newBooks
                .filter(b => !existingIds.has(b.id))
                .map((book, index) => {
                    const ts = new Date(importBaseTime + index).toISOString();
                    return {
                        ...book,
                        metadataUpdatedAt: book.metadataUpdatedAt || ts,
                        textureSpotlightAt: book.textureSpotlightAt || ts,
                        texturePriorityBoost: book.texturePriorityBoost ?? (importBaseTime + index),
                    };
                });
            firstNewBook = filteredNew[0] || null;
            
            if (filteredNew.length < newBooks.length) {
                showToast(`已跳过 ${newBooks.length - filteredNew.length} 本重复书籍`);
            }
            if (filteredNew.length > 0) {
                showToast(`成功点亮 ${filteredNew.length} 颗星辰`, 'success');
            }
            return [...filteredNew, ...prev];
        });
        if (viewMode === 'globe' && firstNewBook) {
            setSelectedBook(null);
            setAutoFlyTarget(firstNewBook);
        }
    }, [showToast, viewMode]);

    useEffect(() => {
        if (phase !== 'galaxy' || books.length === 0) {
            setGlobePrewarmEnabled(false);
            return;
        }
        if (viewMode !== 'galaxy' || transitioningTo) {
            return;
        }
        const timer = window.setTimeout(() => {
            setGlobePrewarmEnabled(true);
        }, 1400);
        return () => window.clearTimeout(timer);
    }, [phase, books.length, viewMode, transitioningTo]);

    const handleAutoEnrich = useCallback(async () => {
        if (!user?.gistId || !books.length || isAutoEnriching) return;

        const targets = books.filter(bookNeedsEnrichment);
        if (targets.length === 0) {
            showToast('当前书单里的作者、国度和封面都比较完整', 'success');
            return;
        }

        setIsAutoEnriching(true);
        showToast(`正在巡检 ${targets.length} 本待补全书籍...`);

        try {
            const enrichedResults = [];
            const batches = chunkArray(targets, 20);
            const updateBaseTime = Date.now();

            for (const batch of batches) {
                const res = await fetch('/api/reading/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        books: batch.map(buildAuditPayload),
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '自动补全失败');
                enrichedResults.push(...(data.results || []));
            }

            const updates = [];
            let fixedCoverCount = 0;
            let fixedCountryCount = 0;

            targets.forEach((book, index) => {
                const enriched = enrichedResults[index]?.book || null;
                const { book: merged, changed } = mergeEnrichedBook(book, enriched);
                if (changed) {
                    const nextTimestamp = new Date(updateBaseTime + index).toISOString();
                    const coverJustAdded = !book.coverUrl && merged.coverUrl;
                    if (coverJustAdded) fixedCoverCount += 1;
                    if (!hasMeaningfulValue(book.country) && hasMeaningfulValue(merged.country)) fixedCountryCount += 1;
                    updates.push({
                        ...merged,
                        metadataUpdatedAt: nextTimestamp,
                        ...(coverJustAdded ? {
                            textureSpotlightAt: nextTimestamp,
                            texturePriorityBoost: updateBaseTime + index,
                        } : {}),
                    });
                }
            });

            if (!updates.length) {
                showToast('巡检完成，但暂时没有发现可自动补全的新信息');
                return;
            }

            const gistRes = await fetch('/api/reading/gist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gistId: user.gistId,
                    action: 'batchMerge',
                    books: updates,
                }),
            });
            const gistData = await gistRes.json();
            if (!gistRes.ok) throw new Error(gistData.error || '写入补全结果失败');

            const updatesById = new Map(updates.map(book => [book.id, book]));
            setGlobeReady(false);
            setBooks(prev => prev.map(book => updatesById.get(book.id) || book));
            setSelectedBook(prev => (prev && updatesById.get(prev.id)) ? updatesById.get(prev.id) : prev);

            showToast(`已补全 ${updates.length} 本书，封面 ${fixedCoverCount} 本，地点 ${fixedCountryCount} 本`, 'success');
        } catch (error) {
            console.error('自动补全失败:', error);
            showToast(`自动补全失败：${error.message}`, 'error');
        } finally {
            setIsAutoEnriching(false);
        }
    }, [books, isAutoEnriching, showToast, user?.gistId]);

    // ---- 搜索 ----
    const handleSearch = useCallback((manualQuery) => {
        const q = (typeof manualQuery === 'string' ? manualQuery : searchText).toLowerCase().trim();
        if (!q) return;
        
        const foundIdx = books.findIndex(b =>
            b.title?.toLowerCase().includes(q) ||
            b.author?.toLowerCase().includes(q)
        );
        
        if (foundIdx !== -1) {
            const found = books[foundIdx];
            if (viewMode === 'galaxy') {
                if (galaxyRef.current) {
                    galaxyRef.current.triggerHighlight(foundIdx, 1000); // 先闪烁一下
                    setTimeout(() => {
                        if (galaxyRef.current) {
                            galaxyRef.current.triggerBookDissolve(foundIdx, () => {
                                handleBookClick(found);
                                setSearchText(''); // 搜完清空
                            });
                        }
                    }, 800);
                } else {
                    handleBookClick(found);
                    setSearchText('');
                }
            } else {
                setAutoFlyTarget(found);
                setSelectedBook(found);
                setSearchText('');
            }
        } else {
            showToast(`未在星图中找到关于 "${q}" 的书籍`, 'error');
        }
    }, [searchText, books, viewMode, handleBookClick, showToast]);

    // 统计数据
    const uniqueCountries = new Set(books.map(b => b.country).filter(Boolean)).size;
    const withQuotes = books.filter(b => b.quote).length;
    const enrichableCount = books.filter(bookNeedsEnrichment).length;
    const shouldPrewarmGlobe = phase === 'galaxy' && books.length > 0 && globePrewarmEnabled;
    const shouldRenderGalaxy = phase === 'galaxy' && (viewMode === 'galaxy' || transitioningTo === 'globe');
    const shouldRenderGlobe = phase === 'galaxy' && (shouldPrewarmGlobe || viewMode === 'globe' || transitioningTo === 'globe');
    const globeVisible = viewMode === 'globe' || (transitioningTo === 'globe' && globeReady);

    return (
        <div className={styles.odysseyRoot}>

            {/* === 登录场景 === */}
            {phase === 'login' && <LoginScene onLogin={handleLogin} />}

            {/* === 粒子星图场景 === */}
            {phase === 'galaxy' && (
                <>
                    <div className={styles.sceneWrapper}>
                        {shouldRenderGlobe && (
                            <div className={globeVisible ? styles.visibleScene : styles.hiddenScene}>
                                <GlobeScene 
                                    books={books} 
                                    onBookClick={(b) => {
                                        if (!b) {
                                            setSelectedBook(null);
                                            return;
                                        }
                                        showToast(`正在聚焦于《${b.title}》...`);
                                        setAutoFlyTarget(null);
                                        setAwaitingGlobeReady(false);
                                        setTransitioningTo(null);
                                        setViewMode('globe');
                                        setSelectedBook(b);
                                    }} 
                                    autoFlyTarget={autoFlyTarget} 
                                    isFocused={!!selectedBook}
                                    visible={globeVisible}
                                    onReadyChange={handleGlobeReadyChange}
                                    autoFlyEnabled={viewMode === 'globe'}
                                />
                            </div>
                        )}
                        {shouldRenderGalaxy && (
                            <div className={(viewMode === 'galaxy' || transitioningTo === 'globe') ? styles.visibleScene : styles.hiddenScene}>
                                <GalaxyScene 
                                    ref={galaxyRef}
                                    books={books} 
                                    onBookClick={handleBookClick} 
                                    isExitingToGlobe={transitioningTo === 'globe'}
                                    onExited={handleExited}
                                    visible={viewMode === 'galaxy' || transitioningTo === 'globe'}
                                    entryMode={galaxyEntryMode}
                                />
                            </div>
                        )}
                    </div>

                    {books.length === 0 && (
                        <div className={styles.emptyOverlay}>
                            <p className={styles.emptyText}>
                                你的星图还没有书籍<br />
                                <span className={styles.addFirstBtn} onClick={() => setShowAddModal(true)}>
                                    点击添加第一本书 →
                                </span>
                            </p>
                        </div>
                    )}

                    {/* 顶部 UI 栏 */}
                    <div className={styles.sceneUI}>
                        <span className={styles.sceneTitle}>{user?.code}&apos;s odyssey</span>
                        <div className={styles.sceneActions}>
                            {/* 视图切换 */}
                            <div className={styles.viewToggle}>
                                <button
                                    className={`${styles.viewBtn} ${viewMode === 'galaxy' && !transitioningTo ? styles.viewBtnActive : ''}`}
                                    onClick={() => {
                                        if (viewMode === 'galaxy' || transitioningTo) return;
                                        setGalaxyEntryMode('resume');
                                        setAutoFlyTarget(null);
                                        setViewMode('galaxy');
                                    }}
                                    title="粒子书墙"
                                >
                                    ✦ 书墙
                                </button>
                                <button
                                    className={`${styles.viewBtn} ${viewMode === 'globe' || transitioningTo === 'globe' ? styles.viewBtnActive : ''}`}
                                    onClick={() => {
                                        if (viewMode === 'globe' || transitioningTo) return;
                                        // 手动切换至地球时，不应带有之前的自动飞行目标
                                        setAutoFlyTarget(null);
                                        setAwaitingGlobeReady(false);
                                        setTransitioningTo('globe'); // 触发 GalaxyScene 的离场飞行动画
                                    }}
                                    title="全球足迹"
                                >
                                    ◉ 地球
                                </button>
                            </div>
                            <div className={styles.searchBox}>
                                <svg 
                                    width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                                    style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}
                                    onClick={() => handleSearch()}
                                >
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                <input
                                    className={styles.searchInput}
                                    placeholder="搜索书名..."
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                            </div>

                            {/* 添加书籍 */}
                            <button className={styles.iconBtn} onClick={() => setShowAddModal(true)}>
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                                </svg>
                                添加书籍
                            </button>

                            {/* 退出 */}
                            <button className={styles.iconBtn} onClick={() => {
                                setPhase('login');
                                setUser(null);
                                setBooks([]);
                                setGalaxyEntryMode('intro');
                                setTransitioningTo(null);
                                setViewMode('galaxy');
                                setGlobeReady(false);
                                setAwaitingGlobeReady(false);
                                setAutoFlyTarget(null);
                                setSelectedBook(null);
                            }}>
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* 底部统计条 */}
                    {books.length > 0 && (
                        <div className={styles.statsBar}>
                            <div className={styles.statItem}>
                                <span className={styles.statNum}>{books.length}</span>
                                <span className={styles.statLabel}>Books</span>
                            </div>
                            <div className={styles.statItem}>
                                <span className={styles.statNum}>{uniqueCountries}</span>
                                <span className={styles.statLabel}>Countries</span>
                            </div>
                            <div className={styles.statItem}>
                                <span className={styles.statNum}>{withQuotes}</span>
                                <span className={styles.statLabel}>Quotes</span>
                            </div>
                        </div>
                    )}

                    {/* 返回博客 */}
                    <Link href="/" className={styles.backBtn}>
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                        </svg>
                        返回博客
                    </Link>
                </>
            )}

            {/* === HUD 书籍详情卡 === */}
            {selectedBook && phase === 'galaxy' && (
                <BookHUD
                    book={selectedBook}
                    gistId={user?.gistId}
                    showToast={showToast}
                    onClose={() => setSelectedBook(null)}
                    onQuoteSaved={handleQuoteSaved}
                    onDelete={handleDelete}
                />
            )}

            {/* === 入库 Modal === */}
            {showAddModal && phase === 'galaxy' && (
                <AddBookModal
                    gistId={user?.gistId}
                    showToast={showToast}
                    onClose={() => setShowAddModal(false)}
                    onBooksAdded={handleBooksAdded}
                    onAutoEnrich={handleAutoEnrich}
                    isAutoEnriching={isAutoEnriching}
                    totalBooks={books.length}
                    enrichableCount={enrichableCount}
                />
            )}
            {/* === 导航提示 (Toast) === */}
            {toast && (
                <div className={styles.toastContainer}>
                    <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}>
                        {toast.type === 'error' ? '✖' : '✔'} {toast.msg}
                    </div>
                </div>
            )}
        </div>
    );
}
