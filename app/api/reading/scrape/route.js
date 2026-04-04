import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel max for hobby plan

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// 工具：通过 Nominatim 地理编码（含 sleep 防封禁队列）
// ==========================================
async function geocode(locationName, retries = 2) {
    if (!locationName) return null;
    for (let i = 0; i < retries; i++) {
        try {
            // Nominatim 绝对限速：1.5s
            await sleep(1500); 
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=jsonv2&limit=1&addressdetails=1`;
            const res = await fetch(url, { 
                headers: { 'User-Agent': 'ReadingOdyssey/1.1 (github.com/yancey/reading-odyssey)' } 
            });
            
            if (res.status === 429) {
                console.warn('>>> [GEO] 429 Rate Limited. Sleeping 5s...');
                await sleep(5000);
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (data && data[0]) {
                const item = data[0];
                return {
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    countryCode: (item.address?.country_code || '').toUpperCase(),
                    displayName: item.display_name,
                };
            }
        } catch (e) {
            console.warn(`>>> [GEO] Error for "${locationName}" (retry ${i+1}):`, e.message);
        }
    }
    return null;
}

// ==========================================
// 工具：OpenLibrary 搜书
// ==========================================
async function searchOpenLibrary(query) {
    // 移除 fields 限制，确保获取完整元数据
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3`;
    const res = await fetch(url);
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

    console.log(`>>> [SCRAPE] Starting batch scrape for ${queries.length} queries`);

    // Step 1: 先并行执行 OpenLibrary 搜索
    const searchTasks = queries.slice(0, 20).map(async (query) => {
        const trimmed = query.trim();
        if (!trimmed) return { query: trimmed, error: '输入为空' };
        try {
            const docs = await searchOpenLibrary(trimmed);
            if (docs.length === 0) return { query: trimmed, error: '未找到该书籍' };
            
            const best = docs[0];
            // 立即尝试获取封面
            const coverBase64 = await fetchCoverAsBase64(best.cover_i);
            
            let geoQuery = best.subject_places?.[0] || best.publish_country || null;
            if (Array.isArray(geoQuery)) geoQuery = geoQuery[0];

            return { 
                query: trimmed, 
                book: { 
                    ...best, 
                    coverBase64, 
                    geoQuery 
                } 
            };
        } catch (err) {
            return { query: trimmed, error: err.message };
        }
    });

    const searchResults = await Promise.all(searchTasks);
    
    // Step 2: 顺序执行地理编码以严格遵守 Nominatim 速率限制
    const geoCache = new Map();
    const finalResults = [];

    for (const item of searchResults) {
        if (item.error) {
            finalResults.push(item);
            continue;
        }

        const { book, query } = item;
        const { geoQuery } = book;
        let geo = null;

        if (geoQuery) {
            if (geoCache.has(geoQuery)) {
                geo = geoCache.get(geoQuery);
                console.log(`>>> [SCRAPE] Geo cache hit for: ${geoQuery}`);
            } else {
                console.log(`>>> [SCRAPE] Fetching geo for: ${geoQuery}`);
                geo = await geocode(geoQuery);
                if (geo) {
                    geoCache.set(geoQuery, geo);
                }
                // 严格休眠 1.2s，确保不被 Nominatim 封锁
                await sleep(1200);
            }
        }

        const bookData = {
            id: book.key?.replace('/works/', '') || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            title: book.title || query,
            author: (Array.isArray(book.author_name) ? book.author_name[0] : book.author_name) || '未知作者',
            coverUrl: book.coverBase64 || null,
            country: geo?.displayName?.split(',').pop()?.trim() || geoQuery || '未知',
            countryCode: geo?.countryCode || '',
            lat: geo?.lat || 0,
            lon: geo?.lon || 0,
            quote: '',
            mood: 'default',
            addedAt: new Date().toISOString(),
        };

        console.log(`>>> [SCRAPE] Success: ${bookData.title} (${bookData.countryCode || 'No Geo'})`);
        finalResults.push({ query, book: bookData });
    }

    return NextResponse.json({ results: finalResults });
}
