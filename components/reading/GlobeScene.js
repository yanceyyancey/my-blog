'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { gsap } from 'gsap';
import styles from './reading.module.css';

const RADIUS = 5;

// 经纬度 → 3D 坐标
function latLonToVec3(lat, lon, r = RADIUS + 0.12) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

const COUNTRY_COLORS = {
    US: '#7c3aed', GB: '#06b6d4', CN: '#f59e0b', JP: '#ec4899',
    FR: '#10b981', DE: '#8b5cf6', CO: '#f97316', IN: '#ef4444',
    AF: '#84cc16', IL: '#0ea5e9', AT: '#a78bfa',
};
function getColor(code) { return COUNTRY_COLORS[code] || '#6366f1'; }

export default function GlobeScene({ books, onBookClick }) {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);

    const init = useCallback(() => {
        const container = mountRef.current;
        if (!container || sceneRef.current) return;

        // ── Renderer (WebGL) ──
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // ── CSS2D Renderer (标签层) ──
        const labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0';
        labelRenderer.domElement.style.left = '0';
        labelRenderer.domElement.style.pointerEvents = 'none';
        container.appendChild(labelRenderer.domElement);

        // ── Scene & Camera ──
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 0, 16);

        // ── Controls ──
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 7;
        controls.maxDistance = 28;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;

        // ── 地球纹理加载 ──
        const loader = new THREE.TextureLoader();

        // 使用 NASA Blue Marble 贴图（多个备用 CDN）
        const EARTH_TEXTURE = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg';
        const BUMP_TEXTURE = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/gebco_08_rev_elev_21600x10800.png';
        const SPECULAR_TEXTURE = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/water_4k.png';

        const globeGeo = new THREE.SphereGeometry(RADIUS, 64, 64);

        // 先用简单材质渲染，纹理加载后自动替换
        const globeMat = new THREE.MeshPhongMaterial({
            color: 0x1a4a7a,
            emissive: 0x0a1628,
            emissiveIntensity: 0.3,
            shininess: 25,
        });
        const globe = new THREE.Mesh(globeGeo, globeMat);
        scene.add(globe);

        loader.load(EARTH_TEXTURE, (texture) => {
            globeMat.map = texture;
            globeMat.color.set(0xffffff);
            globeMat.emissiveIntensity = 0;
            globeMat.needsUpdate = true;
        });
        loader.load(BUMP_TEXTURE, (bump) => {
            globeMat.bumpMap = bump;
            globeMat.bumpScale = 0.05;
            globeMat.needsUpdate = true;
        });
        loader.load(SPECULAR_TEXTURE, (spec) => {
            globeMat.specularMap = spec;
            globeMat.specular = new THREE.Color(0x4488aa);
            globeMat.needsUpdate = true;
        });

        // ── 大气光晕层 ──
        const atmoGeo = new THREE.SphereGeometry(RADIUS * 1.025, 32, 32);
        const atmoMat = new THREE.ShaderMaterial({
            uniforms: { glowColor: { value: new THREE.Color(0x4080ff) } },
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
                    float intensity = pow(0.75 - dot(vNormal, vec3(0,0,1)), 4.0);
                    gl_FragColor = vec4(glowColor, intensity * 0.55);
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
        const starPos = new Float32Array(4000 * 3);
        for (let i = 0; i < 4000 * 3; i++) starPos[i] = (Math.random() - 0.5) * 800;
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
            color: 0xffffff, size: 0.3, transparent: true, opacity: 0.55
        })));

        // ── 光源 ──
        const ambient = new THREE.AmbientLight(0x404060, 1.8);
        scene.add(ambient);
        const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
        sunLight.position.set(20, 10, 15);
        scene.add(sunLight);
        const rimLight = new THREE.DirectionalLight(0x3060ff, 0.5);
        rimLight.position.set(-10, -5, -10);
        scene.add(rimLight);

        // ── 书籍标记点（按国家聚合）──
        const countryMap = {};
        books.forEach(b => {
            if (!b.lat && !b.lon) return;
            const key = b.countryCode || `${b.lat},${b.lon}`;
            if (!countryMap[key]) {
                countryMap[key] = {
                    books: [], lat: b.lat, lon: b.lon,
                    countryCode: b.countryCode, country: b.country
                };
            }
            countryMap[key].books.push(b);
        });

        const markers = [];
        const labelObjects = [];

        Object.values(countryMap).forEach(({ books: bks, lat, lon, countryCode, country }) => {
            const pos = latLonToVec3(lat, lon);
            const color = getColor(countryCode);
            const count = bks.length;

            // —— 发光标记点 ——
            const dotGeo = new THREE.SphereGeometry(0.05 + count * 0.025, 10, 10);
            const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.copy(pos);
            dot.userData = { books: bks, color, country, countryCode };
            scene.add(dot);
            markers.push(dot);

            // —— 光晕环 ——
            const ringGeo = new THREE.RingGeometry(0.12 + count * 0.03, 0.18 + count * 0.04, 16);
            const ringMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color(color), transparent: true, opacity: 0.3,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos);
            ring.lookAt(new THREE.Vector3(0, 0, 0)); // 面朝球心
            scene.add(ring);

            // —— 高度线（地表到标记点）——
            const surfacePos = latLonToVec3(lat, lon, RADIUS);
            const lineGeo = new THREE.BufferGeometry().setFromPoints([surfacePos, pos]);
            const lineMat = new THREE.LineBasicMaterial({
                color: new THREE.Color(color), transparent: true, opacity: 0.5
            });
            scene.add(new THREE.Line(lineGeo, lineMat));

            // —— CSS2D 国家标签 ——
            const div = document.createElement('div');
            div.className = 'globe-label';
            div.style.cssText = `
                background: rgba(0,0,0,0.75);
                border: 1px solid ${color};
                border-radius: 6px;
                padding: 3px 8px;
                color: ${color};
                font-size: 11px;
                font-family: 'Inter', sans-serif;
                font-weight: 600;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s;
                text-shadow: 0 1px 4px rgba(0,0,0,0.9);
                user-select: none;
            `;
            div.innerHTML = `${country} <span style="opacity:0.6">${count}本</span>`;

            const labelObj = new CSS2DObject(div);
            labelObj.position.copy(latLonToVec3(lat, lon, RADIUS + 0.45));
            labelObj.userData = { div, dotRef: dot };
            scene.add(labelObj);
            labelObjects.push(labelObj);
        });

        // ── Raycaster（点击 & hover）──
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let hoveredMarker = null;

        const onMouseMove = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(markers);

            // 重置所有标签
            labelObjects.forEach(l => { l.userData.div.style.opacity = '0'; });

            if (hits.length > 0) {
                const hit = hits[0].object;
                if (hoveredMarker !== hit) {
                    hoveredMarker = hit;
                    controls.autoRotate = false;
                }
                // 找到对应标签
                const idx = markers.indexOf(hit);
                if (idx >= 0 && labelObjects[idx]) {
                    labelObjects[idx].userData.div.style.opacity = '1';
                }
                renderer.domElement.style.cursor = 'pointer';
            } else {
                if (hoveredMarker) {
                    hoveredMarker = null;
                    setTimeout(() => { controls.autoRotate = true; }, 3000);
                }
                renderer.domElement.style.cursor = 'grab';
            }
        };

        // ── 相机飞行到标记点 ──
        const flyToMarker = (markerMesh, callback) => {
            controls.autoRotate = false;
            controls.enabled = false;

            // 目标：从标记点方向偏移一段距离作为相机位置
            const targetPos = markerMesh.position.clone().normalize().multiplyScalar(11);
            const lookAtVec = new THREE.Vector3(0, 0, 0);

            // 动画相机位置
            gsap.to(camera.position, {
                x: targetPos.x,
                y: targetPos.y,
                z: targetPos.z,
                duration: 1.6,
                ease: 'power3.inOut',
                onUpdate: () => {
                    camera.lookAt(lookAtVec);
                    controls.target.copy(lookAtVec);
                },
                onComplete: () => {
                    controls.enabled = true;
                    // 动画结束后触发回调（弹出 HUD）
                    if (callback) callback();
                    // 5s 后恢复自转
                    setTimeout(() => {
                        controls.autoRotate = true;
                    }, 5000);
                }
            });

            // 同步让地球微微抖动（震感反馈）
            gsap.fromTo(globe.rotation,
                { y: globe.rotation.y },
                { y: globe.rotation.y + 0.05, duration: 0.15, yoyo: true, repeat: 3, ease: 'sine.inOut' }
            );
        };

        const onClick = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(markers);
            if (hits.length > 0) {
                const hitMarker = hits[0].object;
                const { books: hitBooks } = hitMarker.userData;
                // 先飞过去，再弹 HUD
                flyToMarker(hitMarker, () => onBookClick(hitBooks[0]));
            }
        };

        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('click', onClick);

        // ── 动画循环 ──
        let animId;
        const clock = new THREE.Clock();
        const animate = () => {
            animId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            // 标记点脉冲缩放
            markers.forEach((m, i) => {
                const s = 1 + Math.sin(t * 2.5 + i * 1.2) * 0.25;
                m.scale.setScalar(s);
            });
            controls.update();
            renderer.render(scene, camera);
            labelRenderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            labelRenderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        sceneRef.current = { renderer, labelRenderer, animId, onResize, onMouseMove, onClick, container };
    }, [books, onBookClick]);

    useEffect(() => {
        init();
        return () => {
            const s = sceneRef.current;
            if (!s) return;
            cancelAnimationFrame(s.animId);
            s.renderer.domElement.removeEventListener('mousemove', s.onMouseMove);
            s.renderer.domElement.removeEventListener('click', s.onClick);
            window.removeEventListener('resize', s.onResize);
            s.renderer.dispose();
            // 清理 DOM
            while (s.container.firstChild) s.container.removeChild(s.container.firstChild);
            sceneRef.current = null;
        };
    }, [init]);

    return (
        <div
            ref={mountRef}
            style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                background: '#000008',
            }}
        />
    );
}
