'use client';

import { useEffect, useRef, useCallback } from 'react';
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

// ── 2D 局部坐标投影 → 球面 2D（方位角等距近似）────────────────────
function project2D(lon, lat, cLon, cLat) {
    const cosC = Math.cos(cLat * Math.PI / 180);
    return [
        (lon - cLon) * cosC,
        lat - cLat,
    ];
}

// ── 国家色板 ──────────────────────────────────────────────────────
const COLORS = {
    US: 0x7c3aed, GB: 0x06b6d4, CN: 0xf59e0b, JP: 0xec4899,
    FR: 0x10b981, DE: 0x8b5cf6, CO: 0xf97316, IN: 0xef4444,
    AF: 0x84cc16, IL: 0x0ea5e9, AT: 0xa78bfa,
};
const getColor = c => COLORS[c] || 0x6366f1;
const getColorHex = c => '#' + getColor(c).toString(16).padStart(6, '0');

// ── easeInOutCubic ────────────────────────────────────────────────
const ease3 = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ── GeoJSON cache ────────────────────────────────────────────────
let geoCache = null;
async function getCountryGeo(isoA2) {
    if (!geoCache) {
        try {
            const res = await fetch('/countries.geojson');
            geoCache = await res.json();
        } catch { return null; }
    }
    const feat = geoCache.features.find(f =>
        f.properties.ISO_A2 === isoA2 || f.properties.iso_a2 === isoA2
    );
    return feat ? feat.geometry : null;
}

// ── 书封面 Canvas 纹理（多本书拼贴成 2x2 格，强制 3:4）─────────
function makeCoverTexture(books) {
    const W = 512, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    const book = books.find(b => b.coverUrl) || books[0];
    if (!book?.coverUrl) {
        // 纯色 fallback
        ctx.fillStyle = getColorHex(books[0].countryCode);
        ctx.fillRect(0, 0, W, H);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return Promise.resolve(tex);
    }

    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            // 严格 3:4 切割（cropRegion）
            const aspectTarget = 3 / 4;
            const srcAspect = img.width / img.height;
            let sw, sh, sx = 0, sy = 0;
            if (srcAspect > aspectTarget) {
                sh = img.height; sw = sh * aspectTarget;
                sx = (img.width - sw) / 2;
            } else {
                sw = img.width; sh = sw / aspectTarget;
                sy = (img.height - sh) / 2;
            }
            // 2x2 排列铺满 canvas
            const cols = 2, rows = 3;
            const cw = W / cols, ch = H / rows;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    ctx.drawImage(img, sx, sy, sw, sh, c * cw, r * ch, cw, ch);
                }
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
        };
        img.onerror = () => {
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
        };
        img.src = book.coverUrl;
    });
}

// ── 将 GeoJSON polygon（外环）三角化为球面 Mesh ───────────────────
function buildCountryMesh(geometry, cLat, cLon, texture) {
    const meshes = [];
    const polys = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates;

    for (const poly of polys) {
        if (!poly[0] || poly[0].length < 3) continue;

        // 投影到 2D 局部坐标
        const pts2D = poly[0].map(([lon, lat]) => {
            const [x, y] = project2D(lon, lat, cLon, cLat);
            return new THREE.Vector2(x, y);
        });

        const shape = new THREE.Shape(pts2D);
        // 内环（洞）
        for (let h = 1; h < poly.length; h++) {
            const holePts = poly[h].map(([lon, lat]) => {
                const [x, y] = project2D(lon, lat, cLon, cLat);
                return new THREE.Vector2(x, y);
            });
            shape.holes.push(new THREE.Path(holePts));
        }

        const shapeGeo = new THREE.ShapeGeometry(shape, 12);
        const pos = shapeGeo.attributes.position;
        const count = pos.count;

        const newPos = new Float32Array(count * 3);
        const newUV = new Float32Array(count * 2);
        const tileScale = 6; // 平铺密度控制

        for (let i = 0; i < count; i++) {
            const x2d = pos.getX(i);
            const y2d = pos.getY(i);
            // 逆投影回经纬度
            const cosC = Math.cos(cLat * Math.PI / 180);
            const lon = cosC > 0.001 ? x2d / cosC + cLon : cLon;
            const lat = y2d + cLat;
            const v = geo2xyz(lat, lon, R + 0.04);
            newPos[i * 3] = v.x; newPos[i * 3 + 1] = v.y; newPos[i * 3 + 2] = v.z;
            newUV[i * 2] = x2d / tileScale;
            newUV[i * 2 + 1] = y2d / tileScale;
        }

        shapeGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
        shapeGeo.setAttribute('uv', new THREE.BufferAttribute(newUV, 2));
        shapeGeo.computeVertexNormals();

        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        meshes.push(new THREE.Mesh(shapeGeo, mat));
    }
    return meshes;
}

