'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import styles from './reading.module.css';

const RADIUS = 5;

// 经纬度 → 3D 坐标
function latLonToVec3(lat, lon, r = RADIUS + 0.08) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

// 国家颜色映射（波普艺术风格）
const COUNTRY_COLORS = {
    US: 0x7c3aed, GB: 0x06b6d4, CN: 0xf59e0b, JP: 0xec4899,
    FR: 0x10b981, DE: 0x8b5cf6, CO: 0xf97316, IN: 0xef4444,
    AF: 0x84cc16, IL: 0x0ea5e9, AT: 0xa78bfa,
};
function countryColor(code) {
    return COUNTRY_COLORS[code] || 0x6366f1;
}

export default function GlobeScene({ books, onBookClick }) {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);

    const init = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || sceneRef.current) return;

        // ── Renderer ──
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);

        // ── Scene & Camera ──
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 0, 16);

        // ── Controls ──
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 8;
        controls.maxDistance = 25;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.4;

        // ── 地球本体（程序化着色器）──
        const globeGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
        const globeMat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                baseColor: { value: new THREE.Color(0x0a1628) },
                oceanColor: { value: new THREE.Color(0x0d2347) },
                landColor: { value: new THREE.Color(0x1a3a5c) },
                glowColor: { value: new THREE.Color(0x7c3aed) },
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 baseColor;
                uniform vec3 oceanColor;
                uniform vec3 landColor;
                uniform vec3 glowColor;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;

                // 简单噪声函数
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(hash(i), hash(i + vec2(1,0)), f.x),
                        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
                }

                void main() {
                    // 极光边缘光晕
                    float rim = 1.0 - max(dot(vNormal, vec3(0,0,1)), 0.0);
                    rim = pow(rim, 2.5);

                    // 大陆噪声
                    float n = noise(vUv * 8.0) * 0.5 + noise(vUv * 16.0) * 0.25 + noise(vUv * 32.0) * 0.125;
                    float land = smoothstep(0.48, 0.52, n);

                    // 经纬线网格
                    float gridLat = abs(sin(vUv.y * 3.14159 * 18.0));
                    float gridLon = abs(sin(vUv.x * 3.14159 * 36.0));
                    float grid = smoothstep(0.94, 1.0, max(gridLat, gridLon)) * 0.15;

                    vec3 color = mix(oceanColor, landColor, land);
                    color = mix(color, color + vec3(grid), 1.0);
                    color += glowColor * rim * 0.6;

                    // 动态微弱脉冲
                    float pulse = sin(time * 0.5) * 0.02 + 0.02;
                    color += glowColor * pulse;

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
        });
        const globe = new THREE.Mesh(globeGeo, globeMat);
        scene.add(globe);

        // ── 大气发光层 ──
        const atmoGeo = new THREE.SphereGeometry(RADIUS * 1.04, 32, 32);
        const atmoMat = new THREE.ShaderMaterial({
            uniforms: { glowColor: { value: new THREE.Color(0x4f46e5) } },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 glowColor;
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(0.8 - dot(vNormal, vec3(0,0,1)), 3.0);
                    gl_FragColor = vec4(glowColor, intensity * 0.5);
                }
            `,
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
        });
        scene.add(new THREE.Mesh(atmoGeo, atmoMat));

        // ── 星空背景 ──
        const starGeo = new THREE.BufferGeometry();
        const starPos = new Float32Array(3000 * 3);
        for (let i = 0; i < 3000 * 3; i++) starPos[i] = (Math.random() - 0.5) * 600;
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
            color: 0xffffff, size: 0.25, transparent: true, opacity: 0.6
        })));

        // ── 光源 ──
        scene.add(new THREE.AmbientLight(0x334466, 1.5));
        const dirLight = new THREE.DirectionalLight(0x7c9eff, 2);
        dirLight.position.set(10, 5, 10);
        scene.add(dirLight);

        // ── 书籍标记点 ──
        const booksByCountry = {};
        books.forEach(b => {
            if (!b.lat && !b.lon) return;
            const key = `${b.lat},${b.lon}`;
            if (!booksByCountry[key]) booksByCountry[key] = { books: [], lat: b.lat, lon: b.lon, countryCode: b.countryCode };
            booksByCountry[key].books.push(b);
        });

        const markers = [];
        Object.values(booksByCountry).forEach(({ books: bks, lat, lon, countryCode }) => {
            const pos = latLonToVec3(lat, lon);
            const color = countryColor(countryCode);

            // 发光点
            const dotGeo = new THREE.SphereGeometry(0.06 + bks.length * 0.02, 8, 8);
            const dotMat = new THREE.MeshBasicMaterial({ color });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.copy(pos);
            dot.userData = { books: bks };
            scene.add(dot);
            markers.push(dot);

            // 光晕（halo）
            const haloGeo = new THREE.SphereGeometry(0.15 + bks.length * 0.03, 8, 8);
            const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 });
            const halo = new THREE.Mesh(haloGeo, haloMat);
            halo.position.copy(pos);
            scene.add(halo);

            // 竖线（spike）
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                latLonToVec3(lat, lon, RADIUS),
                pos,
            ]);
            const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
            scene.add(new THREE.Line(lineGeo, lineMat));
        });

        // ── Raycaster（点击检测）──
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const onClick = (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(markers);
            if (hits.length > 0) {
                const { books: hitBooks } = hits[0].object.userData;
                onBookClick(hitBooks[0]);
                controls.autoRotate = false;
                setTimeout(() => { controls.autoRotate = true; }, 5000);
            }
        };
        canvas.addEventListener('click', onClick);

        // ── 动画循环 ──
        let animId;
        const clock = new THREE.Clock();
        const animate = () => {
            animId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            globeMat.uniforms.time.value = t;
            // 标记点脉冲
            markers.forEach((m, i) => {
                const s = 1 + Math.sin(t * 2 + i) * 0.15;
                m.scale.setScalar(s);
            });
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

        sceneRef.current = { renderer, animId, onClick, onResize, controls };
    }, [books, onBookClick]);

    useEffect(() => {
        init();
        return () => {
            const s = sceneRef.current;
            if (!s) return;
            cancelAnimationFrame(s.animId);
            s.renderer.dispose();
            window.removeEventListener('resize', s.onResize);
            canvasRef.current?.removeEventListener('click', s.onClick);
            sceneRef.current = null;
        };
    }, [init]);

    return <canvas ref={canvasRef} className={styles.canvas} style={{ cursor: 'grab' }} />;
}
