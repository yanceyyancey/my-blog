import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing url param', { status: 400 });
    }

    // 移除严格域名限制，允许所有封面加载，或者加入更多常见图床
    let hostname;
    try {
        hostname = new URL(url).hostname;
    } catch {
        return new NextResponse('Invalid url', { status: 400 });
    }

    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'ReadingOdyssey/1.0' } });
        if (!res.ok) return new NextResponse('Upstream error', { status: res.status });

        const contentType = res.headers.get('content-type') || 'image/jpeg';
        const buffer = await res.arrayBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (e) {
        return new NextResponse('Fetch failed', { status: 500 });
    }
}
