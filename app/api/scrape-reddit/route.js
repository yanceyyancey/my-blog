import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: '请提供有效的 Reddit 链接' }, { status: 400 });
    }

    try {
        const match = url.match(/comments\/([a-zA-Z0-9]+)/);
        if (!match) {
            return NextResponse.json({ error: "无效的链接格式。请确保那是包含 'comments/...' 的有效 Reddit 帖子链接。" }, { status: 400 });
        }

        const postId = match[1];

        // Use an extensive Redlib frontend array for fallback redundancy
        // Including multiple domains to increase chances of finding a non-blocked datacenter node
        const instances = [
            'https://l.opnxng.com',
            'https://redlib.r4fo.com',
            'https://red.artemislena.eu',
            'https://redlib.nadeko.net',
            'https://redlib.perennialte.ch',
            'https://redlib.privacyredirect.com',
            'https://redlib.privadency.com',
            'https://redlib.4o1x5.dev',
            'https://redlib.ducks.party',
            'https://redlib.catsarch.com',
            'https://redlib.copy.sh',
            'https://redlib.v- some.xyz'
        ];

        let html = null;
        let successInstance = null;

        for (const instance of instances) {
            try {
                // Notice we omit the subreddit. Redlib handles the redirect/localization internally.
                const targetUrl = `${instance}/comments/${postId}`;

                // Use native fetch but with carefully selected residential Firefox headers
                // Firefox is often scrutinised less aggressively than Chrome TLS fingerprints.
                const response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                    },
                    next: { revalidate: 0 }
                });

                if (response.ok) {
                    html = await response.text();
                    // Basic sanity check: did cloudflare/fastly intercept with a Bot Challenge?
                    if (!html.includes('Making sure you\'re not a bot!')) {
                        successInstance = instance;
                        break;
                    }
                }
            } catch (e) {
                console.warn(`Failed to fetch from ${instance}:`, e.message);
                continue;
            }
        }

        if (!html || !successInstance) {
            // Signal to the frontend that server-side fetching is blocked (likely Vercel Datacenter IP block)
            // This triggers the client-side Fetch fallback using the user's residential IP.
            return NextResponse.json({
                error: "Vercel 服务器 IP 被 Reddit 限制 (Datacenter Blocked)",
                needsClientSideFallback: true,
                postId: postId
            }, { status: 403 });
        }

        const $ = cheerio.load(html);
        const postTitle = $('title').text().replace(' - Redlib', '').replace(' - r/', ' - ').trim();

        const extracted = [];

        $('.comment').each((i, el) => {
            // Find author
            let authorUrl = $(el).find('.comment_author').first().text().trim();
            let author = authorUrl.replace(/^u\//, ''); // Redlib usually prepends "u/"

            // Find score (sometimes stored in span[title="Score"] or .score or .comment_score)
            let scoreStr = $(el).find('.comment_score').first().text().trim();
            if (!scoreStr) {
                // Fallback: search for any span with "Score" in title
                scoreStr = $(el).find('span[title*="Score"]').first().text().trim();
            }

            // Handle "1.2k" or "1,200" score parsing
            let score = 0;
            if (scoreStr && scoreStr !== '•') {
                if (scoreStr.toLowerCase().includes('k')) {
                    score = Math.round(parseFloat(scoreStr) * 1000);
                } else {
                    let cleanScore = scoreStr.replace(/,/g, '').replace(/[^0-9.-]/g, '');
                    score = parseInt(cleanScore, 10) || 0;
                }
            }

            // Find body text inside comment_body
            let body = $(el).find('.comment_body').first().text().trim();

            // Robust Author check: handle both u/name and name
            const cleanAuthor = author.replace(/^u\//, '').toLowerCase();
            const isBlacklisted = ["deleted", "removed", "automoderator"].includes(cleanAuthor);

            if (author && !isBlacklisted &&
                body && !["[deleted]", "[removed]"].includes(body)) {

                // Extra basic filtering
                if (body.split(/\s+/).length >= 3) {
                    let cleanedBody = body.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
                    extracted.push({ author, score, body: cleanedBody });
                }
            }
        });

        if (extracted.length === 0) {
            return NextResponse.json({
                error: "成功抓取，但该帖子下没有任何符合质量条件的有效评论（可能都是机器人或被踩折叠的短回复）。"
            }, { status: 404 });
        }

        return NextResponse.json({
            title: postTitle,
            count: extracted.length,
            comments: extracted,
            source: successInstance
        });

    } catch (err) {
        console.error('Scrape API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
