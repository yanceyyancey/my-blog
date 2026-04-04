export const siteConfig = {
    name: 'yancey.blog',
    title: 'yancey | 专注保姆级教程，小白福利站',
    description: '专注保姆级教程，小白福利站。覆盖日常任务：总结、改写、代码解释、轻量 RAG、工具调用。',
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