// ── 粒子流动画：从四面八方汇聚到目标点 ─────────────────────────
function spawnParticleFlow(scene, targetPos, color, onDone) {
    const N = 220;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const starts = [];

    for (let i = 0; i < N; i++) {
        // 随机扩散起始点（球面周围散射）
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const r = R + 1.5 + Math.random() * 4;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);
        starts.push(new THREE.Vector3(x, y, z));
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
        color, size: 0.07, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);

    const TOTAL = 80;
    let f = 0;
    const step = () => {
        if (f >= TOTAL) {
            // 爆炸散射 + 淡出
            let fade = 20;
            const explode = () => {
                if (fade <= 0) {
                    scene.remove(pts); geo.dispose(); mat.dispose();
                    if (onDone) onDone();
                    return;
                }
                const t2 = 1 - fade / 20;
                const pos2 = geo.attributes.position.array;
                for (let i = 0; i < N; i++) {
                    const spread = 0.04;
                    pos2[i * 3] += (Math.random() - 0.5) * spread;
                    pos2[i * 3 + 1] += (Math.random() - 0.5) * spread;
                    pos2[i * 3 + 2] += (Math.random() - 0.5) * spread;
                }
                geo.attributes.position.needsUpdate = true;
                mat.opacity = 1 - t2;
                fade--;
                requestAnimationFrame(explode);
            };
            explode();
            return;
        }
        const t = ease3(f / TOTAL);
        const p = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
            const s = starts[i];
            // 螺旋路径：绕球旋转一圈后汇聚
            const spin = Math.sin(t * Math.PI) * 1.5 * (i % 2 === 0 ? 1 : -1);
            const spiralX = s.x + (targetPos.x - s.x) * t + Math.sin(f * 0.2 + i) * spin * (1 - t);
            const spiralY = s.y + (targetPos.y - s.y) * t + Math.cos(f * 0.2 + i) * spin * (1 - t);
            const spiralZ = s.z + (targetPos.z - s.z) * t;
            p[i * 3] = spiralX; p[i * 3 + 1] = spiralY; p[i * 3 + 2] = spiralZ;
        }
        geo.attributes.position.needsUpdate = true;
        // 加速后期汇聚时粒子缩小
        mat.size = 0.07 + 0.05 * (1 - t);
        f++;
        requestAnimationFrame(step);
    };
    step();
}

// ── 微光爆发效果 ──────────────────────────────────────────────────
function spawnBurst(scene, pos, color) {
    const light = new THREE.PointLight(color, 8, 4, 2);
    light.position.copy(pos);
    scene.add(light);
    let power = 8;
    const decay = () => {
        power -= 0.5;
        light.intensity = Math.max(0, power);
        if (power > 0) requestAnimationFrame(decay);
        else scene.remove(light);
    };
    decay();
}

