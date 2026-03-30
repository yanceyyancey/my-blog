'use client';

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './reading.module.css';

// 星空粒子背景
function initStarField(scene) {
    const count = 2000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
        pos[i] = (Math.random() - 0.5) * 400;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.3,
        transparent: true,
        opacity: 0.5,
        sizeAttenuation: true,
    });
    return new THREE.Points(geo, mat);
}

export default function LoginScene({ onLogin }) {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const canvasRef = useRef(null);
    const typingTimer = useRef(null);

    // 初始化星空背景
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 50;

        const stars = initStarField(scene);
        scene.add(stars);

        let animId;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            stars.rotation.y += 0.0001;
            stars.rotation.x += 0.00005;
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
            renderer.dispose();
        };
    }, []);

    const handleInput = (e) => {
        const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        setCode(val);
        setError('');
        setIsTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setIsTyping(false), 800);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!code || loading) return;
        setLoading(true);
        setError('');

        try {
            // 使用 window.location.origin 构造完整路径，防止某些浏览器对局部路径的 fetch 校验失败
            const url = new URL('/api/reading/lookup', window.location.origin);
            url.searchParams.set('code', code);

            const res = await fetch(url.toString(), {
                method: 'GET',
                credentials: 'omit', // 显式声明不携带凭证，减少报错概率
                headers: { 'Accept': 'application/json' }
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '请求失败');
            onLogin({ code, gistId: data.gistId, isNew: data.isNew });
        } catch (err) {
            console.error('[frontend-login] Error:', err);
            // 终端诊断：显示详细堆栈
            const debugMsg = `${err.message} \nStack: ${err.stack?.slice(0, 100)}...`;
            setError(debugMsg);
            setLoading(false);
        }
    };

    return (
        <>
            <canvas ref={canvasRef} className={styles.canvas} />
            <div className={styles.loginScene}>
                <p className={styles.loginSubtitle}>Reading Odyssey</p>
                <h1 className={styles.loginTitle}>全球阅读足迹</h1>

                <form className={styles.loginForm} onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className={`${styles.loginInput} ${isTyping ? styles.typing : ''}`}
                        placeholder="输入你的专属代号"
                        value={code}
                        onChange={handleInput}
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
        </>
    );
}
