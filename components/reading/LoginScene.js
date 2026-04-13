'use client';

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './reading.module.css';

function createCanvasStars(width, height, count = 260) {
    return Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        radius: 0.4 + Math.random() * 1.8,
        hue: 205 + Math.random() * 55,
        alpha: 0.25 + Math.random() * 0.65,
    }));
}

// 星空粒子背景
function initStarField(scene) {
    const count = 3000; // 提升密度，更有深度感
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 600;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 600;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 600;
        
        // 加入星云色调：淡蓝、浅紫、纯白
        const h = 0.6 + Math.random() * 0.15; // 0.6 - 0.75 (Blue/Purple range)
        const s = 0.2 + Math.random() * 0.3;
        const l = 0.6 + Math.random() * 0.3;
        const color = new THREE.Color().setHSL(h, s, l);
        colors[i * 3]     = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();

    const mat = new THREE.PointsMaterial({
        size: 0.25,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending, // 叠加感更通透
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // 稳定性增强
    return { points, geo };
}

export default function LoginScene({ onLogin }) {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [pendingNew, setPendingNew] = useState(null); // { code, gistId } when isNew
    const [renderMode, setRenderMode] = useState('webgl');
    const canvasRef = useRef(null);
    const typingTimer = useRef(null);
    const isComposingRef = useRef(false);

    const markTyping = () => {
        setError('');
        setIsTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setIsTyping(false), 800);
    };

    const sanitizeCode = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    // 初始化星空背景
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || renderMode !== 'webgl') return;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
        } catch (error) {
            console.warn('LoginScene WebGL unavailable, fallback to 2D canvas:', error);
            setRenderMode('canvas');
            return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 50;

        const { points: stars, geo: starGeo } = initStarField(scene);
        scene.add(stars);
        const starPos = starGeo.attributes.position.array;
        const starOrigZ = new Float32Array(starPos.length / 3);
        for(let i=0; i<starOrigZ.length; i++) starOrigZ[i] = starPos[i*3+2];

        let animId;
        let t = 0;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            t += 0.005;

            stars.rotation.y += 0.00015;
            stars.rotation.x += 0.00008;
            stars.material.opacity = 0.5 + Math.sin(t) * 0.12;
            
            renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', onResize);
            scene.remove(stars);
            starGeo.dispose();
            stars.material.dispose();
            if (renderer.forceContextLoss) {
                renderer.forceContextLoss();
            }
            renderer.dispose();
        };
    }, [renderMode]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || renderMode !== 'canvas') return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();

        let stars = createCanvasStars(window.innerWidth, window.innerHeight);

        let animId;
        let t = 0;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            t += 0.005;
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            const gradient = ctx.createRadialGradient(
                window.innerWidth * 0.5,
                window.innerHeight * 0.45,
                0,
                window.innerWidth * 0.5,
                window.innerHeight * 0.5,
                Math.max(window.innerWidth, window.innerHeight) * 0.7
            );
            gradient.addColorStop(0, 'rgba(24, 42, 72, 0.24)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

            stars.forEach((star) => {
                star.x += Math.sin(t + star.z * 12) * 0.04;
                star.y += Math.cos(t * 0.8 + star.z * 10) * 0.04;

                const drawX = star.x;
                const drawY = star.y;
                const drawRadius = star.radius;
                const drawAlpha = star.alpha * (0.7 + Math.sin(t * 2 + star.z * 6) * 0.18);

                ctx.beginPath();
                ctx.fillStyle = `hsla(${star.hue}, 70%, 78%, ${Math.max(0.08, drawAlpha)})`;
                ctx.arc(drawX, drawY, drawRadius, 0, Math.PI * 2);
                ctx.fill();
            });
        };
        animate();

        const onResize = () => {
            resize();
            stars = createCanvasStars(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', onResize);
        };
    }, [renderMode]);

    useEffect(() => {
        return () => {
            clearTimeout(typingTimer.current);
        };
    }, []);

    const handleInput = (e) => {
        const nextValue = e.target.value;
        markTyping();

        if (isComposingRef.current || e.nativeEvent?.isComposing) {
            setCode(nextValue);
            return;
        }

        setCode(sanitizeCode(nextValue));
    };

    const handleCompositionStart = () => {
        isComposingRef.current = true;
    };

    const handleCompositionEnd = (e) => {
        isComposingRef.current = false;
        markTyping();
        setCode(sanitizeCode(e.currentTarget.value));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!code || loading) return;
        setLoading(true);
        setError('');

        try {
            const fetchUrl = `/api/reading/lookup?code=${encodeURIComponent(code)}`;
            const res = await fetch(fetchUrl);
            
            // 安全解析：先取文本再 parse，避免 Safari 在收到非 JSON 响应时抛出 DOMException
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`服务器响应异常: ${text.slice(0, 100)}`);
            }
            
            if (!res.ok) throw new Error(data.error || '请求失败');
            if (data.isNew) {
                // 新代号：暂停，让用户确认是否创建
                setPendingNew({ code, gistId: data.gistId });
                setLoading(false);
                return;
            }
            const success = await onLogin({ code, gistId: data.gistId, isNew: false });
            if (success === false) {
                setLoading(false);
            }
        } catch (err) {
            console.error('[login error]', err.message);
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <>
            <canvas key={renderMode} ref={canvasRef} className={styles.canvas} />
            <div className={styles.loginScene}>
                <p className={styles.loginSubtitle}>Reading Odyssey</p>
                <h1 className={styles.loginTitle} style={{ animation: 'slideUp 1s ease' }}>全球阅读足迹</h1>

                <form className={styles.loginForm} onSubmit={handleSubmit} style={{ animation: 'fadeIn 1.5s ease' }}>
                    <input
                        type="text"
                        className={`${styles.loginInput} ${isTyping ? styles.typing : ''}`}
                        placeholder="输入你的专属代号"
                        value={code}
                        onChange={handleInput}
                        onCompositionStart={handleCompositionStart}
                        onCompositionEnd={handleCompositionEnd}
                        maxLength={20}
                        disabled={loading}
                        autoFocus
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        type="submit"
                        className={styles.loginBtn}
                        disabled={!code || loading}
                    >
                        {loading ? '连接星际数据库...' : '进入我的宇宙'}
                    </button>
                    {error && <div className={styles.loginError}>{error}</div>}
                </form>

                <p className={styles.loginHint}>
                    首次使用代号将自动创建专属星图<br />
                    代号不区分大小写，仅限字母与数字
                </p>
            </div>

            {/* 新宇宙确认弹窗 - 独立于主场景布局 */}
            {pendingNew && (
                <div className={styles.confirmOverlay}>
                    <div className={styles.confirmCard}>
                        <div className={styles.confirmIcon}>✦</div>
                        <p className={styles.confirmTitle}>发现未知星图</p>
                        <p className={styles.confirmText}>
                            代号 <strong>&ldquo;{pendingNew.code}&rdquo;</strong> 尚无记录。<br />
                            是否为你创建专属宇宙？
                        </p>
                        <div className={styles.confirmActions}>
                            <button
                                className={styles.confirmCancelBtn}
                                onClick={() => { setPendingNew(null); setCode(''); }}
                            >
                                取消
                            </button>
                            <button
                                className={styles.confirmOkBtn}
                                onClick={async () => {
                                    setPendingNew(null);
                                    setLoading(true);
                                    const success = await onLogin({ code: pendingNew.code, gistId: pendingNew.gistId, isNew: true });
                                    if (success === false) {
                                        setLoading(false);
                                    }
                                }}
                            >
                                创建宇宙
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
