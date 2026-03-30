import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel max for hobby plan

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// 工具：通过 Nominatim 地理编码（含 sleep 防封禁队列）
// ==========================================
async function geocode(countryName, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await sleep(1500); // 必须：Nominatim 限速 1 req/s
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(countryName)}&format=json&limit=1&featuretype=country`,
                { headers: { 'User-Agent': 'ReadingOdyssey/1.0 (yancey.blog)' } }
            );
            if (res.status === 429) {
                await sleep(3000);
                continue;
            }
            const data = await res.json();
            if (data[0]) {
                return {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon),
                    countryCode: data[0].address?.country_code?.toUpperCase() || '',
                    displayName: data[0].display_name,
                };
            }
        } catch (e) {
            console.warn(`[geocode] retry ${i + 1}:`, e.message);
        }
    }
    return null;
}

// ==========================================
// 工具：OpenLibrary 搜书（书名 or 作者）
// ==========================================
async function searchOpenLibrary(query) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5&fields=key,title,author_name,cover_i,subject_places,publish_country,edition_count`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error('OpenLibrary 搜索失败');
    const data = await res.json();
    return data.docs || [];
}

// ==========================================
// 工具：下载封面图并压缩为 Base64
// ==========================================
async function fetchCoverAsBase64(coverId) {
    if (!coverId) return null;
    try {
        const coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
        const res = await fetch(coverUrl);
        if (!res.ok) return null;

        const buffer = Buffer.from(await res.arrayBuffer());

        // 动态 import sharp（服务端专用）
        const sharp = (await import('sharp')).default;
        const compressed = await sharp(buffer)
            .resize({ width: 150, withoutEnlargement: true })
            .jpeg({ quality: 75 })
            .toBuffer();

        return `data:image/jpeg;base64,${compressed.toString('base64')}`;
    } catch (e) {
        console.warn('[fetchCover] 压缩失败:', e.message);
        return null;
    }
}

// ==========================================
// POST /api/reading/scrape
// Body: { books: ["书名1", "书名2", ...] }
// ==========================================
export async function POST(request) {
    const { books: queries } = await request.json();
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
        return NextResponse.json({ error: '请提供书名列表' }, { status: 400 });
    }

    const results = [];

    for (const query of queries.slice(0, 20)) { // 单次最多 20 本
        const trimmed = query.trim();
        if (!trimmed) continue;

        try {
            const docs = await searchOpenLibrary(trimmed);
            if (docs.length === 0) {
                results.push({ query: trimmed, error: '未找到该书籍' });
                continue;
            }

            const best = docs[0];

            // 地理编码：优先用 subject_places，其次用 publish_country
            const geoQuery = best.subject_places?.[0] || best.publish_country || null;
            const geo = geoQuery ? await geocode(geoQuery) : null;

            // 封面 Base64 化
            const coverBase64 = await fetchCoverAsBase64(best.cover_i);

            const bookData = {
                id: best.key?.replace('/works/', '') || Date.now().toString(),
                title: best.title || trimmed,
                author: best.author_name?.[0] || '未知作者',
                coverUrl: coverBase64 || null,
                country: geo?.displayName?.split(',').pop()?.trim() || geoQuery || '未知',
                countryCode: geo?.countryCode || '',
                lat: geo?.lat || 0,
                lon: geo?.lon || 0,
                quote: '',
                mood: 'default',
                addedAt: new Date().toISOString(),
            };

            results.push({ query: trimmed, book: bookData });
        } catch (err) {
            results.push({ query: trimmed, error: err.message });
        }

        await sleep(500); // 批量请求之间短暂间隔
    }

    return NextResponse.json({ results });
}
