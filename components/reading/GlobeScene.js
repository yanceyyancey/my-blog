'use client';

// GlobeScene V2.2 - Unified Engine (Absolute Fix)
import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';

const R = 5;

function geo2xyz(lat, lon, r = R) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

function project2D(lon, lat, cLon, cLat) {
    const cosC = Math.cos(cLat * Math.PI / 180);
    return [(lon - cLon) * cosC, lat - cLat];
}

const ease3 = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

let geoCacheIndex = null;
let geoFetchPromise = null;

async function getCountryGeo(isoA2) {
    if (!geoFetchPromise) {
        geoFetchPromise = (async () => {
            try {
                const res = await fetch('/countries.geojson');
                const data = await res.json();
                const index = {};
                data.features.forEach(f => {
                    const codes = [f.properties.ISO_A2, f.properties.iso_a2, f.properties.ADM0_A3, f.properties.ISO_A3];
                    codes.forEach(c => { if(c) index[c] = f.geometry; });
                });
                geoCacheIndex = index;
            } catch(e) {}
        })();
    }
    await geoFetchPromise;
    return geoCacheIndex ? geoCacheIndex[isoA2] : null;
}

function proxyCoverUrl(url) { return url ? `/api/cover-proxy?url=${encodeURIComponent(url)}` : null; }

function makeCoverTexture(books, colorHex) {
    const W = 512, H = 683;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, W, H);

    const validBooks = books.filter(b => b.coverUrl).slice(0, 9);
    if (!validBooks.length) return Promise.resolve(new THREE.CanvasTexture(canvas));

    return new Promise(resolve => {
        const count = validBooks.length;
        const grid = count === 1 ? 1 : count <= 4 ? 2 : 3;
        const cellSizeW = W / grid;
        const cellSizeH = H / grid;

        Promise.all(validBooks.map(b => {
            return new Promise(imgResolve => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => imgResolve(img);
                img.onerror = () => imgResolve(null);
                img.src = proxyCoverUrl(b.coverUrl);
            });
        })).then(images => {
            images.forEach((img, i) => {
                if (!img) return;
                const row = Math.floor(i / grid);
                const col = i % grid;
                const x = col * cellSizeW;
                const y = row * cellSizeH;

                // 绘制带有一点点边距的封面
                const pad = cellSizeW * 0.05;
                const dw = cellSizeW - pad * 2, dh = cellSizeH - pad * 2;
                const targetRatio = dw / dh, srcRatio = img.naturalWidth / img.naturalHeight;
                
                let sw, sh, sx = 0, sy = 0;
                if (srcRatio > targetRatio) {
                    sh = img.naturalHeight; sw = sh * targetRatio; sx = (img.naturalWidth - sw) / 2;
                } else {
                    sw = img.naturalWidth; sh = sw / targetRatio; sy = (img.naturalHeight - sh) / 2;
                }
                ctx.drawImage(img, sx, sy, sw, sh, x + pad, y + pad, dw, dh);
            });
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
        });
    });
}

