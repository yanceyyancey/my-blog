'use client';

import { useEffect, useRef } from 'react';

export default function ArticleContent({ contentHtml }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current) return;

        // ── 1. MERMAID DIAGRAMS ─────────────────────────────────────────────────
        // Detect <pre><code class="language-mermaid"> blocks and render them visually
        const renderMermaid = async () => {
            // Match all possible class name formats remark/remark-gfm might output
            const mermaidBlocks = ref.current.querySelectorAll(
                'pre code.language-mermaid, code.language-mermaid, pre code.mermaid, code.mermaid'
            );

            // Also detect by content for cases where class isn't set (plain <pre><code> blocks)
            const allCodeBlocks = ref.current.querySelectorAll('pre code:not([class])');
            const mermaidKeywords = ['flowchart', 'graph ', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'gantt', 'pie ', 'erDiagram', 'journey'];
            const detectedBlocks = Array.from(allCodeBlocks).filter(el =>
                mermaidKeywords.some(kw => el.textContent.trimStart().startsWith(kw))
            );

            const allMermaid = [...new Set([...mermaidBlocks, ...detectedBlocks])];
            if (allMermaid.length === 0) return;

            const mermaid = (await import('mermaid')).default;
            mermaid.initialize({
                startOnLoad: false,
                theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'neutral',
                fontFamily: 'inherit',
                fontSize: 14,
            });

            allMermaid.forEach(async (codeEl, index) => {
                const pre = codeEl.closest('pre') || codeEl;
                const graphDefinition = codeEl.textContent;
                const id = `mermaid-${Date.now()}-${index}`;

                try {
                    const { svg } = await mermaid.render(id, graphDefinition);
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mermaid-wrapper';
                    wrapper.style.cssText = [
                        'width:100%',
                        'overflow-x:auto',
                        'margin:2rem 0',
                        'padding:1.5rem',
                        'background:var(--bg-subtle)',
                        'border:1px solid var(--border)',
                        'border-radius:16px',
                        'text-align:center',
                    ].join(';');
                    wrapper.innerHTML = svg;
                    pre.replaceWith(wrapper);
                } catch (err) {
                    console.warn('Mermaid render error for block #' + index + ':', err.message);
                }
            });
        };

        renderMermaid();

        // ── 2. TABLE STYLES ─────────────────────────────────────────────────────
        const tables = ref.current.querySelectorAll('table');
        tables.forEach(table => {
            // Wrap in a div for clean borders and to keep table within column width
            if (!table.parentElement.classList.contains('table-scroll-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-scroll-wrapper';
                Object.assign(wrapper.style, {
                    width: '100%',
                    margin: '2rem 0',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    boxShadow: 'var(--shadow-sm)',
                    overflow: 'hidden',  // clips the table inside rounded corners
                });
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }

            Object.assign(table.style, {
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem',
                margin: '0',
                tableLayout: 'auto',  // let browser size columns by content
            });

            table.querySelectorAll('th').forEach(th => {
                Object.assign(th.style, {
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    fontWeight: '700',
                    padding: '0.8rem 1.2rem',
                    borderBottom: '2px solid var(--border)',
                    textAlign: 'left',
                    overflowWrap: 'break-word',  // only break if truly needed
                    minWidth: '80px',
                });
            });

            table.querySelectorAll('td').forEach(td => {
                Object.assign(td.style, {
                    padding: '0.7rem 1.2rem',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    verticalAlign: 'top',
                    lineHeight: '1.7',
                    overflowWrap: 'break-word',
                });
            });

            const rows = table.querySelectorAll('tr');
            if (rows.length > 0) {
                rows[rows.length - 1].querySelectorAll('td').forEach(td => {
                    td.style.borderBottom = 'none';
                });
            }

            table.querySelectorAll('tbody tr').forEach((row, i) => {
                if (i % 2 === 1) row.style.background = 'var(--bg-secondary)';
            });
        });

        // ── 3. IMAGE STYLES ─────────────────────────────────────────────────────
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