// ═══════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════
export default function GlobeScene({ books, onBookClick }) {
    const mountRef = useRef(null);
    const stateRef = useRef(null);

    const init = useCallback(() => {
        const container = mountRef.current;
        if (!container || stateRef.current) return;

        // ── Renderer ──────────────────────────────────────────
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 800);
        camera.position.set(0, 0, 16);

        // ── OrbitControls ─────────────────────────────────────
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.minDistance = 7;
        controls.maxDistance = 30;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.3;

        // ── 飞行状态 ──────────────────────────────────────────
        let isFlying = false;

        // ── 极简暗黑地球 ─────────────────────────────────────
        const globeGeo = new THREE.SphereGeometry(R, 64, 64);
        const globeMat = new THREE.MeshPhongMaterial({
            color: 0x040d1a,
            emissive: 0x020810,
            emissiveIntensity: 0.6,
            specular: 0x0a1a33,
            shininess: 12,
        });
        const globe = new THREE.Mesh(globeGeo, globeMat);
        scene.add(globe);

        // 微弱卫星纹理（可选）
        new THREE.TextureLoader().load(
            'https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg',
            tex => {
                globeMat.map = tex;
                // 压暗色调：通过 color 乘以深色
                globeMat.color.set(0x223344);
                globeMat.emissiveIntensity = 0.2;
                globeMat.needsUpdate = true;
            }
        );

        // ── 大气层光晕 ────────────────────────────────────────
        const atmoMat = new THREE.ShaderMaterial({
            uniforms: { c: { value: new THREE.Color(0x1144aa) } },
            vertexShader: `varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
            fragmentShader: `uniform vec3 c;varying vec3 vN;void main(){float i=pow(0.72-dot(vN,vec3(0,0,1)),4.);gl_FragColor=vec4(c,i*0.45);}`,
            side: THREE.FrontSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        });
        scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.022, 32, 32), atmoMat));

        // ── 国家轮廓线（有书的国家，发光）────────────────────
        // 在初始化时从 GeoJSON 加载有书国家的轮廓
        const booksByCountry = {};
        books.forEach(b => {
            if (!b.countryCode) return;
            if (!booksByCountry[b.countryCode]) {
                booksByCountry[b.countryCode] = { books: [], lat: b.lat, lon: b.lon, country: b.country };
            }
            booksByCountry[b.countryCode].books.push(b);
        });

        // ── 星空 ─────────────────────────────────────────────
        const starArr = new Float32Array(5000 * 3);
        for (let i = 0; i < 5000 * 3; i++) starArr[i] = (Math.random() - 0.5) * 900;
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(starArr, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.5 })));

        // ── 光源 ─────────────────────────────────────────────
        scene.add(new THREE.AmbientLight(0x223355, 2));
        const sun = new THREE.DirectionalLight(0x8899cc, 1.8);
        sun.position.set(15, 8, 12);
        scene.add(sun);

        // ── 标记点 ───────────────────────────────────────────
        const markers = [];
        const labelDivs = [];

        Object.entries(booksByCountry).forEach(([code, { books: bks, lat, lon, country }]) => {
            if (!lat && !lon) return;
            const pos = geo2xyz(lat, lon, R + 0.15);
            const col = getColor(code);
            const colHex = getColorHex(code);
            const count = bks.length;

            // 发光球
            const dot = new THREE.Mesh(
                new THREE.SphereGeometry(0.06 + count * 0.02, 10, 10),
                new THREE.MeshBasicMaterial({ color: col })
            );
            dot.position.copy(pos);
            dot.userData = { books: bks, lat, lon, code, country };
            scene.add(dot);
            markers.push(dot);

            // 外脉冲环
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.1 + count * 0.025, 0.165 + count * 0.035, 20),
                new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
            );
            ring.position.copy(pos);
            ring.lookAt(0, 0, 0);
            scene.add(ring);

            // 竖线
            const lineGeo = new THREE.BufferGeometry().setFromPoints([geo2xyz(lat, lon, R), pos]);
            scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.4 })));

            // HTML 标签
            const div = document.createElement('div');
            div.style.cssText = `
                position:absolute;
                background:rgba(0,0,0,0.8);
                border:1px solid ${colHex};
                border-radius:5px;
                padding:2px 8px;
                color:${colHex};
                font:600 11px/1.6 Inter,sans-serif;
                white-space:nowrap;
                pointer-events:none;
                opacity:0;
                transition:opacity .25s;
                transform:translateX(-50%) translateY(-150%);
            `;
            div.textContent = `${country}  ${count}本`;
            container.appendChild(div);
            labelDivs.push({ div, marker: dot });
        });

        // 当前激活的国家 Mesh 列表（点击后生成）
        let activeMeshes = [];

        // ── 相机飞行（isFlying 期间跳过 controls.update）────
        const flyTo = (targetLat, targetLon, onDone) => {
            isFlying = true;
            controls.autoRotate = false;
            controls.enabled = false;

            const startPos = camera.position.clone();
            const endPos = geo2xyz(targetLat, targetLon, 11);
            const FRAMES = 90;
            let f = 0;

            const step = () => {
                if (f >= FRAMES) {
                    isFlying = false;
                    controls.enabled = true;
                    if (onDone) onDone();
                    setTimeout(() => { controls.autoRotate = true; }, 6000);
                    return;
                }
                camera.position.lerpVectors(startPos, endPos, ease3(f / FRAMES));
                camera.lookAt(0, 0, 0);
                f++;
                requestAnimationFrame(step);
            };
            step();
        };

        // ── 清除已激活国家 Mesh ──
        const clearActiveMeshes = () => {
            activeMeshes.forEach(m => {
                scene.remove(m);
                m.geometry.dispose();
                m.material.dispose();
            });
            activeMeshes = [];
        };

        // ── 点击标记：飞行 → 粒子流 → 国家多边形 → HUD ─────
        const activateCountry = async (marker) => {
            clearActiveMeshes();
            const { lat, lon, code, books: bks } = marker.userData;
            const targetSurface = geo2xyz(lat, lon, R + 0.15);
            const color = getColor(code);

            // 1. 飞行到目标
            flyTo(lat, lon, async () => {
                // 2. 粒子流
                spawnParticleFlow(scene, targetSurface, color, async () => {
                    // 3. 爆发光晕
                    spawnBurst(scene, targetSurface, color);

                    // 4. 加载 GeoJSON 并绘制国家多边形（书封面铺贴）
                    try {
                        const geo = await getCountryGeo(code);
                        if (geo) {
                            const tex = await makeCoverTexture(bks);
                            tex.repeat.set(1, 1);
                            const meshes = buildCountryMesh(geo, lat, lon, tex);
                            meshes.forEach(m => {
                                scene.add(m);
                                activeMeshes.push(m);
                                // 渐显
                                let op = 0;
                                const fadeIn = () => {
                                    op = Math.min(0.92, op + 0.03);
                                    m.material.opacity = op;
                                    if (op < 0.92) requestAnimationFrame(fadeIn);
                                };
                                fadeIn();
                            });
                        }
                    } catch (e) { /* GeoJSON 加载失败则跳过 */ }

                    // 5. 弹出 HUD
                    onBookClick(bks[0]);
                });
            });
        };

        // ── Raycaster ─────────────────────────────────────────
        const ray = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        // 相机空间 → 标签屏幕坐标
        const updateLabels = () => {
            const w = window.innerWidth, h = window.innerHeight;
            labelDivs.forEach(({ div, marker }) => {
                const pos = marker.position.clone().project(camera);
                // 只有在相机前面（z < 1）且面朝相机的标记才显示
                const inFront = pos.z < 1;
                if (!inFront) { div.style.opacity = '0'; return; }
                const sx = (pos.x * 0.5 + 0.5) * w;
                const sy = (-pos.y * 0.5 + 0.5) * h;
                div.style.left = sx + 'px';
                div.style.top = sy + 'px';
                div.style.position = 'absolute';
            });
        };

        const onMouseMove = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            ray.setFromCamera(mouse, camera);
            const hits = ray.intersectObjects(markers);

            // 所有标签默认低透明度显示
            labelDivs.forEach(({ div }) => { div.style.opacity = '0.35'; });

            if (hits.length > 0) {
                const idx = markers.indexOf(hits[0].object);
                if (idx >= 0) labelDivs[idx].div.style.opacity = '1';
                renderer.domElement.style.cursor = 'pointer';
            } else {
                renderer.domElement.style.cursor = 'grab';
            }
        };

        const onClick = (e) => {
            if (isFlying) return;
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            ray.setFromCamera(mouse, camera);
            const hits = ray.intersectObjects(markers);
            if (hits.length > 0) activateCountry(hits[0].object);
        };

        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('click', onClick);

        // ── 动画主循环 ────────────────────────────────────────
        let animId;
        const clock = new THREE.Clock();
        const animate = () => {
            animId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();

            // 只有不在飞行时才让 OrbitControls 接管相机
            if (!isFlying) controls.update();

            // 标记脉冲
            markers.forEach((m, i) => {
                m.scale.setScalar(1 + Math.sin(t * 2.8 + i * 1.3) * 0.22);
            });

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

        stateRef.current = { renderer, animId, onResize, onMouseMove, onClick, container, labelDivs };
    }, [books, onBookClick]);

    useEffect(() => {
        init();
        return () => {
            const s = stateRef.current;
            if (!s) return;
            cancelAnimationFrame(s.animId);
            s.renderer.domElement.removeEventListener('mousemove', s.onMouseMove);
            s.renderer.domElement.removeEventListener('click', s.onClick);
            window.removeEventListener('resize', s.onResize);
            s.labelDivs.forEach(({ div }) => div.remove());
            s.renderer.dispose();
            while (s.container.firstChild) s.container.removeChild(s.container.firstChild);
            stateRef.current = null;
        };
    }, [init]);

    return (
        <div ref={mountRef} style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            background: 'radial-gradient(ellipse at center, #060c1a 0%, #000005 100%)',
        }} />
    );
}
