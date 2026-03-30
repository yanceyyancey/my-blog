'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import styles from './reading.module.css';

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;
const SAMPLE_W = IS_MOBILE ? 15 : 30;
const SAMPLE_H = IS_MOBILE ? 20 : 40;
const PARTICLE_COUNT = SAMPLE_W * SAMPLE_H;

// ==========================================
// 采样封面图到粒子颜色数组
// ==========================================
function sampleCoverColors(base64Src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = SAMPLE_W;
            canvas.height = SAMPLE_H;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
            const imageData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
            const colors = [];
            for (let i = 0; i < SAMPLE_W * SAMPLE_H; i++) {
                const r = imageData[i * 4] / 255;
                const g = imageData[i * 4 + 1] / 255;
                const b = imageData[i * 4 + 2] / 255;
                colors.push(r, g, b);
            }
            resolve(colors);
        };
        img.onerror = () => {
            // fallback：随机亮色
            const h = Math.random();
            const colors = [];
            const col = new THREE.Color().setHSL(h, 0.8, 0.6);
            for (let i = 0; i < PARTICLE_COUNT; i++) colors.push(col.r, col.g, col.b);
            resolve(colors);
        };
        img.src = base64Src || '';
        if (!base64Src) img.onerror();
    });
}

// ==========================================
// 为一本书生成粒子布局（相对于其中心点）
// ==========================================
function generateBookParticles(centerX, centerY, centerZ, colors) {
    const positions = [];
    const particleColors = [];
    const bookW = 2.5;
    const bookH = (bookW * 4) / 3;

    let ci = 0;
    for (let row = 0; row < SAMPLE_H; row++) {
        for (let col = 0; col < SAMPLE_W; col++) {
            const x = centerX + (col / (SAMPLE_W - 1) - 0.5) * bookW;
            const y = centerY + (0.5 - row / (SAMPLE_H - 1)) * bookH;
            const z = centerZ + (Math.random() - 0.5) * 0.05;
            positions.push(x, y, z);
            particleColors.push(colors[ci], colors[ci + 1], colors[ci + 2]);
            ci += 3;
        }
    }
    return { positions, particleColors };
}

