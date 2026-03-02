const cheerio = require('cheerio');
fetch('https://l.opnxng.com/comments/1ri31u7').then(r => r.text()).then(html => {
    const $ = cheerio.load(html);
    const extracted = [];
    $('.comment').each((i, el) => {
        let authorUrl = $(el).find('.comment_author').first().text().trim();
        let author = authorUrl.replace(/^u\//, ''); // Redlib usually prepends "u/"
        let scoreStr = $(el).find('.comment_score').first().text().trim();
        let score = 0;
        if (scoreStr) {
            if (scoreStr.toLowerCase().includes('k')) {
                score = parseFloat(scoreStr) * 1000;
            } else {
                scoreStr = scoreStr.replace(/,/g, '').replace(/[^0-9.-]/g, '');
                score = parseInt(scoreStr, 10) || 0;
            }
        }
        let body = $(el).find('.comment_body').first().text().trim();

        let shouldKeep = false;
        if (author && !["[deleted]", "[removed]", "AutoModerator"].includes(author) &&
            body && !["[deleted]", "[removed]"].includes(body) &&
            score >= 0) {
            if (body.split(/\s+/).length >= 3) {
                let cleanedBody = body.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
                extracted.push({ author, score, body: cleanedBody });
                shouldKeep = true;
            }
        }
        if (!shouldKeep && i < 3) console.log("Discarded: ", { author, score, bodyLength: body.length });
    });
    console.log("Extracted total:", extracted.length);
});
