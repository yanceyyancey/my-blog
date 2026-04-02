'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import styles from './reading.module.css';

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;
const SAMPLE_W = IS_MOBILE ? 22 : 45;
const SAMPLE_H = IS_MOBILE ? 30 : 60;
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
const GalaxyScene = forwardRef(({ books, onBookClick, onAddBook, isExitingToGlobe, onExited, visible = true }, ref) => {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const bookStartIndices = useRef([]); // 每本书粒子在大 array 中的起始索引
    const introRef = useRef({ progress: 0 });
    const cameraRef = useRef(null);
    const defaultZ = useRef(0);
    const prevIsExitingRef = useRef(isExitingToGlobe);
    const visibleRef = useRef(visible);
    const dissolvingBookIdxRef = useRef(null);
    const onBookClickRef = useRef(onBookClick);

    useEffect(() => { visibleRef.current = visible; }, [visible]);
    useEffect(() => { onBookClickRef.current = onBookClick; }, [onBookClick]);

    useImperativeHandle(ref, () => ({
        triggerBookDissolve: (bookIdx, callback) => {
            const s = sceneRef.current;
            if (!s || !bookStartIndices.current[bookIdx]) return;
            dissolvingBookIdxRef.current = bookIdx; // 标记开始解体
            const startIdx = bookStartIndices.current[bookIdx];
            s.triggerDissolve(s.geo, startIdx, () => {
                dissolvingBookIdxRef.current = null; // 解体完成后重置，准备飞入
                if (callback) callback();
            });
        }
    }));
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
            // 离场阶段不再进行粒子透明度衰减，而是直接飞往球体位置，直到 CSS 层级进行场景切换
            if (sceneRef.current) {
                gsap.to(sceneRef.current.points.material, {
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
        } else if (prevIsExitingRef.current === true) {
            // 这是从“地球模式”切换回“粒子书墙模式”的关键触发点
            console.log('>>> [ACTION] Returning to Wall Layout...');
            gsap.killTweensOf(introRef.current);
            gsap.to(introRef.current, {
                progress: 1,
                duration: 1.2,
                ease: 'expo.inOut',
                overwrite: 'auto'
            });
            if (sceneRef.current) {
                gsap.to(sceneRef.current.points.material, {
                    opacity: 0.95,
                    size: IS_MOBILE ? 0.18 : 0.12,
                    duration: 0.8,
                    ease: 'power3.out'
                });
            }
            // 关键修复：从地球返回书墙时，必须重新启用 OrbitControls 交互
            if (sceneRef.current && sceneRef.current.controls) {
                sceneRef.current.controls.enabled = true;
            }
        }
        prevIsExitingRef.current = isExitingToGlobe;
        // 核心：状态切换时强制清除动效锁，找回书墙的 3D 呼吸感
        dissolvingBookIdxRef.current = null; 
    }, [isExitingToGlobe, onExited]);

    // 冗余保障：当 visible 变为 true 时，如果进度还停留在地球状态，自动拉回书墙模式
    useEffect(() => {
        if (visible && introRef.current.progress >= 2 && !isExitingToGlobe) {
            console.log('>>> [AUTO-FIX] Restoring Wall Layout on Visibility...');            if (cameraRef.current && defaultZ.current > 0) gsap.to(cameraRef.current.position, { z: defaultZ.current, duration: 1, ease: 'expo.out' });
            dissolvingBookIdxRef.current = null;
        }
    }, [visible, isExitingToGlobe]);

    // ---- 真正的场景初始化 (Renderer/Camera/Controls) 只运行一次 ----
    const initEngine = useCallback(() => {
        if (!canvasRef.current || sceneRef.current) return;

        const canvas = canvasRef.current;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        cameraRef.current = camera;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 5;
        controls.maxDistance = 80;

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersectionPoint = new THREE.Vector3();

        // 存储引擎实例
        sceneRef.current = { 
            renderer, scene, camera, controls, raycaster, pointer, planeZ0, intersectionPoint,
            booksLoaded: false,
            points: null,
            geo: null
        };

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        let animId;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            if (visibleRef.current) {
                if (sceneRef.current.breathe) sceneRef.current.breathe();
                controls.update();
                renderer.render(scene, camera);
            }
        };
        animate();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', onResize);
            renderer.dispose();
        };
    }, []);

    // ---- 书籍数据加载/更新逻辑 (响应 [books] 变化) ----
    const updateBookshelf = useCallback(async (currentBooks) => {
        const s = sceneRef.current;
        if (!s || currentBooks.length === 0) return;

        console.log('>>> [ACTION] Syncing Bookshelf Data:', currentBooks.length);

        // 1. 采样封面颜色
        const allCoverColors = await Promise.all(currentBooks.map(b => {
            const proxyUrl = `/api/cover-proxy?url=${encodeURIComponent(b.coverUrl || '')}`;
            return sampleCoverColors(proxyUrl);
        }));

        // 2. 准备缓冲区数据
        const totalParticles = currentBooks.length * PARTICLE_COUNT;
        const allPositions = new Float32Array(totalParticles * 3);
        const allColors = new Float32Array(totalParticles * 3);
        const allOrig = new Float32Array(totalParticles * 3); 
        const allStart = new Float32Array(totalParticles * 3); 
        const allGlobe = new Float32Array(totalParticles * 3); 

        const cols = Math.ceil(Math.sqrt(currentBooks.length));
        const rows = Math.ceil(currentBooks.length / cols);
        const SPACING_X = 2.8, SPACING_Y = 3.8;

        const indices = [];

        for (let i = 0; i < currentBooks.length; i++) {
            const book = currentBooks[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx = (col - (cols - 1) / 2) * SPACING_X;
            const cy = -(row - (rows - 1) / 2) * SPACING_Y;

            let lat = book.lat ?? 0, lon = book.lon ?? 0;
            const basePhi = (90 - lat) * Math.PI / 180;
            const baseTheta = (lon + 180) * Math.PI / 180;
            const globeR = 5.02;

            const startCX = cx + (Math.random() - 0.5) * 300, startCY = cy + (Math.random() - 0.5) * 300;
            const startCZ = (Math.random() - 0.5) * 400 + 350;

            const colors = allCoverColors[i];
            const { positions, particleColors } = generateBookParticles(0, 0, 0, colors);
            const startIdx = i * PARTICLE_COUNT * 3;
            indices.push(startIdx / 3);

            for (let j = 0; j < positions.length; j += 3) {
                const idx = startIdx + j;
                allOrig[idx] = cx + positions[j];
                allOrig[idx + 1] = cy + positions[j + 1];
                allOrig[idx + 2] = positions[j + 2];
                allStart[idx] = startCX + positions[j];
                allStart[idx + 1] = startCY + positions[j + 1];
                allStart[idx + 2] = startCZ + positions[j + 2];
                allPositions[idx] = allStart[idx];
                allPositions[idx + 1] = allStart[idx + 1];
                allPositions[idx + 2] = allStart[idx + 2];
                const rFinal = globeR + positions[j + 2] * 0.2;
                allGlobe[idx] = -rFinal * Math.sin(basePhi) * Math.cos(baseTheta);
                allGlobe[idx + 1] = rFinal * Math.cos(basePhi);
                allGlobe[idx + 2] = rFinal * Math.sin(basePhi) * Math.sin(baseTheta);
                allColors[idx] = particleColors[j];
                allColors[idx + 1] = particleColors[j + 1];
                allColors[idx + 2] = particleColors[j + 2];
            }
        }

        // 3. 构建/更新 BufferGeometry
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(allColors, 3));
        geo.computeBoundingSphere();

        // 4. 清理旧内容并替换新内容
        if (s.points) {
            s.scene.remove(s.points);
            s.geo?.dispose();
        }

        const circleTexture = new THREE.CanvasTexture(
            (() => {
                const c = document.createElement('canvas'); c.width = 32; c.height = 32;
                const ctx = c.getContext('2d');
                const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
                g.addColorStop(0, 'rgba(255, 255, 255, 1)'); g.addColorStop(0.3, 'rgba(255, 255, 255, 1)');
                g.addColorStop(0.65, 'rgba(255, 255, 255, 0.5)'); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); return c;
            })()
        );

        const mat = new THREE.PointsMaterial({
            size: IS_MOBILE ? 0.18 : 0.12, map: circleTexture, alphaTest: 0.05,
            vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        s.scene.add(points);

        // 5. 更新 Ref 存储
        bookStartIndices.current = indices;
        s.geo = geo; s.points = points;
        s.allStart = allStart; s.allOrig = allOrig; s.allGlobe = allGlobe;

        const updateBreathe = () => {
            if (dissolvingBookIdxRef.current !== null) return;
            const p = introRef.current.progress;
            const pos = geo.attributes.position.array;
            const t = Date.now() * 0.001 * 0.6;
            for (let i = 0; i < currentBooks.length; i++) {
                if (i === dissolvingBookIdxRef.current) continue;
                const start = indices[i];
                const iOffset = i * 1.5;
                for (let j = 0; j < PARTICLE_COUNT; j++) {
                    const idx = (start + j) * 3;
                    let bx, by, bz;
                    if (p <= 1) {
                        bx = allStart[idx] + (allOrig[idx] - allStart[idx]) * p;
                        by = allStart[idx + 1] + (allOrig[idx + 1] - allStart[idx + 1]) * p;
                        bz = allStart[idx + 2] + (allOrig[idx + 2] - allStart[idx + 2]) * p;
                    } else {
                        const p2 = p - 1;
                        bx = allOrig[idx] + (allGlobe[idx] - allOrig[idx]) * p2;
                        by = allOrig[idx + 1] + (allGlobe[idx + 1] - allOrig[idx + 1]) * p2;
                        bz = allOrig[idx + 2] + (allGlobe[idx + 2] - allOrig[idx + 2]) * p2 + Math.sin(p2 * Math.PI) * 4.5;
                    }
                    pos[idx] = bx;
                    pos[idx + 1] = by + Math.cos(t + iOffset) * 0.02;
                    pos[idx + 2] = bz + Math.sin(t * 0.8 + iOffset) * 0.04;
                }
            }
            geo.attributes.position.needsUpdate = true;
        };
        s.breathe = updateBreathe;

        // 6. 重新校准相机
        const gridW = (cols - 1) * SPACING_X + 2.5;
        const gridH = (rows - 1) * SPACING_Y + 3.33;
        const aspect = window.innerWidth / window.innerHeight;
        const fovRad = (60 * Math.PI) / 180;
        const requiredZ = Math.max((gridH / 2) / Math.tan(fovRad / 2), (gridW / 2) / Math.tan(fovRad / 2) / aspect);
        defaultZ.current = aspect < 0.8 ? requiredZ * 1.35 : requiredZ * 1.15;
        
        if (!s.booksLoaded) {
            s.camera.position.z = defaultZ.current;
            s.booksLoaded = true;
            introRef.current.progress = 0;
            gsap.to(introRef.current, { progress: 1, duration: 2.8, ease: 'expo.out' });
        }

        setLoaded(true);
    }, []);

    useEffect(() => {
        const cleanup = initEngine();
        return () => cleanup?.();
    }, [initEngine]);

    useEffect(() => {
        if (books.length > 0) updateBookshelf(books);
    }, [books, updateBookshelf]);

    const triggerDissolve = (startParticleIdx, callback) => {
        const s = sceneRef.current; if (!s || !s.geo) return;
        s.controls.enabled = false;
        const pos = s.geo.attributes.position.array;
        const temp = [];
        for (let j = 0; j < PARTICLE_COUNT; j++) {
            const idx = (startParticleIdx + j) * 3;
            temp.push({ 
                x: pos[idx], y: pos[idx + 1], z: pos[idx + 2], 
                tx: (Math.random() - 0.5) * 40, ty: (Math.random() - 0.5) * 40, tz: (Math.random() - 0.5) * 40 
            });
        }
        gsap.to({ p: 0 }, {
            p: 1, duration: 1.2, ease: 'power2.inOut',
            onUpdate: function () {
                const p = this.progress();
                for (let j = 0; j < PARTICLE_COUNT; j++) {
                    const idx = (startParticleIdx + j) * 3;
                    const o = temp[j];
                    pos[idx] = o.x + (o.tx - o.x) * p;
                    pos[idx+1] = o.y + (o.ty - o.y) * p;
                    pos[idx+2] = o.z + (o.tz - o.z) * p;
                }
                s.geo.attributes.position.needsUpdate = true;
            },
            onComplete: callback
        });
    };

    useImperativeHandle(ref, () => ({
        triggerBookDissolve: (bookIdx, callback) => {
            if (bookStartIndices.current[bookIdx] !== undefined) {
                dissolvingBookIdxRef.current = bookIdx;
                triggerDissolve(bookStartIndices.current[bookIdx], () => {
                    dissolvingBookIdxRef.current = null;
                    callback?.();
                });
            }
        }
    }));
    
    // ---- 点击检测 (保持原有数学网格投影法) ----
    useEffect(() => {
        const s = sceneRef.current; if(!s || !s.renderer) return;
        const canvas = s.renderer.domElement;
        const onClick = (e) => {
            if (introRef.current.progress > 1.1) return; // 球体模式或飞星中禁用书墙点击
            const rect = canvas.getBoundingClientRect();
            s.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            s.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            s.raycaster.setFromCamera(s.pointer, s.camera);
            if (s.raycaster.ray.intersectPlane(s.planeZ0, s.intersectionPoint)) {
                const cols = Math.ceil(Math.sqrt(books.length));
                const SPACING_X = 2.8, SPACING_Y = 3.8;
                const col = Math.round(s.intersectionPoint.x / SPACING_X + (cols - 1) / 2);
                const row = Math.round(-s.intersectionPoint.y / SPACING_Y + (Math.ceil(books.length / cols) - 1) / 2);
                const idx = row * cols + col;
                if (idx >= 0 && idx < books.length) {
                    dissolvingBookIdxRef.current = idx;
                    triggerDissolve(bookStartIndices.current[idx], () => {
                        dissolvingBookIdxRef.current = null;
                        onBookClickRef.current?.(books[idx]);
                    });
                }
            }
        };
        canvas.addEventListener('click', onClick);
        return () => canvas.removeEventListener('click', onClick);
    }, [books.length]); // 只需要在书堆数量变化时重绑定逻辑
    return (
        <>
            <canvas ref={canvasRef} className={styles.canvas} />
            {/* 已移除所有加载遮罩，实现静默快速启动 */}
        </>
    );
});

export default GalaxyScene;