// ==========================================
// 主组件：粒子书籍墙
// ==========================================
export default function GalaxyScene({ books, onBookClick, onAddBook }) {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const bookStartIndices = useRef([]); // 每本书粒子在大 array 中的起始索引

    useEffect(() => {
        if (!canvasRef.current || books.length === 0) return;

        const canvas = canvasRef.current;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

        // 根据书本数量调整相机距离
        const cols = Math.ceil(Math.sqrt(books.length));
        const rows = Math.ceil(books.length / cols);
        camera.position.set(0, 0, Math.max(20, cols * 5));

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 5;
        controls.maxDistance = 80;

        // ---- 合并所有书的粒子到单个 BufferGeometry ----
        const buildScene = async () => {
            const totalParticles = books.length * PARTICLE_COUNT;
            const allPositions = new Float32Array(totalParticles * 3);
            const allColors = new Float32Array(totalParticles * 3);
            const allOrig = new Float32Array(totalParticles * 3); // 原始位置（用于动画）

            bookStartIndices.current = [];

            const SPACING_X = 4;
            const SPACING_Y = 6;

            for (let i = 0; i < books.length; i++) {
                const book = books[i];
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx = (col - (cols - 1) / 2) * SPACING_X;
                const cy = -(row - (rows - 1) / 2) * SPACING_Y;

                const colors = await sampleCoverColors(book.coverUrl);
                const { positions, particleColors } = generateBookParticles(cx, cy, 0, colors);

                const startIdx = i * PARTICLE_COUNT * 3;
                bookStartIndices.current.push(startIdx / 3);

                for (let j = 0; j < positions.length; j++) {
                    allPositions[startIdx + j] = positions[j];
                    allOrig[startIdx + j] = positions[j];
                    allColors[startIdx + j] = particleColors[j];
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(allColors, 3));

            const mat = new THREE.PointsMaterial({
                size: IS_MOBILE ? 0.12 : 0.08,
                vertexColors: true,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true,
            });

            const points = new THREE.Points(geo, mat);
            scene.add(points);

            // 呼吸动画（随机微浮动）
            let t = 0;
            const breathe = () => {
                t += 0.008;
                const pos = geo.attributes.position.array;
                for (let i = 0; i < books.length; i++) {
                    const start = bookStartIndices.current[i];
                    for (let j = 0; j < PARTICLE_COUNT; j++) {
                        const idx = (start + j) * 3;
                        pos[idx + 2] = allOrig[idx + 2] + Math.sin(t + j * 0.1 + i * 2) * 0.04;
                    }
                }
                geo.attributes.position.needsUpdate = true;
            };

            // ---- 点击射线检测 ----
            const raycaster = new THREE.Raycaster();
            raycaster.params.Points.threshold = 0.3;
            const pointer = new THREE.Vector2();

            const onClick = (e) => {
                const rect = canvas.getBoundingClientRect();
                pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                raycaster.setFromCamera(pointer, camera);
                const intersects = raycaster.intersectObject(points);
                if (intersects.length > 0) {
                    const particleIdx = intersects[0].index;
                    // 找到是哪本书
                    let bookIdx = 0;
                    for (let i = 0; i < bookStartIndices.current.length; i++) {
                        const start = bookStartIndices.current[i];
                        const end = start + PARTICLE_COUNT;
                        if (particleIdx >= start && particleIdx < end) {
                            bookIdx = i;
                            break;
                        }
                    }
                    // 解体动画
                    triggerDissolve(geo, bookStartIndices.current[bookIdx], () => {
                        onBookClick(books[bookIdx]);
                    });
                }
            };

            canvas.addEventListener('click', onClick);

            // ---- 解体动画 ----
            const triggerDissolve = (geometry, startParticleIdx, callback) => {
                controls.enabled = false;
                const pos = geometry.attributes.position.array;
                const tempObjs = [];

                for (let j = 0; j < PARTICLE_COUNT; j++) {
                    const idx = (startParticleIdx + j) * 3;
                    tempObjs.push({
                        x: pos[idx],
                        y: pos[idx + 1],
                        z: pos[idx + 2],
                        tx: (Math.random() - 0.5) * 30,
                        ty: (Math.random() - 0.5) * 30,
                        tz: (Math.random() - 0.5) * 30,
                    });
                }

                gsap.to(mat, { opacity: 0, duration: 1, ease: 'power2.in' });
                gsap.to(mat, {
                    duration: 1.2, ease: 'power3.in',
                    onUpdate: function () {
                        const p = this.progress();
                        for (let j = 0; j < PARTICLE_COUNT; j++) {
                            const idx = (startParticleIdx + j) * 3;
                            const o = tempObjs[j];
                            pos[idx] = o.x + (o.tx - o.x) * p;
                            pos[idx + 1] = o.y + (o.ty - o.y) * p;
                            pos[idx + 2] = o.z + (o.tz - o.z) * p;
                        }
                        geometry.attributes.position.needsUpdate = true;
                    },
                    onComplete: callback
                });
            };

            sceneRef.current = { scene, camera, renderer, controls, points, geo, breathe };
            setLoaded(true);

            let animId;
            const animate = () => {
                animId = requestAnimationFrame(animate);
                breathe();
                controls.update();
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
                canvas.removeEventListener('click', onClick);
                window.removeEventListener('resize', onResize);
                renderer.dispose();
                geo.dispose();
                mat.dispose();
            };
        };

        const cleanup = buildScene();
        return () => { cleanup.then(fn => fn && fn()); };
    }, [books, onBookClick]);

    return (
        <>
            <canvas ref={canvasRef} className={styles.canvas} />
            {!loaded && books.length > 0 && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.loadingSpinner} />
                    <span className={styles.loadingText}>渲染粒子宇宙...</span>
                </div>
            )}
        </>
    );
}
