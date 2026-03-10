'use client';

import { useEffect, useState } from 'react';

export default function TableOfContents({ toc }) {
    const [activeId, setActiveId] = useState('');

    useEffect(() => {
        if (!toc || toc.length === 0) return;

        // Set up the IntersectionObserver to detect which heading is currently on screen
        const observer = new IntersectionObserver(
            (entries) => {
                // Find the first entry that is intersecting
                const visibleEntry = entries.find((entry) => entry.isIntersecting);
                if (visibleEntry) {
                    setActiveId(visibleEntry.target.id);
                }
            },
            {
                // Trigger when a heading is near the top of the viewport
                rootMargin: '0px 0px -80% 0px',
            }
        );

        toc.forEach((item) => {
            const element = document.getElementById(item.id);
            if (element) {
                observer.observe(element);
            }
        });

        return () => observer.disconnect();
    }, [toc]);

    if (!toc || toc.length === 0) {
        return null;
    }

    // Handle smooth scrolling when clicking a TOC link
    const handleClick = (e, id) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            // Adjust offset for floating header if needed
            const offset = 100; // rough estimate for nav bar height + padding
            const top = element.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: 'smooth' });

            // Manually set active ID for immediate feedback
            setActiveId(id);
        }
    };

    return (
        <nav className="toc-container">
            <h3 className="toc-title">目录</h3>
            <ul className="toc-list">
                {toc.map((item) => {
                    // Indent based on heading level (h1=0, h2=1, h3=2, etc.)
                    // We assume the lowest heading level might be h1 or h2.
                    const minLevel = Math.min(...toc.map(t => t.level));
                    const indent = item.level - minLevel;

                    return (
                        <li key={item.id} style={{ paddingLeft: `${indent * 1}rem` }}>
                            <a
                                href={`#${item.id}`}
                                onClick={(e) => handleClick(e, item.id)}
                                className={`toc-link ${activeId === item.id ? 'active' : ''}`}
                            >
                                {item.text}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
