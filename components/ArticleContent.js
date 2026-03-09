'use client';

import { useEffect, useRef } from 'react';

export default function ArticleContent({ contentHtml }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current) return;

        // ── 1. TABLE STYLES (fixed, no scrolling) ──────────────────────────────
        const tables = ref.current.querySelectorAll('table');
        tables.forEach(table => {
            Object.assign(table.style, {
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem',
                margin: '2rem 0',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-sm)',
                tableLayout: 'fixed',       // Prevents draggable/horizontal scroll
                wordBreak: 'break-word',    // Wrap long text instead of expanding
            });

            table.querySelectorAll('th').forEach(th => {
                Object.assign(th.style, {
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    fontWeight: '700',
                    padding: '0.8rem 1.2rem',
                    borderBottom: '2px solid var(--border)',
                    textAlign: 'left',
                });
            });

            table.querySelectorAll('td').forEach(td => {
                Object.assign(td.style, {
                    padding: '0.7rem 1.2rem',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    verticalAlign: 'top',
                    lineHeight: '1.6',
                });
            });

            // Remove border from last row
            const rows = table.querySelectorAll('tr');
            if (rows.length > 0) {
                rows[rows.length - 1].querySelectorAll('td').forEach(td => {
                    td.style.borderBottom = 'none';
                });
            }

            // Alternating row colors
            table.querySelectorAll('tbody tr').forEach((row, i) => {
                if (i % 2 === 1) row.style.background = 'var(--bg-secondary)';
            });
        });

        // ── 2. IMAGE FIX ────────────────────────────────────────────────────────
        // notion-to-md sometimes outputs images as plain text or broken markdown.
        // We force every <img> to display properly.
        const imgs = ref.current.querySelectorAll('img');
        imgs.forEach(img => {
            Object.assign(img.style, {
                display: 'block',
                maxWidth: '100%',
                height: 'auto',
                borderRadius: '12px',
                margin: '1.5rem auto',
                boxShadow: 'var(--shadow-md)',
            });
            img.setAttribute('loading', 'lazy');
        });

        // Fix paragraphs that contain ONLY an image — remove extra padding/margin
        ref.current.querySelectorAll('p').forEach(p => {
            if (p.children.length === 1 && p.children[0].tagName === 'IMG') {
                p.style.margin = '0';
            }
        });

    }, [contentHtml]);

    return (
        <div
            ref={ref}
            className="markdown-content"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
    );
}
