import { NextResponse } from 'next/server';
import https from 'node:https';

const gistWriteQueues = new Map();

function gistFetch(gistId, options = {}) {
    return new Promise((resolve, reject) => {
        const GITHUB_PAT = (process.env.GITHUB_PAT || "").replace(/[^\x21-\x7E]/g, "");
        
        // 核心修复：清理 gistId 避免携带任何非法字符（如下划线或换行）
        const cleanGistId = gistId ? gistId.replace(/[^a-zA-Z0-9]/g, "") : "";
        const url = `/gists/${cleanGistId}`;
        
        const reqOptions = {
            hostname: 'api.github.com',
            path: url,
            method: options.method || 'GET',
            headers: {
                'Authorization': `Bearer ${GITHUB_PAT}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'Reading-Odyssey-App-Standard'
            }
        };

        if (options.body) {
            reqOptions.headers['Content-Type'] = 'application/json';
            reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
        }

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON 失败')); }
                } else {
                    reject(new Error(`GitHub HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function withGistWriteLock(gistId, task) {
    const previous = gistWriteQueues.get(gistId) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    gistWriteQueues.set(gistId, current);

    try {
        return await current;
    } finally {
        if (gistWriteQueues.get(gistId) === current) {
            gistWriteQueues.delete(gistId);
        }
    }
}

// ==========================================
// GET /api/reading/gist?id=<gistId>
// 读取用户书单
// ==========================================
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const gistId = searchParams.get('id');
    if (!gistId) return NextResponse.json({ error: '缺少 gistId' }, { status: 400 });

    try {
        const gist = await gistFetch(gistId);
        const content = gist.files['books.json']?.content || '{"books":[]}';
        return NextResponse.json(JSON.parse(content));
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ==========================================
// POST /api/reading/gist
// 写入/更新书单（防并发覆盖锁）
// ==========================================
export async function POST(request) {
    const { gistId, book, books, action } = await request.json();
    if (!gistId) return NextResponse.json({ error: '缺少 gistId' }, { status: 400 });

    try {
        const { latestBooks, addedIds, skippedIds } = await withGistWriteLock(gistId, async () => {
            // 单实例内串行化 gist 写入，尽量减少并发覆盖
            const gist = await gistFetch(gistId);
            const latest = JSON.parse(gist.files['books.json']?.content || '{"books":[]}');
            const addedIds = [];
            const skippedIds = [];

            if (action === 'add') {
                const exists = latest.books.find(b => b.id === book.id);
                if (!exists) {
                    latest.books.unshift(book);
                    addedIds.push(book.id);
                } else {
                    skippedIds.push(book.id);
                }
            } else if (action === 'batchAdd') {
                if (Array.isArray(books)) {
                    for (const b of books) {
                        if (!latest.books.find(x => x.id === b.id)) {
                            latest.books.unshift(b);
                            addedIds.push(b.id);
                        } else {
                            skippedIds.push(b.id);
                        }
                    }
                }
            } else if (action === 'batchMerge') {
                if (Array.isArray(books)) {
                    for (const incoming of books) {
                        const idx = latest.books.findIndex(b => b.id === incoming.id);
                        if (idx !== -1) {
                            latest.books[idx] = { ...latest.books[idx], ...incoming };
                        }
                    }
                }
            } else if (action === 'updateBook') {
                const idx = latest.books.findIndex(b => b.id === book.id);
                if (idx !== -1) {
                    if (book.quote !== undefined) latest.books[idx].quote = book.quote;
                    if (book.mood !== undefined) latest.books[idx].mood = book.mood;
                }
            } else if (action === 'remove') {
                latest.books = latest.books.filter(b => b.id !== book.id);
            }

            await gistFetch(gistId, {
                method: 'PATCH',
                body: JSON.stringify({
                    files: { 'books.json': { content: JSON.stringify(latest, null, 2) } }
                })
            });

            return { latestBooks: latest.books, addedIds, skippedIds };
        });

        return NextResponse.json({ ok: true, books: latestBooks, addedIds, skippedIds });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
