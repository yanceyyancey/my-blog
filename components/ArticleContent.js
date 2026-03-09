'use client';

import { useEffect, useRef } from 'react';

/**
 * Client-side article content renderer.
 * This component handles dangerouslySetInnerHTML and applies
 * additional post-processing for elements that Notion/remark
 * may not generate correct HTML structure for (e.g., tables).
 */
export default function ArticleContent({ contentHtml }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current) return;

        // Apply table styles dynamically since remark may not output
        // standard <table> tags for all Notion table block types
        const tables = ref.current.querySelectorAll('table');
        tables.forEach(table => {
            // Outer wrapper for horizontal scrolling on mobile
            if (!table.parentElement.classList.contains('table-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper';
                wrapper.style.cssText = 'width:100%;overflow-x:auto;margin:2rem 0;border-radius:16px;border:1px solid var(--border);box-shadow:var(--shadow-sm)';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }

            Object.assign(table.style, {
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem',
                margin: '0',
            });

            // Style headers
            table.querySelectorAll('th').forEach(th => {
                Object.assign(th.style, {
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    fontWeight: '700',
                    padding: '0.8rem 1.2rem',
                    borderBottom: '2px solid var(--border)',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                });
            });

            // Style cells
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
            const bodyRows = table.querySelectorAll('tbody tr');
            bodyRows.forEach((row, i) => {
                if (i % 2 === 1) {
                    row.style.background = 'var(--bg-secondary)';
                }
            });
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
