'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import styles from './reading.module.css';

const MOOD_LABELS = {
    default: { label: '默读', className: styles.moodDefault },
    melancholy: { label: '忧郁', className: styles.moodMelancholy },
    philosophy: { label: '思辨', className: styles.moodPhilosophy },
    joy: { label: '愉悦', className: styles.moodJoy },
    dark: { label: '沉重', className: styles.moodDark },
};

export default function BookHUD({ book, gistId, onClose, onQuoteSaved, onDelete, showToast }) {
    const [isEditing, setIsEditing] = useState(false);
    const [quoteText, setQuoteText] = useState(book.quote || '');
    const [selectedMood, setSelectedMood] = useState(book.mood || 'default');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const textareaRef = useRef(null);

    const mood = MOOD_LABELS[book.mood] || MOOD_LABELS.default;

    const handleEditClick = () => {
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleSaveQuote = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/reading/gist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gistId,
                    action: 'updateBook',
                    book: { id: book.id, quote: quoteText, mood: selectedMood }
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setIsEditing(false);
            onQuoteSaved?.({ ...book, quote: quoteText, mood: selectedMood });
            showToast?.('感悟已连接至星图', 'success');
        } catch (err) {
            showToast?.('连接失败：' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = () => {
        setShowConfirmDelete(true);
    };

    const performDelete = async () => {
        setDeleting(true);
        try {
            const res = await fetch('/api/reading/gist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gistId, action: 'remove', book: { id: book.id } }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onDelete?.(book.id);
            onClose();
            showToast?.('星核已移除', 'success');
        } catch (err) {
            showToast?.('移除失败：' + err.message, 'error');
        } finally {
            setDeleting(false);
            setShowConfirmDelete(false);
        }
    };

    return (
        <div className={styles.hudOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.hudCard}>
                <button className={styles.hudClose} onClick={onClose} aria-label="关闭">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* 书籍信息区 */}
                <div className={styles.hudBookInfo}>
                    {book.coverUrl ? (
                        <Image
                            src={book.coverUrl}
                            alt={book.title}
                            className={styles.hudCover}
                            width={80}
                            height={107}
                            unoptimized
                        />
                    ) : (
                        <div className={styles.hudCoverPlaceholder}>📚</div>
                    )}
                    <div className={styles.hudMeta}>
                        <h2 className={styles.hudTitle}>{book.title}</h2>
                        <p className={styles.hudAuthor}>{book.author}</p>
                        <div className={styles.hudCountry}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {book.country || '未知地点'}
                        </div>
                        <div>
                            <span className={`${styles.moodBadge} ${mood.className}`}>
                                {mood.label}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 金句区 */}
                <div className={styles.quoteSection}>
                    <div className={styles.quoteSectionLabel}>读书笔记</div>

                    {isEditing ? (
                        <>
                                <div className={styles.moodSelector}>
                                    {Object.entries(MOOD_LABELS).map(([m, { label, className }]) => (
                                        <button
                                            key={m}
                                            className={`${styles.moodOption} ${m === selectedMood ? styles.moodOptionActive : ''} ${className}`}
                                            onClick={() => setSelectedMood(m)}
                                            title={label}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    ref={textareaRef}
                                    className={styles.quoteTextarea}
                                    value={quoteText}
                                    onChange={(e) => setQuoteText(e.target.value)}
                                    placeholder="写下触动你的那句话..."
                                    rows={4}
                                />
                                <div className={styles.quoteActions}>
                                    <button className={styles.quoteCancelBtn} onClick={() => {
                                        setIsEditing(false);
                                        setQuoteText(book.quote || '');
                                        setSelectedMood(book.mood || 'default');
                                    }}>取消</button>
                                <button
                                    className={styles.quoteSaveBtn}
                                    onClick={handleSaveQuote}
                                    disabled={saving}
                                >
                                    {saving ? '保存中...' : '保存'}
                                </button>
                            </div>
                        </>
                    ) : book.quote ? (
                        <p className={styles.quoteText} onClick={handleEditClick} title="点击编辑">
                            &quot;{book.quote}&quot;
                        </p>
                    ) : (
                        <p className={styles.quotePlaceholder} onClick={handleEditClick}>
                            此处尚无感悟，点击添加你的第一句读书笔记...
                        </p>
                    )}
                </div>

                {/* 删除 */}
                <button className={styles.hudDeleteBtn} onClick={handleDeleteClick} disabled={deleting}>
                    {deleting ? '移除中...' : '从星图中移除这本书'}
                </button>

                {/* 确认删除 Overlay */}
                {showConfirmDelete && (
                    <div className={styles.hudConfirmDelete}>
                        <div className={styles.confirmTitle}>确认移除？</div>
                        <div className={styles.confirmText}>
                            《{book.title}》将从你的星图中永久消失，<br />
                            但你随时可以重新搜索并添加它。
                        </div>
                        <div className={styles.confirmActions}>
                            <button className={`${styles.confirmBtn} ${styles.confirmBtnNo}`} onClick={() => setShowConfirmDelete(false)}>
                                留着它
                            </button>
                            <button className={`${styles.confirmBtn} ${styles.confirmBtnYes}`} onClick={performDelete} disabled={deleting}>
                                {deleting ? '正在移除...' : '确认移除'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