function buildCountryMeshes(geometry, cLat, cLon, texture) {
    const meshes = [];
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const cosC = Math.cos(cLat * Math.PI / 180);
    for (const poly of polys) {
        if (!poly[0] || poly[0].length < 3) continue;
        const pts2D = poly[0].map(([lon, lat]) => new THREE.Vector2(...project2D(lon, lat, cLon, cLat)));
        const shape = new THREE.Shape(pts2D);
        for(let h=1; h<poly.length; h++) {
            const hole = poly[h].map(([lon, lat]) => new THREE.Vector2(...project2D(lon, lat, cLon, cLat)));
            shape.holes.push(new THREE.Path(hole));
        }
        const shapeGeo = new THREE.ShapeGeometry(shape, 8);
        const pArr = shapeGeo.toNonIndexed().attributes.position.array;
        let triangles = [];
        for(let i=0; i<pArr.length/9; i++) triangles.push({ pts:[new THREE.Vector2(pArr[i*9],pArr[i*9+1]), new THREE.Vector2(pArr[i*9+3],pArr[i*9+4]), new THREE.Vector2(pArr[i*9+6],pArr[i*9+7])] });
        const maxLen = 1.0; let changed = true, safety = 0;
        while(changed && safety < 10) {
            safety++; changed = false; let next = [];
            for(let tri of triangles) {
                const [v1,v2,v3] = tri.pts;
                if(v1.distanceTo(v2)>maxLen || v2.distanceTo(v3)>maxLen || v3.distanceTo(v1)>maxLen) {
                    changed = true; const c = new THREE.Vector2().add(v1).add(v2).add(v3).divideScalar(3);
                    next.push({pts:[v1,v2,c]}, {pts:[v2,v3,c]}, {pts:[v3,v1,c]});
                } else next.push(tri);
            }
            triangles = next; if(triangles.length > 20000) break;
        }
        const count = triangles.length*3; const newPos = new Float32Array(count*3), newUV = new Float32Array(count*2);
        const uScaleX = 8*(3/4), uScaleY = 8; let ptr = 0;
        for(let tri of triangles) {
            for(const v2d of tri.pts) {
                const lon = cosC>0.001 ? v2d.x/cosC + cLon : cLon, lat = v2d.y+cLat, v3d = geo2xyz(lat, lon, R + 0.02);
                newPos[ptr*3]=v3d.x; newPos[ptr*3+1]=v3d.y; newPos[ptr*3+2]=v3d.z;
                newUV[ptr*2]=v2d.x/uScaleX; newUV[ptr*2+1]=v2d.y/uScaleY; ptr++;
            }
        }
        const finalGeo = new THREE.BufferGeometry();
        finalGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
        finalGeo.setAttribute('uv', new THREE.BufferAttribute(newUV, 2));
        finalGeo.computeVertexNormals();
        meshes.push(new THREE.Mesh(finalGeo, new THREE.ShaderMaterial({
            uniforms: { uMap: { value: texture }, uOpacity: { value: 0.0 } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv; void main() { vec4 col = texture2D(uMap, fract(vUv)); if (uOpacity <= 0.02 || col.a < 0.1) discard; gl_FragColor = vec4(col.rgb, uOpacity); }`,
            transparent: true, side: THREE.DoubleSide, depthWrite: false
        })));
    }
    return meshes;
}

const countryColor = c => ({ US:'#7c3aed', GB:'#06b6d4', CN:'#f59e0b', JP:'#ec4899', FR:'#10b981', DE:'#8b5cf6', CO:'#f97316', IN:'#ef4444', AF:'#84cc16', IL:'#0ea5e9', AT:'#a78bfa' }[c] || '#6366f1');

export default function GlobeScene({ books, onBookClick, autoFlyTarget, isFocused }) {
    const mountRef = useRef(null);
    const stateRef = useRef(null);
    const [sceneReady, setSceneReady] = useState(false);
    const [meshesReady, setMeshesReady] = useState(false);
    const prevFocusedRef = useRef(isFocused);
    const autoFlyCompleteRef = useRef(false);
    const onBookClickRef = useRef(onBookClick);
    useEffect(() => { onBookClickRef.current = onBookClick; }, [onBookClick]);

    const init = useCallback(() => {
        const container = mountRef.current;
        if (!container || stateRef.current) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 800);
        camera.position.set(0, 0, 16.5);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.minDistance = 7;
        controls.maxDistance = 28;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.25;

        const anim = { active: false, type: 'none', frames: 0, maxFrames: 60, qS: new THREE.Quaternion(), qE: new THREE.Quaternion(), rS: 16.5, rE: 8.2, onDone: null };

        const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), new THREE.MeshPhongMaterial({ color: 0x000000, transparent: true, opacity: 0 }));
        scene.add(globeMesh);
        new THREE.TextureLoader().load('https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg', tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            globeMesh.material.map = tex; globeMesh.material.color.set(0x8899aa); globeMesh.material.needsUpdate = true;
        });

        scene.add(new THREE.AmbientLight(0xffffff, 1.4));
        const sun = new THREE.DirectionalLight(0xfff8e8, 2.5); sun.position.set(30, 20, 10); scene.add(sun);

        const interactableMeshes = [];
        const countries = {};
        books.forEach(b => {
            if (!b.countryCode) return;
            if (!countries[b.countryCode]) countries[b.countryCode] = { books:[], lat:b.lat, lon:b.lon };
            countries[b.countryCode].books.push(b);
        });

        const loadContent = async () => {
            await Promise.all(Object.entries(countries).map(async ([code, {books:bks, lat, lon}]) => {
                const geo = await getCountryGeo(code);
                if (geo) {
                    const tex = await makeCoverTexture(bks, countryColor(code));
                    const ms = buildCountryMeshes(geo, lat, lon, tex);
                    ms.forEach(m => {
                        m.userData = { code, lat, lon, books:bks };
                        scene.add(m); interactableMeshes.push(m);
                        gsap.to(m.material.uniforms.uOpacity, { value: 1, duration: 0.8 });
                    });
                }
            }));
            gsap.to(globeMesh.material, { opacity: 1, duration: 1.2 });
            setMeshesReady(true);
        };
        loadContent();

        const runAnim = (lat, lon, targetR, type, onDone) => {
            anim.active = false; // 杀掉之前的
            const startPos = camera.position.clone();
            const endPos = (type === 'pull') ? startPos.clone().normalize().multiplyScalar(targetR) : geo2xyz(lat, lon, targetR);
            anim.qS.setFromUnitVectors(new THREE.Vector3(0,0,1), startPos.clone().normalize());
            anim.qE.setFromUnitVectors(new THREE.Vector3(0,0,1), endPos.clone().normalize());
            anim.rS = startPos.length(); anim.rE = targetR;
            anim.frames = 0; anim.type = type; anim.onDone = onDone;
            anim.active = true;
            controls.enabled = false; controls.autoRotate = false;
        };

        const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
        renderer.domElement.addEventListener('click', e => {
            if (anim.active) return;
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y =-((e.clientY - rect.top) / rect.height) * 2 + 1;
            ray.setFromCamera(mouse, camera);
            const hits = ray.intersectObjects(interactableMeshes);
            if (hits.length) {
                const { lat, lon, books:bks } = hits[0].object.userData;
                runAnim(lat, lon, 8.2, 'fly', () => onBookClickRef.current?.(bks[0]));
            } else { onBookClickRef.current?.(null); }
        });

        let animId;
        const loop = () => {
            animId = requestAnimationFrame(loop);
            if (anim.active) {
                anim.frames++;
                const t = ease3(anim.frames / anim.maxFrames);
                const q = new THREE.Quaternion().slerpQuaternions(anim.qS, anim.qE, t);
                const r = anim.rS + (anim.rE - anim.rS) * t;
                camera.position.set(0, 0, 1).applyQuaternion(q).multiplyScalar(r);
                camera.lookAt(0, 0, 0);
                if (anim.frames >= anim.maxFrames) {
                    anim.active = false;
                    controls.enabled = true;
                    if (anim.type === 'fly') {
                        controls.autoRotate = false;
                        controls.autoRotateSpeed = 0;
                    } else if (anim.type === 'pull') {
                        controls.autoRotate = true;
                        controls.autoRotateSpeed = 0.25;
                    }
                    // 强制同步一次控制器状态，防止 OrbitControls 丢失新的相机位姿
                    controls.update();
                    anim.onDone?.();
                }
            } else {
                controls.update();
            }
            renderer.render(scene, camera);
        };
        loop();

        stateRef.current = { renderer, interactableMeshes, controls, camera, runAnim, anim };
        setSceneReady(true);
        return () => { cancelAnimationFrame(animId); renderer.dispose(); };
    }, []); // 永远只初始化一次

    useEffect(() => {
        const s = stateRef.current; if (!s || !sceneReady) return;
        if (isFocused) {
            s.controls.autoRotate = false; s.controls.autoRotateSpeed = 0;
            if (s.anim.active && s.anim.type === 'pull') s.anim.active = false; 
        } else if (prevFocusedRef.current) {
            s.controls.autoRotate = true; s.controls.autoRotateSpeed = 0.25;
            if (s.camera.position.length() < 12) s.runAnim(0, 0, 16.5, 'pull');
        }
        prevFocusedRef.current = isFocused;
    }, [isFocused, sceneReady]);

    useEffect(() => {
        const s = stateRef.current;
        if (sceneReady && meshesReady && autoFlyTarget && s && !autoFlyCompleteRef.current) {
            const m = s.interactableMeshes.find(x => 
                x.userData?.code === autoFlyTarget.countryCode || 
                x.userData?.country === autoFlyTarget.country
            );
            if (m) {
                autoFlyCompleteRef.current = true;
                setTimeout(() => { if(s.anim) s.runAnim(m.userData.lat, m.userData.lon, 8.2, 'fly', () => onBookClickRef.current?.(autoFlyTarget)); }, 300);
            }
        }
    }, [sceneReady, meshesReady, autoFlyTarget]);

    useEffect(() => { const cleanup = init(); return cleanup; }, [init]);

    return <div ref={mountRef} style={{ position:'absolute', inset:0, background:'#000' }} />;
}
