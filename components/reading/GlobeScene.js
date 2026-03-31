'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const R = 5; // 地球半径

// ── 经纬度 → 3D 坐标 ─────────────────────────────────────────────
function geo2xyz(lat, lon, r = R) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

// ── 2D 局部坐标投影（墨卡托近似）─────────────────────────────────
function project2D(lon, lat, cLon, cLat) {
    const cosC = Math.cos(cLat * Math.PI / 180);
    return [(lon - cLon) * cosC, lat - cLat];
}

// ── easeInOutCubic ────────────────────────────────────────────────
const ease3 = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ── GeoJSON module-level cache ────────────────────────────────────
let geoCache = null;

async function getCountryGeo(isoA2) {
    if (!geoCache) {
        const res = await fetch('/countries.geojson');
        geoCache = await res.json();
    }
    const feat = geoCache.features.find(f => {
        const p = f.properties;
        return p.ISO_A2 === isoA2 || p.iso_a2 === isoA2 ||
               p.ADM0_A3 === isoA2 || p.ISO_A3 === isoA2;
    });
    return feat ? feat.geometry : null;
}

// ── 通过代理加载封面图（解决 CORS）────────────────────────────────
function proxyCoverUrl(url) {
    if (!url) return null;
    return `/api/cover-proxy?url=${encodeURIComponent(url)}`;
}

// ── 书封面 Canvas 纹理（书封面强制 3:4 平铺，单本无限平铺模式）───────
function makeCoverTexture(books, colorHex) {
    // 强制 Canvas 比例为 3:4
    const W = 512;
    const H = Math.round(W / (3 / 4));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 背景色
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, W, H);

    // 找第一本有封面的书
    const book = books.find(b => b.coverUrl);
    if (!book) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return Promise.resolve(tex);
    }

    const proxied = proxyCoverUrl(book.coverUrl);

    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const finish = () => {
            if (img.naturalWidth > 0) {
                // 原图中心裁剪到 3:4
                const target = 3 / 4;
                const src = img.naturalWidth / img.naturalHeight;
                let sw, sh, sx = 0, sy = 0;
                if (src > target) {
                    sh = img.naturalHeight; sw = sh * target;
                    sx = (img.naturalWidth - sw) / 2;
                } else {
                    sw = img.naturalWidth; sh = sw / target;
                    sy = (img.naturalHeight - sh) / 2;
                }
                // 画单张满屏
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
        };
        img.onload = finish;
        img.onerror = () => finish();
        img.src = proxied;
    });
}

