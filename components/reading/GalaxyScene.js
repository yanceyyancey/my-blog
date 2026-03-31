'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import styles from './reading.module.css';

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;
const SAMPLE_W = IS_MOBILE ? 22 : 42;
const SAMPLE_H = IS_MOBILE ? 30 : 56;
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
                img.onerror();
            }
        };
        img.onerror = () => {
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
            positions.push(x, y, 0);
            particleColors.push(colors[ci], colors[ci + 1], colors[ci + 2]);
            ci += 3;
        }
    }
    return { positions, particleColors };
}

export default function GalaxyScene({ books, onBookClick, onAddBook, isExitingToGlobe, onExited }) {
    const canvasRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const uniforms = useRef({
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uDissolveIdx: { value: -1.0 },
        uDissolveProgress: { value: 0 },
        uOpacity: { value: 1.0 },
        uSize: { value: IS_MOBILE ? 0.22 : 0.16 },
        uMap: { value: null }
    });

    useEffect(() => {
        if (isExitingToGlobe) {
            gsap.to(uniforms.current.uProgress, {
                value: 2, 
                duration: 1.0,
                ease: 'power3.inOut',
                onComplete: () => onExited?.()
            });
            gsap.to(uniforms.current.uOpacity, { value: 0, duration: 1.0 });
        }
    }, [isExitingToGlobe, onExited]);

    useEffect(() => {
        if (!canvasRef.current || books.length === 0) return;

        const canvas = canvasRef.current;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

        const cols = Math.ceil(Math.sqrt(books.length));
        const rows = Math.ceil(books.length / cols);
        const SPACING_X = 2.8, SPACING_Y = 3.8;
        const gridW = (cols - 1) * SPACING_X + 2.5; 
        const gridH = (rows - 1) * SPACING_Y + 3.33;
        const aspect = window.innerWidth / window.innerHeight;
        const fovRad = (60 * Math.PI) / 180;
        const requiredZ = Math.max((gridH / 2) / Math.tan(fovRad / 2), (gridW / 2) / Math.tan(fovRad / 2) / aspect);
        camera.position.set(0, 0, requiredZ * 1.15);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const buildScene = async () => {
            const total = books.length * PARTICLE_COUNT;
            const aTarget = new Float32Array(total * 3);
            const aScatter = new Float32Array(total * 3);
            const aGlobe = new Float32Array(total * 3);
            const aColor = new Float32Array(total * 3);
            const aRandom = new Float32Array(total * 3);
            const aBookIdx = new Float32Array(total);

            const allCoverColors = await Promise.all(books.map(b => {
                const proxyUrl = `/api/cover-proxy?url=${encodeURIComponent(b.coverUrl || '')}`;
                return sampleCoverColors(proxyUrl);
            }));

            for (let i = 0; i < books.length; i++) {
                const book = books[i];
                const colIdx = i % cols, rowIdx = Math.floor(i / cols);
                const cx = (colIdx - (cols - 1) / 2) * SPACING_X;
                const cy = -(rowIdx - (rows - 1) / 2) * SPACING_Y;

                let lat = book.lat ?? ((Math.random()*120)-60), lon = book.lon ?? ((Math.random()*240)-120);
                const basePhi = (90 - lat) * Math.PI / 180, baseTheta = (lon + 180) * Math.PI / 180;
                const globeR = 5.02;

                const { positions, particleColors } = generateBookParticles(0, 0, 0, allCoverColors[i]);
                const startIdx = i * PARTICLE_COUNT;

                for (let j = 0; j < PARTICLE_COUNT; j++) {
                    const idx = (startIdx + j) * 3;
                    const px = positions[j*3], py = positions[j*3+1], pz = positions[j*3+2];
                    
                    aTarget[idx] = cx + px; aTarget[idx+1] = cy + py; aTarget[idx+2] = pz;
                    aScatter[idx] = aTarget[idx] + (Math.random()-0.5)*260;
                    aScatter[idx+1] = aTarget[idx+1] + (Math.random()-0.5)*260;
                    aScatter[idx+2] = (Math.random()-0.5)*200 + 200;

                    const rFinal = globeR + pz * 0.2;
                    aGlobe[idx] = -rFinal * Math.sin(basePhi) * Math.cos(baseTheta);
                    aGlobe[idx+1] = rFinal * Math.cos(basePhi);
                    aGlobe[idx+2] = rFinal * Math.sin(basePhi) * Math.sin(baseTheta);

                    aColor[idx] = particleColors[j*3]; aColor[idx+1] = particleColors[j*3+1]; aColor[idx+2] = particleColors[j*3+2];
                    aRandom[idx] = Math.random(); aRandom[idx+1] = Math.random(); aRandom[idx+2] = Math.random();
                    aBookIdx[startIdx + j] = i;
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('aTarget', new THREE.BufferAttribute(aTarget, 3));
            geo.setAttribute('aScatter', new THREE.BufferAttribute(aScatter, 3));
            geo.setAttribute('aGlobe', new THREE.BufferAttribute(aGlobe, 3));
            geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
            geo.setAttribute('aRandom', new THREE.BufferAttribute(aRandom, 3));
            geo.setAttribute('aBookIdx', new THREE.BufferAttribute(aBookIdx, 1));
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));

            const circleCanvas = document.createElement('canvas'); circleCanvas.width = 32; circleCanvas.height = 32;
            const ctx = circleCanvas.getContext('2d');
            const grad = ctx.createRadialGradient(16,16,2,16,16,16);
            grad.addColorStop(0,'#fff'); grad.addColorStop(0.35,'#fff'); grad.addColorStop(0.7,'rgba(255,255,255,0.4)'); grad.addColorStop(1,'transparent');
            ctx.fillStyle = grad; ctx.fillRect(0,0,32,32);
            uniforms.current.uMap.value = new THREE.CanvasTexture(circleCanvas);

            const mat = new THREE.ShaderMaterial({
                uniforms: uniforms.current,
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
                vertexShader: `
                    attribute vec3 aTarget; attribute vec3 aScatter; attribute vec3 aGlobe;
                    attribute vec3 aColor; attribute vec3 aRandom; attribute float aBookIdx;
                    uniform float uTime; uniform float uProgress; uniform float uSize;
                    uniform float uDissolveIdx; uniform float uDissolveProgress;
                    varying vec3 vColor; varying float vSizeScale;
                    void main() {
                        vColor = aColor;
                        vec3 pos;
                        if (uProgress <= 1.0) {
                            float p = smoothstep(0.0, 1.0, uProgress);
                            pos = mix(aScatter, aTarget, p);
                        } else {
                            float p = clamp(uProgress - 1.0, 0.0, 1.0);
                            float arch = sin(p * 3.14159) * 4.5;
                            pos = mix(aTarget, aGlobe, p);
                            pos.z += arch;
                        }
                        
                        // 增强呼吸感 & 有机律动
                        float breathing = sin(uTime * 1.5 + aBookIdx * 0.8) * 0.08;
                        pos.z += breathing;
                        pos.x += sin(uTime * 0.3 + aRandom.x * 6.28) * 0.03;
                        pos.y += cos(uTime * 0.4 + aRandom.y * 6.28) * 0.03;

                        if (abs(uDissolveIdx - aBookIdx) < 0.1) {
                            pos += (aRandom - 0.5) * 40.0 * uDissolveProgress;
                            vSizeScale = 1.0 - uDissolveProgress;
                        } else { vSizeScale = 1.0; }

                        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                        gl_PointSize = uSize * (300.0 / -mvPosition.z) * vSizeScale;
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform sampler2D uMap; uniform float uOpacity; varying vec3 vColor; varying float vSizeScale;
                    void main() {
                        if (vSizeScale < 0.01) discard;
                        vec4 tex = texture2D(uMap, gl_PointCoord);
                        gl_FragColor = vec4(vColor * tex.rgb, tex.a * uOpacity * vSizeScale);
                    }
                `
            });

            const points = new THREE.Points(geo, mat);
            scene.add(points);
            gsap.to(uniforms.current.uProgress, { value: 1, duration: 4.0, ease: 'expo.out' });

            const onClick = (e) => {
                const rect = canvas.getBoundingClientRect();
                const mouse = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
                const ray = new THREE.Raycaster(); ray.params.Points.threshold = 0.2;
                ray.setFromCamera(mouse, camera);
                const hits = ray.intersectObject(points);
                if (hits.length > 0) {
                    const bIdx = geo.attributes.aBookIdx.getX(hits[0].index);
                    uniforms.current.uDissolveIdx.value = bIdx;
                    gsap.to(uniforms.current.uDissolveProgress, {
                        value: 1, duration: 1.2, ease: 'power3.in',
                        onComplete: () => onBookClick(books[bIdx])
                    });
                }
            };
            canvas.addEventListener('click', onClick);
            
            setLoaded(true);
            let frame;
            const tick = () => {
                frame = requestAnimationFrame(tick);
                uniforms.current.uTime.value += 0.016;
                controls.update(); renderer.render(scene, camera);
            };
            tick();

            return () => {
                cancelAnimationFrame(frame);
                canvas.removeEventListener('click', onClick);
                renderer.dispose(); geo.dispose(); mat.dispose();
            };
        };
        buildScene();
    }, [books, onBookClick]);

    return (
        <div style={{ width:'100%', height:'100vh', background:'#000' }}>
            <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
            {!loaded && <div className={styles.loadingOverlay}><div className={styles.loadingSpinner} /></div>}
        </div>
    );
}
