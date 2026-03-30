import { NextResponse } from 'next/server';

async function gistFetch(gistId, options = {}) {
    const GITHUB_PAT = (process.env.GITHUB_PAT || "").replace(/[^\x21-\x7E]/g, "");
    if (!GITHUB_PAT || GITHUB_PAT.length < 10) throw new Error('GITHUB_PAT 缺失');

    const url = `https://api.github.com/gists/${gistId}`;
    const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'User-Agent': 'Reading-Odyssey-App',
    };

    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body || undefined,
        cache: 'no-store'
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`GitHub API HTTP ${res.status}: ${errorText}`);
    }

    return await res.json();
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
    const { gistId, book, action } = await request.json();
    if (!gistId) return NextResponse.json({ error: '缺少 gistId' }, { status: 400 });

    try {
        // 防覆盖并发锁：先拉取最新快照
        const gist = await gistFetch(gistId);
        const latest = JSON.parse(gist.files['books.json']?.content || '{"books":[]}');

        if (action === 'add') {
            // 去重：同名书籍不重复添加
            const exists = latest.books.find(b => b.id === book.id);
            if (!exists) latest.books.unshift(book);
        } else if (action === 'updateQuote') {
            // 更新金句
            const idx = latest.books.findIndex(b => b.id === book.id);
            if (idx !== -1) latest.books[idx].quote = book.quote;
        } else if (action === 'remove') {
            latest.books = latest.books.filter(b => b.id !== book.id);
        }

        await gistFetch(gistId, {
            method: 'PATCH',
            body: JSON.stringify({
                files: { 'books.json': { content: JSON.stringify(latest, null, 2) } }
            })
        });

        return NextResponse.json({ ok: true, books: latest.books });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
