import { NextResponse } from 'next/server';
import https from 'node:https';

// --- 用最底层的 https 模块重写，彻底避开 fetch 的校验报错 ---
function gistFetch(path, options = {}) {
    return new Promise((resolve, reject) => {
        const GITHUB_PAT = (process.env.GITHUB_PAT || "").replace(/[^\x21-\x7E]/g, "");
        
        // 核心修复：对 path 执行极度严格的清洗，只保留字母和数字
        // 这样即使 Vercel 里多填了下划线或空格，这里也会自动修正成正确的 ID
        const cleanPath = path ? path.replace(/[^a-zA-Z0-9]/g, "") : "";
        const url = cleanPath ? `/gists/${cleanPath}` : '/gists';
        
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
                    try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON 解析失败')); }
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