// ── 国家多边形 → ShaderMesh（完美细分贴合曲面，无惧巨大跨度穿模）─
function buildCountryMeshes(geometry, cLat, cLon, texture) {
    const meshes = [];
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const cosC = Math.cos(cLat * Math.PI / 180);

    for (const poly of polys) {
        if (!poly[0] || poly[0].length < 3) continue;

        const pts2D = poly[0].map(([lon, lat]) => new THREE.Vector2(...project2D(lon, lat, cLon, cLat)));
        const shape = new THREE.Shape(pts2D);

        for (let h = 1; h < poly.length; h++) {
            const hole = poly[h].map(([lon, lat]) => new THREE.Vector2(...project2D(lon, lat, cLon, cLat)));
            shape.holes.push(new THREE.Path(hole));
        }

        const shapeGeo = new THREE.ShapeGeometry(shape, 8);
        const nonIndexedGeo = shapeGeo.toNonIndexed();
        const pArr = nonIndexedGeo.attributes.position.array;

        // 2D 递归细分（Tessellation），防止大国多边形穿透地心
        let triangles = [];
        for (let i = 0; i < pArr.length / 9; i++) {
            triangles.push({
                pts: [
                    new THREE.Vector2(pArr[i*9], pArr[i*9+1]),
                    new THREE.Vector2(pArr[i*9+3], pArr[i*9+4]),
                    new THREE.Vector2(pArr[i*9+6], pArr[i*9+7])
                ]
            });
        }

        const maxLen = 1.0; // 细分粒度
        let changed = true;
        let safety = 0;
        while(changed && safety < 10) {
            safety++;
            changed = false;
            let nextTriangles = [];
            for (let tri of triangles) {
                const [v1, v2, v3] = tri.pts;
                if (v1.distanceTo(v2) > maxLen || v2.distanceTo(v3) > maxLen || v3.distanceTo(v1) > maxLen) {
                    changed = true;
                    const c = new THREE.Vector2().add(v1).add(v2).add(v3).divideScalar(3);
                    nextTriangles.push({ pts: [v1, v2, c] }, { pts: [v2, v3, c] }, { pts: [v3, v1, c] });
                } else {
                    nextTriangles.push(tri);
                }
            }
            triangles = nextTriangles;
            if (triangles.length > 20000) break;
        }

        const count = triangles.length * 3;
        const newPos = new Float32Array(count * 3);
        const newUV  = new Float32Array(count * 2);
        const TILE = 8; // 增加平铺密度使国家版图内的封面更密集，复刻参考图效果
        // 书籍封面强制 3:4。为避免在世界空间贴图拉伸，让 X 轴向 UV 按照绝对比例等比缩放
        const uScaleX = TILE * (3 / 4);
        const uScaleY = TILE;

        let ptr = 0;
        for (let tri of triangles) {
            for (const v2d of tri.pts) {
                const lon = cosC > 0.001 ? v2d.x / cosC + cLon : cLon;
                const lat = v2d.y + cLat;
                const v3d = geo2xyz(lat, lon, R + 0.02); // 严丝合缝贴地飞行
                newPos[ptr*3]   = v3d.x;
                newPos[ptr*3+1] = v3d.y;
                newPos[ptr*3+2] = v3d.z;
                // 书封面保持物理世界绝对的 3:4 比例映射
                newUV[ptr*2]   = v2d.x / uScaleX;
                newUV[ptr*2+1] = v2d.y / uScaleY;
                ptr++;
            }
        }

        const finalGeo = new THREE.BufferGeometry();
        finalGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
        finalGeo.setAttribute('uv', new THREE.BufferAttribute(newUV, 2));
        finalGeo.computeVertexNormals();

        const mat = new THREE.ShaderMaterial({
            uniforms: { uMap: { value: texture }, uOpacity: { value: 1.0 } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
                uniform sampler2D uMap;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    vec4 col = texture2D(uMap, fract(vUv));
                    // 彻底满足波普艺术边界裁切 discard: 完全剔除透明像素或在彻底显示前隐藏
                    if (uOpacity <= 0.02 || col.a < 0.1) discard;
                    gl_FragColor = vec4(col.rgb, uOpacity);
                }
            `,
            transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending
        });

        meshes.push(new THREE.Mesh(finalGeo, mat));
    }
    return meshes;
}

// ── 粒子流：精细覆盖目标国家的版图，完成分散聚合动画 ─────────────────────
function MathEase(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function spawnParticles(scene, centerSurface, meshes, color, onDone) {
    const N = 400; // 海量粒子
    const arr = new Float32Array(N * 3);
    const starts = [];
    const targets = [];

    // 精准将粒子目标分配到国家多边形顶点上
    const geoPts = [];
    if (meshes && meshes.length > 0) {
        meshes.forEach(m => {
            const p = m.geometry.attributes.position.array;
            for(let i=0; i<p.length; i+=3) geoPts.push(new THREE.Vector3(p[i], p[i+1], p[i+2]));
        });
    }

    for (let i = 0; i < N; i++) {
        // 外围四面八方诞生点
        const th = Math.random() * Math.PI * 2;
        const ph = Math.random() * Math.PI;
        const r  = R + 2 + Math.random() * 5;
        const sx = r * Math.sin(ph) * Math.cos(th);
        const sy = r * Math.cos(ph);
        const sz = r * Math.sin(ph) * Math.sin(th);
        starts.push(new THREE.Vector3(sx, sy, sz));
        arr[i*3]=sx; arr[i*3+1]=sy; arr[i*3+2]=sz;

        // 严格遵循重力坍缩：所有粒子被直接吸收、降落在国家的极点中心，然后引发微光爆裂
        targets.push(centerSurface.clone());
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color, size: 0.05, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);

    const FRAMES = 85;
    let f = 0;
    const step = () => {
        if (f >= FRAMES) {
            let fade = 25;
            const explode = () => {
                if (fade <= 0) { scene.remove(pts); geo.dispose(); mat.dispose(); onDone?.(); return; }
                mat.opacity = fade / 25;
                fade--;
                requestAnimationFrame(explode);
            };
            explode();
            return;
        }
        const t = MathEase(f / FRAMES);
        const p = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
            const s = starts[i];
            const tg = targets[i];
            const spin = Math.sin(t * Math.PI) * 2.5 * (i%2===0?1:-1); // 强烈螺旋风暴
            // 完美收束到目标国家的国境边缘与内部
            p[i*3]   = s.x + (tg.x - s.x)*t + Math.sin(f*0.12+i)*spin*(1-t);
            p[i*3+1] = s.y + (tg.y - s.y)*t + Math.cos(f*0.12+i)*spin*(1-t);
            p[i*3+2] = s.z + (tg.z - s.z)*t;
        }
        geo.attributes.position.needsUpdate = true;
        mat.size = 0.05 + 0.05*(1-t);
        f++;
        requestAnimationFrame(step);
    };
    step();
}

// ── 微光爆发 ──────────────────────────────────────────────────────
function spawnBurst(scene, pos, color) {
    const light = new THREE.PointLight(color, 10, 5, 2);
    light.position.copy(pos);
    scene.add(light);
    let p = 10;
    const tick = () => {
        p -= 0.6;
        light.intensity = Math.max(0, p);
        if (p > 0) requestAnimationFrame(tick);
        else scene.remove(light);
    };
    tick();
}

// ── 国家色板 ─────────────────────────────────────────────────────
const PALETTE = {
    US:'#7c3aed', GB:'#06b6d4', CN:'#f59e0b', JP:'#ec4899',
    FR:'#10b981', DE:'#8b5cf6', CO:'#f97316', IN:'#ef4444',
    AF:'#84cc16', IL:'#0ea5e9', AT:'#a78bfa',
};
const countryColor    = c => PALETTE[c] || '#6366f1';
const countryColorHex = countryColor;

// ═══════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════
export default function GlobeScene({ books, onBookClick, autoFlyTarget }) {
    const mountRef = useRef(null);
    const stateRef = useRef(null);
    const [sceneReady, setSceneReady] = useState(false);

    const init = useCallback(() => {
        const container = mountRef.current;
        if (!container || stateRef.current) return;

        /* ── Renderer ── */
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        container.appendChild(renderer.domElement);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 800);
        camera.position.set(0, 2, 16);

        /* ── OrbitControls ── */
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping    = true;
        controls.dampingFactor    = 0.06;
        controls.minDistance      = 7;
        controls.maxDistance      = 28;
        controls.autoRotate       = true;
        controls.autoRotateSpeed  = 0.25;

        let isFlying = false;

        /* ── Apple Maps 卫星地球 ── */
        const globeGeo = new THREE.SphereGeometry(R, 72, 72);
        const globeMat = new THREE.MeshPhongMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0, // 初始不可见，等待书籍汇聚后逐渐浮现
            shininess: 15,
            specular: 0x222222,
        });
        const globeMesh = new THREE.Mesh(globeGeo, globeMat);
        scene.add(globeMesh);

        const loader = new THREE.TextureLoader();
        loader.load(
            'https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg',
            tex => {
                tex.colorSpace  = THREE.SRGBColorSpace;
                tex.anisotropy  = renderer.capabilities.getMaxAnisotropy();
                globeMat.map    = tex;
                globeMat.color.set(0x8899aa); // 不完全黑，保留海陆深色卫星底图，没有书籍的国家显示此底纹
                globeMat.needsUpdate = true;
            }
        );

        /* ── 大气层光晕 ── */
        const atmosphereMat = new THREE.ShaderMaterial({
            uniforms: { 
                c: { value: new THREE.Color(0x222222) },
                uOpacity: { value: 0.0 } // 初始不可见
            }, 
            vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
            fragmentShader: `uniform vec3 c; uniform float uOpacity; varying vec3 vN;void main(){float i=pow(0.68-dot(vN,vec3(0,0,1)),5.);gl_FragColor=vec4(c,i*uOpacity);}`,
            side: THREE.FrontSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        });
        const atmosphereMesh = new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.022, 32, 32),
            atmosphereMat
        );
        scene.add(atmosphereMesh);

        // 核心震撼逻辑：书壳成型后，地球背景与星空在 2 秒内优雅浮现
        gsap.to(globeMat, { opacity: 1, duration: 2.2, delay: 0.2, ease: 'power2.out' });
        gsap.to(atmosphereMat.uniforms.uOpacity, { value: 0.55, duration: 2.5, delay: 0.5, ease: 'power2.out' });

        /* ── 星空 ── */
        const sa = new Float32Array(6000 * 3);
        for (let i = 0; i < sa.length; i++) sa[i] = (Math.random()-0.5)*1000;
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(sa, 3));
        scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0xffffff, size:0.35, transparent:true, opacity:0.6 })));

        /* ── 光源（真实日照）── */
        scene.add(new THREE.AmbientLight(0xffffff, 1.4));
        const sun = new THREE.DirectionalLight(0xfff8e8, 2.8);
        sun.position.set(30, 15, 15);
        scene.add(sun);

        /* ── 按国家收集书目 ── */
        const byCountry = {};
        books.forEach(b => {
            if (!b.countryCode) return;
            if (!byCountry[b.countryCode]) byCountry[b.countryCode] = { books:[], lat:b.lat, lon:b.lon, country:b.country };
            byCountry[b.countryCode].books.push(b);
        });

        /* ── Apple Maps 风格城市标签 ── */
        const MAJOR_CITIES = [
            { name: "New York", lat: 40.7128, lon: -74.0060 },
            { name: "London", lat: 51.5074, lon: -0.1278 },
            { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
            { name: "Paris", lat: 48.8566, lon: 2.3522 },
            { name: "Beijing", lat: 39.9042, lon: 116.4074 },
            { name: "Shanghai", lat: 31.2304, lon: 121.4737 },
            { name: "Sydney", lat: -33.8688, lon: 151.2093 },
            { name: "Rio de Janeiro", lat: -22.9068, lon: -43.1729 },
            { name: "Cairo", lat: 30.0444, lon: 31.2357 },
            { name: "Moscow", lat: 55.7558, lon: 37.6173 },
            { name: "Dubai", lat: 25.2048, lon: 55.2708 },
            { name: "Mumbai", lat: 19.0760, lon: 72.8777 },
            { name: "Singapore", lat: 1.3521, lon: 103.8198 },
            { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
            { name: "Toronto", lat: 43.6510, lon: -79.3470 },
            { name: "Istanbul", lat: 41.0082, lon: 28.9784 },
            { name: "Johannesburg", lat: -26.2041, lon: 28.0473 },
            { name: "Seoul", lat: 37.5665, lon: 126.9780 },
            { name: "Hong Kong", lat: 22.3193, lon: 114.1694 },
            { name: "Berlin", lat: 52.5200, lon: 13.4050 },
            { name: "Mexico City", lat: 19.4326, lon: -99.1332 },
            { name: "New Delhi", lat: 28.6139, lon: 77.2090 },
            { name: "Jakarta", lat: -6.2088, lon: 106.8456 }
        ];

        const cityLabels = [];
        MAJOR_CITIES.forEach(city => {
            const pos = geo2xyz(city.lat, city.lon, R + 0.02);
            const anchor = new THREE.Object3D();
            anchor.position.copy(pos);
            scene.add(anchor);

            const div = document.createElement('div');
            div.style.cssText = `
                position: absolute;
                color: rgba(255,255,255,0.9);
                font: 500 12px/1 'Inter', 'SF Pro Text', sans-serif;
                pointer-events: none;
                text-shadow: 0 1px 4px rgba(0,0,0,1.0), 0 0 8px rgba(0,0,0,0.8);
                opacity: 0;
                transition: opacity 0.3s ease;
                transform: translate(-50%, -50%);
                z-index: 5;
                user-select: none;
                letter-spacing: 0.5px;
            `;
            div.textContent = city.name;
            container.appendChild(div);
            cityLabels.push({ div, anchor });
        });

        const interactableMeshes = [];

        /* ── 全局波普平铺渲染（无缝一次性加载全部国家）── */
        const loadGlobalPopArt = async () => {
            for (const [code, { books:bks, lat, lon }] of Object.entries(byCountry)) {
                try {
                    const geo = await getCountryGeo(code);
                    if (geo) {
                        const colHex = countryColorHex(code);
                        const tex = await makeCoverTexture(bks, colHex);
                        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                        const meshes = buildCountryMeshes(geo, lat, lon, tex);
                        meshes.forEach(m => {
                            m.userData = { books:bks, lat, lon, code, country: bks[0]?.country || code };
                            scene.add(m);
                            interactableMeshes.push(m);
                        });
                    }
                } catch(e) {
                    console.warn('[GlobeScene] 无法生成波普国家:', code, e);
                }
            }
        };
        loadGlobalPopArt();

        /* ── 飞行动画（球面 Slerp，完全沿球面弧线，不穿地心）── */
        const flyTo = (lat, lon, onDone) => {
            isFlying = true;
            controls.autoRotate = false;
            controls.enabled    = false;

            const startPos    = camera.position.clone();
            const endPos      = geo2xyz(lat, lon, 11);
            const startR      = startPos.length();
            const endR        = endPos.length();

            const qStart = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0,0,1), startPos.clone().normalize()
            );
            const qEnd = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0,0,1), endPos.clone().normalize()
            );

            const FRAMES = 100;
            let f = 0;
            const step = () => {
                if (f >= FRAMES) {
                    isFlying = false;
                    controls.enabled = true;
                    onDone?.();
                    setTimeout(() => { controls.autoRotate = true; }, 7000);
                    return;
                }
                const t  = ease3(f / FRAMES);
                const qT = new THREE.Quaternion().slerpQuaternions(qStart, qEnd, t);
                const rT = startR + (endR - startR) * t;
                camera.position.set(0,0,1).applyQuaternion(qT).multiplyScalar(rT);
                camera.lookAt(0, 0, 0);
                f++;
                requestAnimationFrame(step);
            };
            step();
        };

        /* ── 点击标记：飞行 → 核心粒子降落 → 弹出HUD ── */
        const activate = async (mesh, targetBook = null) => {
            if (isFlying) return;
            const { lat, lon, code, books:bks } = mesh.userData;
            const surface = geo2xyz(lat, lon, R + 0.18);
            const colHex  = countryColorHex(code);
            const colInt  = parseInt(colHex.slice(1), 16);

            // 1. 飞行动画开始
            flyTo(lat, lon, async () => {
                // 2. 释放降落旋涡，落入领土核心！
                spawnParticles(scene, surface, null, colInt, async () => {
                    spawnBurst(scene, surface, colInt);
                    // 3. HUD 卡片弹出
                    onBookClick?.(targetBook || bks[0]);
                });
            });
        };

        /* ── Raycaster & Events ── */
        const ray   = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const updateLabels = () => {
            const w = window.innerWidth, h = window.innerHeight;
            const viewVec = camera.position.clone().normalize();
            
            cityLabels.forEach(({ div, anchor }) => {
                const p = anchor.position.clone().project(camera);
                if (p.z >= 1.0) { div.style.opacity = '0'; return; } // 背向相机
                
                const anchorNorm = anchor.position.clone().normalize();
                const dot = viewVec.dot(anchorNorm);
                
                // 根据球面法线夹角渐隐标签（Apple Maps 边缘渐隐效果）
                if (dot < 0.3) {
                    div.style.opacity = '0';
                } else {
                    div.style.opacity = '1';
                    div.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
                    div.style.top  = `${(-p.y * 0.5 + 0.5) * h}px`;
                }
            });
        };

        const onMouseMove = e => {
            const rc = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rc.left) / rc.width)  * 2 - 1;
            mouse.y =-((e.clientY - rc.top)  / rc.height) * 2 + 1;
            ray.setFromCamera(mouse, camera);
            const hits = ray.intersectObjects(interactableMeshes);
            if (hits.length) {
                renderer.domElement.style.cursor = 'pointer';
            } else {
                renderer.domElement.style.cursor = 'grab';
            }
        };

        const onClick = e => {
            if (isFlying) return;
            const rc = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rc.left) / rc.width)  * 2 - 1;
            mouse.y =-((e.clientY - rc.top)  / rc.height) * 2 + 1;
            ray.setFromCamera(mouse, camera);
            const hits = ray.intersectObjects(interactableMeshes);
            if (hits.length) activate(hits[0].object);
        };

        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('click',     onClick);

        /* ── 主循环 ── */
        let animId;
        const clock = new THREE.Clock();
        const animate = () => {
            animId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            if (!isFlying) controls.update();
            // markers.forEach((m, i) => m.scale.setScalar(1 + Math.sin(t*2.6 + i*1.4)*0.2));
            updateLabels();
            renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        stateRef.current = { renderer, animId, onResize, onMouseMove, onClick, container, cityLabels, interactableMeshes, activate };
        setSceneReady(true);
    }, [books, onBookClick]);

    useEffect(() => {
        if (sceneReady && autoFlyTarget && stateRef.current) {
            const m = stateRef.current.interactableMeshes.find(x => x.userData?.code === autoFlyTarget.countryCode || x.userData?.country === autoFlyTarget.country);
            if (m) {
                // 等待相机和地球贴图稳定缓冲后执行抛物线跃迁
                setTimeout(() => stateRef.current.activate(m, autoFlyTarget), 500);
            }
        }
    }, [sceneReady, autoFlyTarget]);

    useEffect(() => {
        init();
        return () => {
            const s = stateRef.current;
            if (!s) return;
            cancelAnimationFrame(s.animId);
            s.renderer.domElement.removeEventListener('mousemove', s.onMouseMove);
            s.renderer.domElement.removeEventListener('click',     s.onClick);
            window.removeEventListener('resize', s.onResize);
            s.cityLabels.forEach(({ div }) => div.remove());
            s.renderer.dispose();
            while (s.container.firstChild) s.container.removeChild(s.container.firstChild);
            stateRef.current = null;
        };
    }, [init]);

    return (
        <div
            ref={mountRef}
            style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                background: 'radial-gradient(ellipse at center, #060d1f 0%, #000008 100%)',
            }}
        />
    );
}
