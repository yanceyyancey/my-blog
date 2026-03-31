'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import styles from './reading.module.css';

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;
const SAMPLE_W = IS_MOBILE ? 18 : 37;
const SAMPLE_H = IS_MOBILE ? 24 : 49;
const PARTICLE_COUNT = SAMPLE_W * SAMPLE_H;

// ==========================================
// 采样封面图到粒子颜色数组
// ==========================================
function sampleCoverColors(base64Src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = SAMPLE_W;
                canvas.height = SAMPLE_H;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
                
                // Security boundary: if image triggers CORS, getImageData throws here
                const imageData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
                const colors = [];
                for (let i = 0; i < SAMPLE_W * SAMPLE_H; i++) {
                    // 大幅增加采样增益 (2.0x)，强制让所有封面粒子更加闪亮
                    const r = Math.min(1.0, (imageData[i * 4] / 255) * 2.0);
                    const g = Math.min(1.0, (imageData[i * 4 + 1] / 255) * 2.0);
                    const b = Math.min(1.0, (imageData[i * 4 + 2] / 255) * 2.0);
                    colors.push(r, g, b);
                }
                resolve(colors);
            } catch (err) {
                console.warn('Canvas Error (CORS block) for cover:', base64Src);
                img.onerror();
            }
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
            const z = centerZ; // 平面绝对对齐，去除了内部粒子的乱序流动
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
export default function GalaxyScene({ books, onBookClick, onAddBook, isExitingToGlobe, onExited }) {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const bookStartIndices = useRef([]); // 每本书粒子在大 array 中的起始索引
    const introRef = useRef({ progress: 0 });
    const cameraRef = useRef(null);
    useEffect(() => {
        if (isExitingToGlobe) {
            console.log('>>> [ACTION] Starting Clean Rigid Flight...');
            gsap.killTweensOf(introRef.current);
            gsap.to(introRef.current, {
                progress: 2, 
                duration: 0.8, // 极致快感：0.8s
                ease: 'power3.out',
                overwrite: 'auto',
                onComplete: () => {
                    if (onExited) onExited();
                }
            });
            // 离场阶段不再进行粒子消散，而是整体飞过去后自然消失
            if (sceneRef.current) {
                gsap.to(sceneRef.current.points.material, {
                    opacity: 0,
                    size: 0.12, 
                    duration: 0.8,
                    ease: 'power3.out'
                });
            }
            if (cameraRef.current) {
                gsap.to(cameraRef.current.position, {
                    z: 14, 
                    duration: 0.8,
                    ease: 'expo.out',
                    overwrite: 'auto'
                });
            }
        }
    }, [isExitingToGlobe, onExited]);

    useEffect(() => {
        if (!canvasRef.current || books.length === 0) return;

        const canvas = canvasRef.current;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        cameraRef.current = camera;

        // 计算网格行列以及间距配置
        const cols = Math.ceil(Math.sqrt(books.length));
        const rows = Math.ceil(books.length / cols);
        const SPACING_X = 2.8; // 更紧凑的横向间距
        const SPACING_Y = 3.8; // 更紧凑的纵向间距

        // 【充满屏幕的核心】：动态计算包围网格所需完美的 Z 轴距离
        const gridW = (cols - 1) * SPACING_X + 2.5; 
        const gridH = (rows - 1) * SPACING_Y + 3.33; 
        const aspect = window.innerWidth / window.innerHeight;
        const fovRad = (60 * Math.PI) / 180;
        
        const requiredZ_H = (gridH / 2) / Math.tan(fovRad / 2);
        const requiredZ_W = (gridW / 2) / Math.tan(fovRad / 2) / aspect;
        
        // 放大 15% 留下边界呼吸空间
        camera.position.set(0, 0, Math.max(requiredZ_H, requiredZ_W) * 1.15);

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
            const allOrig = new Float32Array(totalParticles * 3); // 最终目标位置
            const allStart = new Float32Array(totalParticles * 3); // 初始散落位置
            const allGlobe = new Float32Array(totalParticles * 3); // 离场时构成地球外围的位置

            bookStartIndices.current = [];

            bookStartIndices.current = [];

            // 极致优化：预加载并并行采样所有封面颜色，拒绝串行 Await 导致的白屏尴尬
            const allCoverColors = await Promise.all(books.map(b => {
                const proxyUrl = `/api/cover-proxy?url=${encodeURIComponent(b.coverUrl || '')}`;
                return sampleCoverColors(proxyUrl);
            }));

            for (let i = 0; i < books.length; i++) {
                const book = books[i];
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx = (col - (cols - 1) / 2) * SPACING_X;
                const cy = -(row - (rows - 1) / 2) * SPACING_Y;

                let lat = book.lat ?? null;
                let lon = book.lon ?? null;
                
                if (lat === null || lon === null) {
                    let hash = 0;
                    const str = book.title || "";
                    for (let j = 0; j < str.length; j++) hash = ((hash << 5) - hash) + str.charCodeAt(j);
                    lat = (Math.abs(hash) % 120) - 60;
                    lon = (Math.abs(hash * 31) % 240) - 120;
                }
                
                const basePhi = (90 - lat) * Math.PI / 180;
                const baseTheta = (lon + 180) * Math.PI / 180;
                const globeR = 5.02;

                const startCX = cx + (Math.random() - 0.5) * 200;
                const startCY = cy + (Math.random() - 0.5) * 200;
                const startCZ = (Math.random() - 0.5) * 150 + 150; // 初始更有“深空感”

                const colors = allCoverColors[i];
                const { positions, particleColors } = generateBookParticles(0, 0, 0, colors);

                const startIdx = i * PARTICLE_COUNT * 3;
                bookStartIndices.current.push(startIdx / 3);

                for (let j = 0; j < positions.length; j += 3) {
                    const px = positions[j];
                    const py = positions[j + 1];
                    const pz = positions[j + 2];

                    allOrig[startIdx + j]     = cx + px;
                    allOrig[startIdx + j + 1] = cy + py;
                    allOrig[startIdx + j + 2] = pz;

                    allStart[startIdx + j]     = startCX + px;
                    allStart[startIdx + j + 1] = startCY + py;
                    allStart[startIdx + j + 2] = startCZ + pz;

                    allPositions[startIdx + j]     = allStart[startIdx + j];
                    allPositions[startIdx + j + 1] = allStart[startIdx + j + 1];
                    allPositions[startIdx + j + 2] = allStart[startIdx + j + 2];

                    const rFinal = globeR + pz * 0.2;
                    allGlobe[startIdx + j]     = -rFinal * Math.sin(basePhi) * Math.cos(baseTheta);
                    allGlobe[startIdx + j + 1] = rFinal * Math.cos(basePhi);
                    allGlobe[startIdx + j + 2] = rFinal * Math.sin(basePhi) * Math.sin(baseTheta);

                    allColors[startIdx + j]     = particleColors[j];
                    allColors[startIdx + j + 1] = particleColors[j + 1];
                    allColors[startIdx + j + 2] = particleColors[j + 2];
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(allColors, 3));

            // 生成体积光感的小圆球贴图（Radial Gradient），替代扁平的点
            const circleCanvas = document.createElement('canvas');
            circleCanvas.width = 32;
            circleCanvas.height = 32;
            const ctx = circleCanvas.getContext('2d');
            const gradient = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');      // 高光核心
            gradient.addColorStop(0.3, 'rgba(255, 255, 255, 1)');     // 扩大白心区域
            gradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.5)');  // 软边缘
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      // 剔除
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 32, 32);
            const circleTexture = new THREE.CanvasTexture(circleCanvas);

            const mat = new THREE.PointsMaterial({
                size: IS_MOBILE ? 0.18 : 0.12, // 尺寸稍微调小，让细节更精致，不至于太肉
                map: circleTexture,
                alphaTest: 0.05, // 软剔除，保留球体柔和光晕
                vertexColors: true,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true,
            });

            const points = new THREE.Points(geo, mat);
            scene.add(points);

            // 入场动画全局进度控制器
            introRef.current.progress = 0;
            gsap.to(introRef.current, {
                progress: 1,
                duration: 3.2, // 总体时长拉长，更有史诗感
                ease: 'expo.out', // 由快到慢的极致曲线
                overwrite: 'auto'
            });

            // 呼吸动画（随机微浮动与入场插值融合在一起，产生平滑集结动效！）
            let t = 0;
            const breathe = () => {
                t += 0.012;
                const pos = geo.attributes.position.array;
                const p = introRef.current.progress;
                
                for (let i = 0; i < books.length; i++) {
                    const start = bookStartIndices.current[i];
                    for (let j = 0; j < PARTICLE_COUNT; j++) {
                        const idx = (start + j) * 3;
                        
                        let bx, by, bz;
                        if (p <= 1) {
                            // Stage 1: 从散落 -> 阵列
                            bx = allStart[idx]     + (allOrig[idx]     - allStart[idx])     * p;
                            by = allStart[idx + 1] + (allOrig[idx + 1] - allStart[idx + 1]) * p;
                            bz = allStart[idx + 2] + (allOrig[idx + 2] - allStart[idx + 2]) * p;
                        } else {
                            // Stage 2: 极致顺滑的刚性飞越 (每一本书作为一个整体矩形，优雅划过抛物线)
                            const p2 = p - 1; 
                            const startX = allOrig[idx], startY = allOrig[idx + 1], startZ = allOrig[idx + 2];
                            const endX = allGlobe[idx], endY = allGlobe[idx + 1], endZ = allGlobe[idx + 2];

                            // 抛物线弧度（统一弧度，不加随机散乱感，保证阅读感流畅）
                            const arch = Math.sin(p2 * Math.PI) * 4.5;
                            
                            bx = startX + (endX - startX) * p2;
                            by = startY + (endY - startY) * p2;
                            bz = startZ + (endZ - startZ) * p2 + arch; 
                        }

                        // 整个书架极其轻微的全局移动，不破坏封面成型
                        pos[idx + 2] = bz + Math.sin(t * 0.4 + i * 1.5) * 0.04;
                        pos[idx]     = bx;
                        pos[idx + 1] = by + Math.cos(t * 0.5 + i * 1.5) * 0.02;
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
