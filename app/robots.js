import { absoluteUrl } from '@/lib/site-config';

export default function robots() {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/'],
        },
        sitemap: absoluteUrl('/sitemap.xml'),
    }
}
