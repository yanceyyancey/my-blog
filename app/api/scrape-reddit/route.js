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

        // Strategy: First try direct Reddit fetch (works on local/residential IPs).
        // If that fails (Vercel/Datacenter block), rotate through Redlib proxies.
        // Verified instances currently bypassing Datacenter Block:
        const instances = [
            'https://www.reddit.com',
            'https://www.reddit.com/.rss', // RSS Trick: very high resilience
            'https://redlib.perennialte.ch',
            'https://redlib.privacyredirect.com',
            'https://redlib.privadency.com'
        ];

        let html = null;
        let successInstance = null;

        const commonUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        for (const instance of instances) {
            try {
                const isDirect = instance === 'https://www.reddit.com';
                const isRSS = instance.endsWith('.rss');

                let targetUrl;
                if (isDirect) targetUrl = `${instance}/comments/${postId}.json`;
                else if (isRSS) targetUrl = `https://www.reddit.com/comments/${postId}.rss`;
                else targetUrl = `${instance}/comments/${postId}`;

                console.log(`[RedditScraper] Trying ${targetUrl}...`);

                const response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': commonUA,
                        'Accept': isDirect ? 'application/json' : (isRSS ? 'application/xml' : 'text/html,*/*'),
                    },
                    next: { revalidate: 0 }
                });

                if (response.ok) {
                    if (isDirect) {
                        const directData = await response.json();
                        const postInfo = directData[0].data.children[0].data;
                        const comments = directData[1].data.children
                            .filter(child => child.kind === 't1')
                            .map(child => ({
                                author: child.data.author,
                                score: child.data.score || 0,
                                body: child.data.body || ''
                            }))
                            .filter(c => c.author && !["[deleted]", "[removed]", "AutoModerator"].includes(c.author) && c.body.split(/\s+/).length >= 3);

                        if (comments.length > 0) {
                            console.log(`[RedditScraper] Success via Direct JSON`);
                            return NextResponse.json({
                                title: postInfo.title,
                                count: comments.length,
                                comments: comments.map(c => ({ ...c, body: c.body.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim() })),
                                source: 'Reddit Direct API'
                            });
                        }
                    } else if (isRSS) {
                        const rssText = await response.text();
                        const $rss = cheerio.load(rssText, { xmlMode: true });
                        const postTitle = $rss('entry > title').first().text();
                        const comments = [];

                        $rss('entry').each((i, el) => {
                            if (i === 0) return; // Skip the post entry itself
                            const author = $rss(el).find('author > name').text().replace(/^\/u\//, '');
                            const contentHtml = $rss(el).find('content').text();
                            const $content = cheerio.load(contentHtml);
                            const body = $content.text().trim();

                            if (author && !["[deleted]", "[removed]", "AutoModerator"].includes(author) && body.split(/\s+/).length >= 3) {
                                comments.push({ author, score: 'N/A', body: body.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim() });
                            }
                        });

                        if (comments.length > 0) {
                            console.log(`[RedditScraper] Success via RSS Fallback`);
                            return NextResponse.json({
                                title: postTitle || 'Reddit Discussion',
                                count: comments.length,
                                comments: comments,
                                source: 'Reddit RSS Feed'
                            });
                        }
                    } else {
                        html = await response.text();
                        const isBot = html.includes('not a bot!') || html.includes('captcha') || html.includes('network security');
                        const hasComments = html.includes('class="comment"') || html.includes('class=\'comment\'');

                        if (!isBot && hasComments) {
                            console.log(`[RedditScraper] Success via Proxy: ${instance}`);
                            successInstance = instance;
                            break;
                        } else {
                            console.warn(`[RedditScraper] Proxy ${instance} returned no comments or bot challenge`);
                        }
                    }
                } else {
                    console.warn(`[RedditScraper] ${instance} returned HTTP ${response.status}`);
                }
            } catch (e) {
                console.warn(`[RedditScraper] Error fetching from ${instance}:`, e.message);
                continue;
            }
        }

        if (!html || !successInstance) {
            console.error(`[RedditScraper] ALL BACKEND ATTEMPTS FAILED`);
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
            // If server-side finds 0 comments, it's safer to try the browser-side fallback
            // since the proxy output might be malformed or hidden.
            return NextResponse.json({
                error: "服务器端未能提取到有效评论，正在尝试浏览器本地模式...",
                needsClientSideFallback: true,
                postId: postId
            }, { status: 403 });
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
