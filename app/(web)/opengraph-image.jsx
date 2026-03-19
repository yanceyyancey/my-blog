import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export const alt = 'yancey.blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
    // Read the screenshot synchronously and convert to base64
    const bgImageData = fs.readFileSync(path.join(process.cwd(), 'public/mickey-og-bg.png'));
    const bgImageBase64 = `data:image/png;base64,${bgImageData.toString('base64')}`;

    return new ImageResponse(
        (
            <div
                style={{
                    background: '#000000',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Background image perfectly centered in the 1200x630 canvas */}
                <img
                    src={bgImageBase64}
                    style={{
                        position: 'absolute',
                        width: 1440,
                        height: 813,
                        top: -90,
                        left: -120,
                    }}
                />

                {/* Overlays to mask out the browser UI, header, 'STEAMBOAT WILLIE' title, and bottom text */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260, background: '#000000', display: 'flex' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, background: '#000000', display: 'flex' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 300, background: '#000000', display: 'flex' }} />

                {/* Simply yancey.blog */}
                <div
                    style={{
                        position: 'absolute',
                        top: 100,
                        fontSize: 100,
                        fontWeight: 900,
                        color: '#ffffff',
                        letterSpacing: '-0.05em',
                        display: 'flex',
                    }}
                >
                    yancey.blog
                </div>
            </div>
        ),
        { ...size }
    );
}
