export const siteConfig = {
    name: 'yancey.blog',
    title: 'yancey | 数码玩家 / 业余开发 / AI 实用主义者',
    description: '专注高效工具流与低成本方案探索。愿意分享折腾心得。',
    url: 'https://www.yancey.blog',
    locale: 'zh-CN',
    author: {
        name: 'yancey',
        email: 'xyang8031@gmail.com',
        avatar: 'https://github.com/yanceyyancey.png',
    },
    links: {
        github: 'https://github.com/yanceyyancey',
        rss: '/feed.xml',
    },
};

export function absoluteUrl(path = '/') {
    return new URL(path, siteConfig.url).toString();
}
