import { ImageResponse } from 'next/og';
import { getPostData } from '@/lib/posts';
import { siteConfig } from '@/lib/site-config';

export const runtime = 'nodejs';

export const alt = `${siteConfig.name} - 文章预览`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }) {
    try {
        const post = await getPostData(params.slug);

        return new ImageResponse(
            (
                <div
                    style={{
                        background: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '80px',
                        fontFamily: 'sans-serif',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
                            {post.category && (
                                <div style={{ background: 'rgba(37, 99, 235, 0.2)', color: '#60a5fa', padding: '8px 20px', borderRadius: '24px', fontSize: 24, fontWeight: 600, display: 'flex' }}>
                                    {post.category}
                                </div>
                            )}
                        </div>
                        <div
                            style={{
                                fontSize: 64,
                                fontWeight: 800,
                                color: 'white',
                                lineHeight: 1.2,
                                display: 'flex',
                                letterSpacing: '-0.02em',
                            }}
                        >
                            {post.title}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '40px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: 32, color: '#f8fafc', fontWeight: 600, marginBottom: '8px', display: 'flex' }}>
                                {siteConfig.name}
                            </div>
                            <div style={{ fontSize: 24, color: '#64748b', display: 'flex' }}>
                                {post.date}
                            </div>
                        </div>
                        <div style={{ display: 'flex', background: 'white', color: 'black', padding: '12px 24px', borderRadius: '16px', fontSize: 24, fontWeight: 800 }}>
                            阅读文章 ↗
                        </div>
                    </div>
                </div>
            ),
            { ...size }
        );
    } catch (e) {
        // Fallback if post not found
        return new ImageResponse(
            (
                    <div style={{ background: '#0f172a', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 60, color: 'white' }}>{siteConfig.name}</div>
                </div>
            ),
            { ...size }
        );
    }
}
