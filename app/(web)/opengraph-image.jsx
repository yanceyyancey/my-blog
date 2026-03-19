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
                    background: '#000000',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}
            >
                {/* Minimalist brand text */}
                <div
                    style={{
                        fontSize: 120,
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '-0.05em',
                        marginBottom: 10,
                    }}
                >
                    yancey
                </div>
                
                {/* Subtitle */}
                <div
                    style={{
                        fontSize: 32,
                        color: '#a1a1aa',
                        fontWeight: 400,
                        letterSpacing: '0.15em',
                        display: 'flex',
                        textAlign: 'center',
                    }}
                >
                    专注保姆级教程，小白福利站
                </div>

                {/* Decorative minimalist footer */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 50,
                        display: 'flex',
                        width: '300px',
                        borderTop: '2px solid #27272a',
                        justifyContent: 'center',
                        paddingTop: 20,
                    }}
                >
                    <div style={{ color: '#52525b', fontSize: 20, letterSpacing: '0.3em', fontWeight: 600 }}>
                        YANCEY.BLOG
                    </div>
                </div>
            </div>
        ),
        { ...size }
    );
}
