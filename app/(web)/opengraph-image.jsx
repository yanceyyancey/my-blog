import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';

export const alt = 'yancey | 专注保姆级教程，小白福利站';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '80px',
                }}
            >
                <div style={{ display: 'flex', border: '2px solid rgba(255,255,255,0.1)', padding: '60px 80px', borderRadius: '32px', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
                    <div
                        style={{
                            fontSize: 80,
                            fontWeight: 800,
                            color: 'white',
                            letterSpacing: '-0.02em',
                            marginBottom: 20,
                            display: 'flex',
                        }}
                    >
                        yancey.blog
                    </div>
                    <div
                        style={{
                            fontSize: 36,
                            color: '#94a3b8',
                            fontWeight: 500,
                            display: 'flex',
                            textAlign: 'center',
                        }}
                    >
                        专注保姆级教程，小白福利站
                    </div>
                </div>
            </div>
        ),
        { ...size }
    );
}
