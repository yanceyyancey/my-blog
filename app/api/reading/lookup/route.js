import { NextResponse } from 'next/server';

// 绕过 Turbopack 的 fetch 拦截，直接使用原生 Node.js fetch
// Next.js 会 patch 全局 fetch；我们通过手动传递完整 init 对象来强制带上 headers
async function gistFetch(path, options = {}) {
    const GITHUB_PAT = process.env.GITHUB_PAT;
    const MASTER_GIST_ID = process.env.MASTER_GIST_ID;
    
    const url = path 
        ? `https://api.github.com/gists/${path}`
        : 'https://api.github.com/gists';

    const init = {
        method: options.method || 'GET',
        headers: {
            'Authorization': `token ${GITHUB_PAT}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ReadingOdyssey/1.0',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        cache: 'no-store',
        ...(options.body ? { body: options.body } : {}),
    };

    const res = await fetch(url, init);
    
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${err}`);
    }
    return res.json();
}

// ==========================================
// GET /api/reading/lookup?code=yancey
// 查询代号 → Gist ID，不存在则创建
// ==========================================
export async function GET(request) {
    const MASTER_GIST_ID = process.env.MASTER_GIST_ID;
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.toLowerCase().trim();

    if (!code || !/^[a-z0-9]+$/.test(code)) {
        return NextResponse.json({ error: '代号只能包含英文字母和数字' }, { status: 400 });
    }

    if (!GITHUB_PAT || !MASTER_GIST_ID) {
        return NextResponse.json({ error: '服务端配置缺失，请联系管理员' }, { status: 500 });
    }

    try {
        // 1. 读取 Master Index
        const masterGist = await gistFetch(MASTER_GIST_ID);
        const indexContent = masterGist.files['index.json']?.content || '{}';
        const index = JSON.parse(indexContent);

        // 2. 已有代号：直接返回 Gist ID
        if (index[code]) {
            return NextResponse.json({ gistId: index[code], isNew: false });
        }

        // 3. 全新代号：创建新 Gist
        const newGist = await gistFetch('', {
            method: 'POST',
            body: JSON.stringify({
                description: `Reading Odyssey — ${code}`,
                public: false,
                files: {
                    'books.json': { content: JSON.stringify({ books: [] }) }
                }
            })
        });

        // 4. 更新 Master Index（防并发：先拉取再写入）
        const freshMaster = await gistFetch(MASTER_GIST_ID);
        const freshIndex = JSON.parse(freshMaster.files['index.json']?.content || '{}');
        freshIndex[code] = newGist.id;

        await gistFetch(MASTER_GIST_ID, {
            method: 'PATCH',
            body: JSON.stringify({
                files: {
                    'index.json': { content: JSON.stringify(freshIndex, null, 2) }
                }
            })
        });

        return NextResponse.json({ gistId: newGist.id, isNew: true });

    } catch (err) {
        console.error('[lookup] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
