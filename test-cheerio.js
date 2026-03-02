const cheerio = require('cheerio');
fetch('https://l.opnxng.com/comments/1ri31u7').then(r => r.text()).then(html => {
    const $ = cheerio.load(html);
    console.log('Nodes found:', $('.comment').length);
    $('.comment').slice(0, 5).each((i, el) => {
        let scoreStr = $(el).find('.comment_score').first().text().trim();
        let author = $(el).find('.comment_author').first().text().trim();
        let body = $(el).find('.comment_body').first().text().trim();
        console.log({ scoreStr, author, words: body.split(/\s+/).length });
    });
})
