'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import styles from '@/components/reading/reading.module.css';
import BookHUD from '@/components/reading/BookHUD';
import AddBookModal from '@/components/reading/AddBookModal';

// 动态加载（防 SSR 报错）
const LoginScene = dynamic(() => import('@/components/reading/LoginScene'), { ssr: false });
const GalaxyScene = dynamic(() => import('@/components/reading/GalaxyScene'), { ssr: false });
const GlobeScene = dynamic(() => import('@/components/reading/GlobeScene'), { ssr: false });

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
    const [phase, setPhase] = useState('login'); // 'login' | 'loading' | 'galaxy'
    const [viewMode, setViewMode] = useState('galaxy'); // 'galaxy' | 'globe'
    const [transitioningTo, setTransitioningTo] = useState(null); // 'globe' 或 null
    const [user, setUser] = useState(null); // { code, gistId, isNew }
    const [books, setBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [autoFlyTarget, setAutoFlyTarget] = useState(null);

    // ---- 登录成功 ----
    const handleLogin = useCallback(async (userData) => {
        setUser(userData);
        setPhase('loading');

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

            // 新用户自动打开入库 modal
            if (userData.isNew || (data.books || []).length === 0) {
                setPhase('galaxy');
                setShowAddModal(true);
            } else {
                setPhase('galaxy');
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
        setBooks(prev => prev.filter(b => b.id !== bookId));
    }, []);

    // ---- 添加书成功后更新 ----
    const handleBooksAdded = useCallback((newBooks) => {
        setBooks(prev => [...newBooks, ...prev]);
    }, []);

    // ---- 搜索 ----
    const handleSearch = useCallback((e) => {
        if (e.key !== 'Enter') return;
        const q = searchText.toLowerCase().trim();
        if (!q) return;
        const found = books.find(b =>
            b.title?.toLowerCase().includes(q) ||
            b.author?.toLowerCase().includes(q)
        );
        if (found) setSelectedBook(found);
        else alert(`未在星图中找到关于"${q}"的书籍`);
    }, [searchText, books]);

    // 统计数据
    const uniqueCountries = new Set(books.map(b => b.country).filter(Boolean)).size;
    const withQuotes = books.filter(b => b.quote).length;

    return (
        <div className={styles.odysseyRoot}>

            {/* === 登录场景 === */}
            {phase === 'login' && <LoginScene onLogin={handleLogin} />}

            {/* === 加载中 === */}
            {phase === 'loading' && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.loadingSpinner} />
                    <span className={styles.loadingText}>加载 {user?.code} 的宇宙...</span>
                </div>
            )}

            {/* === 粒子星图场景 === */}
            {phase === 'galaxy' && (
                <>
                    {/* 3D 场景：粒子墙 or 地球 */}
                    {books.length > 0 ? (
                        <div className={styles.sceneWrapper} style={{ opacity: transitioningTo ? 0 : 1 }}>
                            {viewMode === 'globe' ? (
                                <GlobeScene 
                                    books={books} 
                                    onBookClick={(b) => {
                                        setAutoFlyTarget(null);
                                        setSelectedBook(b);
                                    }} 
                                    autoFlyTarget={autoFlyTarget} 
                                    isFocused={!!selectedBook}
                                />
                            ) : (
                                <GalaxyScene 
                                    books={books} 
                                    onBookClick={handleBookClick} 
                                    isExitingToGlobe={transitioningTo === 'globe'}
                                    onExited={() => {
                                        setViewMode('globe');
                                        setTransitioningTo(null);
                                    }}
                                />
                            )}
                        </div>
                    ) : (
                        <div className={styles.loadingOverlay} style={{ background: '#050508' }}>
                            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.95rem', textAlign: 'center' }}>
                                你的星图还没有书籍<br />
                                <span style={{ color: '#7c3aed', cursor: 'pointer' }} onClick={() => setShowAddModal(true)}>
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
                                        setTransitioningTo('globe'); // 触发 GalaxyScene 的离场飞行动画
                                    }}
                                    title="全球足迹"
                                >
                                    ◉ 地球
                                </button>
                            </div>
                            <div className={styles.searchBox}>
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                <input
                                    className={styles.searchInput}
                                    placeholder="搜索书名..."
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    onKeyDown={handleSearch}
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
                    onClose={() => setSelectedBook(null)}
                    onQuoteSaved={handleQuoteSaved}
                    onDelete={handleDelete}
                />
            )}

            {/* === 入库 Modal === */}
            {showAddModal && phase === 'galaxy' && (
                <AddBookModal
                    gistId={user?.gistId}
                    onClose={() => setShowAddModal(false)}
                    onBooksAdded={handleBooksAdded}
                />
            )}
        </div>
    );
}
