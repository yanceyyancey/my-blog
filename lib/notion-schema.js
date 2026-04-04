export const notionSchema = {
    properties: {
        slug: 'Slug',
        date: 'Date',
        status: 'Status',
        category: 'Category',
        tags: 'Tags',
    },
    aliases: {
        title: ['Name', 'Title'],
        summary: ['Summary', 'Description', 'Excerpt', 'SEO Description', 'Subtitle'],
        cover: ['Cover', 'Cover Image', 'CoverImage'],
    },
    values: {
        publishedStatus: '完成',
        journalCategory: 'Journal',
        uncategorizedCategory: 'Uncategorized',
    },
};
