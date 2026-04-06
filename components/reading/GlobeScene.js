'use client';

// GlobeScene V2.2 - Unified Engine (Absolute Fix)
import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';

const R = 5;
const MAX_TEXTURE_BOOKS = 25;
const COUNTRY_NAME_ALIASES = {
    'united states': 'US',
    'united states of america': 'US',
    usa: 'US',
    us: 'US',
    'united kingdom': 'GB',
    uk: 'GB',
    britain: 'GB',
    england: 'GB',
    'south korea': 'KR',
    korea: 'KR',
    'north korea': 'KP',
    russia: 'RU',
    iran: 'IR',
    syria: 'SY',
    vietnam: 'VN',
    laos: 'LA',
    bolivia: 'BO',
    venezuela: 'VE',
    tanzania: 'TZ',
    moldova: 'MD',
    taiwan: 'TW',
    'czech republic': 'CZ',
};

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
const EARTH_TEXTURE_URL = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg';
const TEXTURE_TILE_WORLD_HEIGHT = 8;

let geoCacheIndex = null;
let geoNameIndex = null;
let geoFetchPromise = null;

function normalizeCountryLookupValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[().]/g, ' ')
        .replace(/\s+/g, ' ');
}

async function ensureCountryGeoIndex() {
    if (!geoFetchPromise) {
        geoFetchPromise = (async () => {
            try {
                const res = await fetch('/countries.geojson');
                const data = await res.json();
                const index = {};
                const nameIndex = { ...COUNTRY_NAME_ALIASES };
                data.features.forEach(f => {
                    const props = f.properties || {};
                    const isoA2 = String(props.ISO_A2 || props.iso_a2 || '').toUpperCase();
                    const codes = [isoA2, props.ADM0_A3, props.ISO_A3];
                    codes.forEach(c => {
                        const normalizedCode = String(c || '').toUpperCase();
                        if (normalizedCode && normalizedCode !== '-99') {
                            index[normalizedCode] = f.geometry;
                        }
                    });

                    if (isoA2 && isoA2 !== '-99') {
                        [
                            props.ADMIN,
                            props.NAME,
                            props.NAME_LONG,
                            props.NAME_EN,
                            props.NAME_ZH,
                            props.NAME_ZHT,
                            props.FORMAL_EN,
                            props.BRK_NAME,
                            props.GEOUNIT,
                            props.SOVEREIGNT,
                            props.ABBREV,
                        ].forEach(name => {
                            const normalizedName = normalizeCountryLookupValue(name);
                            if (normalizedName && !nameIndex[normalizedName]) {
                                nameIndex[normalizedName] = isoA2;
                            }
                        });
                    }
                });
                geoCacheIndex = index;
                geoNameIndex = nameIndex;
            } catch (e) {
                geoCacheIndex = geoCacheIndex || {};
                geoNameIndex = geoNameIndex || { ...COUNTRY_NAME_ALIASES };
            }
        })();
    }
    await geoFetchPromise;
}

function resolveCountryCode(countryCode, countryName) {
    const normalizedCode = String(countryCode || '').trim().toUpperCase();
    if (normalizedCode) return normalizedCode;
    const normalizedName = normalizeCountryLookupValue(countryName);
    return geoNameIndex?.[normalizedName] || '';
}

function parseCoordinate(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function hasValidCoordinates(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
}

function getGeometryCenter(geometry) {
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.coordinates || [];
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    polygons.forEach(poly => {
        poly.forEach(ring => {
            ring.forEach(([lon, lat]) => {
                if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });
        });
    });

    if (![minLon, maxLon, minLat, maxLat].every(Number.isFinite)) {
        return { lat: 0, lon: 0 };
    }

    return {
        lat: (minLat + maxLat) / 2,
        lon: (minLon + maxLon) / 2,
    };
}

function resolveBookLocation(book) {
    const country = book?.mapCountry || book?.country || book?.authorCountry || book?.placeCountry || '';
    const code = resolveCountryCode(
        book?.mapCountryCode || book?.countryCode || book?.authorCountryCode || book?.placeCountryCode,
        country
    );
    const lat = parseCoordinate(book?.lat);
    const lon = parseCoordinate(book?.lon);
    return { code, country, lat, lon };
}

function parseBookTimestamp(value) {
    if (!value) return 0;
    const ts = Date.parse(String(value));
    return Number.isFinite(ts) ? ts : 0;
}

function scoreTexturePriority(book) {
    const priorityBoost = Number(book?.texturePriorityBoost) || 0;
    const spotlightAt = parseBookTimestamp(book?.textureSpotlightAt);
    const updatedAt = parseBookTimestamp(book?.metadataUpdatedAt);
    const addedAt = parseBookTimestamp(book?.addedAt);
    const hasCover = book?.coverUrl ? 1 : 0;
    return priorityBoost * 100 + spotlightAt * 50 + (updatedAt || addedAt) * 10 + hasCover;
}

function getVisibleTextureBooks(books) {
    const prioritized = [...books].sort((a, b) => scoreTexturePriority(b) - scoreTexturePriority(a));
    return prioritized.slice(0, MAX_TEXTURE_BOOKS);
}

function getTextureLayout(count) {
    if (count <= 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    if (count <= 12) return { cols: 4, rows: 3 };
    if (count <= 16) return { cols: 4, rows: 4 };
    if (count <= 20) return { cols: 5, rows: 4 };
    return { cols: 5, rows: 5 };
}

function getPlaceholderGlyph(book) {
    const raw = String(book?.title || '').trim();
    const match = raw.match(/[A-Za-z0-9\u4e00-\u9fff]/u);
    if (!match) return '书';
    return /[A-Za-z]/.test(match[0]) ? match[0].toUpperCase() : match[0];
}

function drawContainedCover(ctx, img, x, y, w, h) {
    const targetRatio = w / h;
    const srcRatio = img.naturalWidth / img.naturalHeight;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    let sx = 0;
    let sy = 0;

    if (srcRatio > targetRatio) {
        sh = img.naturalHeight;
        sw = sh * targetRatio;
        sx = (img.naturalWidth - sw) / 2;
    } else {
        sw = img.naturalWidth;
        sh = sw / targetRatio;
        sy = (img.naturalHeight - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawPlaceholderCover(ctx, book, x, y, w, h, colorHex) {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, `${colorHex}DD`);
    gradient.addColorStop(1, '#101826');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let row = 0; row < 6; row += 1) {
        ctx.fillRect(x + 10, y + 18 + row * 10, Math.max(18, w - 20 - row * 6), 2);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(18, Math.floor(w * 0.34))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getPlaceholderGlyph(book), x + w / 2, y + h / 2);
}

async function getCountryGeo(isoA2) {
    await ensureCountryGeoIndex();
    return geoCacheIndex ? geoCacheIndex[isoA2] : null;
}

function proxyCoverUrl(url) {
    if (!url) return null;
    if (url.startsWith('data:')) return url; // Base64 直接返回
    return `/api/cover-proxy?url=${encodeURIComponent(url)}`;
}

function createFallbackEarthTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
    ocean.addColorStop(0, '#0f2238');
    ocean.addColorStop(0.5, '#173a5c');
    ocean.addColorStop(1, '#0b1424');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(165, 211, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) {
        const y = (canvas.height / 12) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    for (let i = 1; i < 24; i++) {
        const x = (canvas.width / 24) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let i = 0; i < 700; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 1.2 + 0.2;
        ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.06})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makeCoverTexture(books, colorHex) {
    const visibleBooks = getVisibleTextureBooks(books);
    const count = visibleBooks.length;
    const isSingle = count <= 1;
    const { cols, rows } = getTextureLayout(Math.max(count, 1));
    const CELL_W = 256;
    const CELL_H = 341;
    const W = isSingle ? 512 : cols * CELL_W;
    const H = isSingle ? 683 : rows * CELL_H;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    
    // 背景统一为深色，不使用明显的国家主题色
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    if (!visibleBooks.length) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return Promise.resolve({ tex, cols: 0, rows: 0, visibleBooks: [] });
    }

    return new Promise(resolve => {
        const cellSizeW = isSingle ? W : W / cols;
        const cellSizeH = isSingle ? H : H / rows;

        Promise.all(visibleBooks.map(b => {
            return new Promise(imgResolve => {
                if (!b.coverUrl) {
                    imgResolve(null);
                    return;
                }
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => imgResolve(img);
                img.onerror = () => imgResolve(null);
                img.src = proxyCoverUrl(b.coverUrl);
            });
        })).then(images => {
            images.forEach((img, i) => {
                const book = visibleBooks[i];
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = col * cellSizeW;
                const y = row * cellSizeH;

                if (!img) {
                    drawPlaceholderCover(ctx, book, x, y, cellSizeW, cellSizeH, colorHex);
                    return;
                }

                if (isSingle) {
                    const targetRatio = cellSizeW / cellSizeH;
                    const srcRatio = img.naturalWidth / img.naturalHeight;
                    let sw, sh, sx = 0, sy = 0;
                    if (srcRatio > targetRatio) {
                        sh = img.naturalHeight; sw = sh * targetRatio; sx = (img.naturalWidth - sw) / 2;
                    } else {
                        sw = img.naturalWidth; sh = sw / targetRatio; sy = (img.naturalHeight - sh) / 2;
                    }
                    ctx.drawImage(img, sx, sy, sw, sh, x, y, cellSizeW, cellSizeH);
                    return;
                }

                drawContainedCover(ctx, img, x, y, cellSizeW, cellSizeH);
            });
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            resolve({ tex, cols, rows, visibleBooks });
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
        const textureAspect = texture?.image?.width && texture?.image?.height
            ? texture.image.width / texture.image.height
            : 0.75;
        const tileWidth = Math.max(TEXTURE_TILE_WORLD_HEIGHT * textureAspect, 0.0001);
        const tileHeight = TEXTURE_TILE_WORLD_HEIGHT;
        const count = triangles.length*3; const newPos = new Float32Array(count*3), newUV = new Float32Array(count*2); let ptr = 0;
        for(let tri of triangles) {
            for(const v2d of tri.pts) {
                const lon = cosC>0.001 ? v2d.x/cosC + cLon : cLon, lat = v2d.y+cLat, v3d = geo2xyz(lat, lon, R + 0.02);
                newPos[ptr*3]=v3d.x; newPos[ptr*3+1]=v3d.y; newPos[ptr*3+2]=v3d.z;
                newUV[ptr*2] = v2d.x / tileWidth;
                newUV[ptr*2+1] = v2d.y / tileHeight;
                ptr++;
            }
        }
        const finalGeo = new THREE.BufferGeometry();
        finalGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
        finalGeo.setAttribute('uv', new THREE.BufferAttribute(newUV, 2));
        finalGeo.computeVertexNormals();
        meshes.push(new THREE.Mesh(finalGeo, new THREE.ShaderMaterial({
            uniforms: { uMap: { value: texture }, uOpacity: { value: 0.0 } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv; void main() { vec2 uv = fract(vUv); vec4 col = texture2D(uMap, uv); if (uOpacity <= 0.02 || col.a < 0.1) discard; gl_FragColor = vec4(col.rgb, uOpacity); }`,
            transparent: true, side: THREE.DoubleSide, depthWrite: false
        })));
    }
    return meshes;
}

const countryColor = c => ({ US:'#7c3aed', GB:'#06b6d4', CN:'#f59e0b', JP:'#ec4899', FR:'#10b981', DE:'#8b5cf6', CO:'#f97316', IN:'#ef4444', AF:'#84cc16', IL:'#0ea5e9', AT:'#a78bfa' }[c] || '#6366f1');

export default function GlobeScene({ books, onBookClick, autoFlyTarget, isFocused, visible = true, onReadyChange, autoFlyEnabled = true }) {
    const mountRef = useRef(null);
    const stateRef = useRef(null);
    const booksRef = useRef(books);
    const [sceneReady, setSceneReady] = useState(false);
    const [meshesReady, setMeshesReady] = useState(false);
    const [engineAttempt, setEngineAttempt] = useState(0);
    const [autoFlyRetryTick, setAutoFlyRetryTick] = useState(0);
    const prevFocusedRef = useRef(isFocused);
    const lastHandledTargetIdRef = useRef(null);
    const visibleRef = useRef(visible);
    const onBookClickRef = useRef(onBookClick); // 补齐缺失的 Ref
    const onReadyChangeRef = useRef(onReadyChange);
    const interactableMeshesRef = useRef([]); // 关键：使用 Ref 替代隐式全局变量
    const initAttemptsRef = useRef(0);
    const retryTimerRef = useRef(null);
    const autoFlyRetryRef = useRef({ targetId: null, attempts: 0, timer: null });
    const hiddenWarmFramesRef = useRef(0);
    useEffect(() => { visibleRef.current = visible; }, [visible]);
    useEffect(() => { booksRef.current = books; }, [books]);

    // 关键：实时更新回调引用，解决 Stale Closure 问题，确保点击能触发最新的 HUD 逻辑
    useEffect(() => {
        onBookClickRef.current = onBookClick;
    }, [onBookClick]);
    useEffect(() => {
        onReadyChangeRef.current = onReadyChange;
    }, [onReadyChange]);

    const init = useCallback(() => {
        const container = mountRef.current;
        if (!container || stateRef.current) return;

        let renderer;
        try {
            initAttemptsRef.current += 1;
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch (error) {
            console.error('[GlobeScene] WebGL init failed:', error);
            if (initAttemptsRef.current < 4) {
                retryTimerRef.current = window.setTimeout(() => {
                    setEngineAttempt((value) => value + 1);
                }, 250);
            }
            return () => {
                if (retryTimerRef.current) {
                    window.clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = null;
                }
            };
        }
        initAttemptsRef.current = 0;
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

        const globeMesh = new THREE.Mesh(
            new THREE.SphereGeometry(R, 64, 64), 
            new THREE.MeshPhongMaterial({ color: 0x223344, transparent: true, opacity: 1, shininess: 10 })
        );
        let globeTextureDisposed = false;
        globeMesh.frustumCulled = false;
        scene.add(globeMesh);
        globeMesh.material.map = createFallbackEarthTexture();
        globeMesh.material.color.set(0x8899aa);
        globeMesh.material.needsUpdate = true;
        new THREE.TextureLoader().load(
            EARTH_TEXTURE_URL,
            tex => {
                if (globeTextureDisposed) {
                    tex.dispose();
                    return;
                }
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
                const previousMap = globeMesh.material.map;
                globeMesh.material.map = tex;
                globeMesh.material.color.set(0x8899aa);
                globeMesh.material.needsUpdate = true;
                hiddenWarmFramesRef.current = Math.max(hiddenWarmFramesRef.current, 8);
                if (previousMap && previousMap !== tex) previousMap.dispose();
            },
            undefined,
            (error) => {
                console.warn('>>> [GLOBE] Base earth texture failed, keeping fallback texture.', error);
            }
        );

        scene.add(new THREE.AmbientLight(0xffffff, 1.4));
        const sun = new THREE.DirectionalLight(0xfff8e8, 2.5); sun.position.set(30, 20, 10); scene.add(sun);
        hiddenWarmFramesRef.current = 6;

        const loadContent = async (currentBooks) => {
            console.log('>>> [GLOBE] Starting loadContent for books:', currentBooks.length);
            setMeshesReady(false);
            onReadyChangeRef.current?.(false);
            hiddenWarmFramesRef.current = 0;
            
            // 记录版本，防止多次加载相互覆盖
            const loadVersion = Date.now();
            if (!stateRef.current) stateRef.current = {};
            stateRef.current.loadVersion = loadVersion;

            // 清理旧的书籍 Mesh (不再立即清除，在准备好新的之后再换，防止闪烁)
            const oldMeshes = [...interactableMeshesRef.current];
            // 现在开始清空当前引用的数组
            // 我们保持数组引用不变，以便 stateRef 中的引用依然有效
            interactableMeshesRef.current.length = 0;

            await ensureCountryGeoIndex();
            const countries = {};
            currentBooks.forEach(b => {
                const { code, country, lat, lon } = resolveBookLocation(b);
                if (!code) return;
                if (!countries[code]) {
                    countries[code] = { books: [], lat, lon, country };
                }
                countries[code].books.push(b);
                if (!countries[code].country && country) countries[code].country = country;
                if (!hasValidCoordinates(countries[code].lat, countries[code].lon) && hasValidCoordinates(lat, lon)) {
                    countries[code].lat = lat;
                    countries[code].lon = lon;
                }
            });

            await Promise.all(Object.entries(countries).map(async ([code, { books: bks, lat, lon, country }]) => {
                const geo = await getCountryGeo(code);
                if (!geo) {
                    console.warn(`>>> [GLOBE] No geography found for country code: ${code}`);
                    return;
                }
                const center = hasValidCoordinates(lat, lon) ? { lat, lon } : getGeometryCenter(geo);
                const res = await makeCoverTexture(bks, countryColor(code));
                if (res) {
                    const { tex, cols, rows, visibleBooks } = res;
                    const ms = buildCountryMeshes(geo, center.lat, center.lon, tex);
                    ms.forEach(m => {
                        m.userData = {
                            code,
                            country,
                            lat: center.lat,
                            lon: center.lon,
                            books: visibleBooks,
                            meshCols: cols,
                            meshRows: rows,
                            totalBooks: bks.length,
                        };
                        m.frustumCulled = false;
                        scene.add(m); interactableMeshesRef.current.push(m);
                        gsap.to(m.material.uniforms.uOpacity, { value: 1, duration: 0.8 });
                    });
                }
            }));

            // 检查版本，如果中间有更新，则放弃本次渲染结果
            if (stateRef.current.loadVersion !== loadVersion) {
                console.log('>>> [GLOBE] Obsolete load detected, skipping cleanup.');
                return;
            }

            // 现在清理旧的 Mesh
            oldMeshes.forEach(m => {
                scene.remove(m);
                if (m.material.uniforms?.uMap?.value) m.material.uniforms.uMap.value.dispose();
                m.geometry.dispose();
                m.material.dispose();
            });

            console.log('>>> [GLOBE] content loaded, total meshes:', interactableMeshesRef.current.length);
            if (interactableMeshesRef.current.length === 0 && currentBooks.length > 0) {
                console.warn('>>> [GLOBE] No meshes created even though books are present. Check countryCodes.');
            }
            if (renderer.compile) {
                try {
                    renderer.compile(scene, camera);
                } catch (error) {
                    console.warn('>>> [GLOBE] renderer.compile failed during prewarm.', error);
                }
            }
            hiddenWarmFramesRef.current = 12;
            setMeshesReady(true);
            onReadyChangeRef.current?.(true);
        };

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
            const hits = ray.intersectObjects(interactableMeshesRef.current);
            if (hits.length) {
                const hit = hits[0];
                const { lat, lon, books: bks, meshCols, meshRows } = hit.object.userData;
                
                // 计算点击的是宫格中的哪一本书
                let targetBook = bks[0];
                if (meshCols > 0 && meshRows > 0 && hit.uv) {
                    const u = ((hit.uv.x % 1) + 1) % 1;
                    const v = ((hit.uv.y % 1) + 1) % 1;
                    const col = Math.min(meshCols - 1, Math.floor(u * meshCols));
                    const row = Math.min(meshRows - 1, Math.floor((1 - v) * meshRows));
                    const idx = row * meshCols + col;
                    if (bks[idx]) targetBook = bks[idx];
                }
                
                runAnim(lat, lon, 8.2, 'fly', () => onBookClickRef.current?.(targetBook));
            } else { onBookClickRef.current?.(null); }
        });

        let animId;
        const loop = () => {
            animId = requestAnimationFrame(loop);
            const shouldWarmHiddenFrame = !visibleRef.current && hiddenWarmFramesRef.current > 0;
            if (!visibleRef.current && !shouldWarmHiddenFrame) return;
            if (shouldWarmHiddenFrame) hiddenWarmFramesRef.current -= 1;
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

        stateRef.current = { renderer, interactableMeshes: interactableMeshesRef.current, controls, camera, runAnim, anim, loadContent };
        requestAnimationFrame(() => setSceneReady(true));
        return () => { 
            globeTextureDisposed = true;
            cancelAnimationFrame(animId); 
            controls.dispose(); // 补齐清理逻辑
            interactableMeshesRef.current.forEach((mesh) => {
                scene.remove(mesh);
                if (mesh.material.uniforms?.uMap?.value) {
                    mesh.material.uniforms.uMap.value.dispose();
                }
                mesh.geometry.dispose();
                mesh.material.dispose();
            });
            interactableMeshesRef.current.length = 0;
            if (globeMesh.material.map) globeMesh.material.map.dispose();
            globeMesh.geometry.dispose();
            globeMesh.material.dispose();
            if (renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
            if (renderer.forceContextLoss) {
                renderer.forceContextLoss();
            }
            renderer.dispose(); 
            stateRef.current = null;
            setSceneReady(false);
            setMeshesReady(false);
            onReadyChangeRef.current?.(false);
        };
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
        const targetId = autoFlyTarget?.id;
        const targetLocation = autoFlyTarget ? resolveBookLocation(autoFlyTarget) : null;

        const clearAutoFlyRetry = () => {
            if (autoFlyRetryRef.current.timer) {
                window.clearTimeout(autoFlyRetryRef.current.timer);
                autoFlyRetryRef.current.timer = null;
            }
        };

        const launchAutoFlight = (lat, lon, onDone) => {
            if (!s?.runAnim || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
            s.controls.enabled = false;
            s.controls.autoRotate = false;
            gsap.killTweensOf(s.camera.position);
            window.setTimeout(() => {
                if (s.anim) {
                    s.runAnim(lat, lon, 8.2, 'fly', onDone);
                }
            }, 100);
            return true;
        };

        // 仅在可见时触发自动化飞行，且确保同一个目标不重复触发
        if (autoFlyEnabled && visible && sceneReady && meshesReady && autoFlyTarget && s && lastHandledTargetIdRef.current !== targetId) {
            if (autoFlyRetryRef.current.targetId !== targetId) {
                clearAutoFlyRetry();
                autoFlyRetryRef.current = { targetId, attempts: 0, timer: null };
            }
            const m = interactableMeshesRef.current.find(x =>
                x.userData?.books?.some(book => book?.id === targetId)
            ) || interactableMeshesRef.current.find(x =>
                x.userData?.code === targetLocation?.code ||
                (targetLocation?.country && x.userData?.country === targetLocation.country)
            );
            if (m) {
                lastHandledTargetIdRef.current = targetId;
                // 脉冲高亮动画
                if (m.material.uniforms?.uOpacity) {
                    gsap.to(m.material.uniforms.uOpacity, {
                        value: 0.3, duration: 0.3, repeat: 3, yoyo: true, ease: 'sine.inOut',
                        onComplete: () => { m.material.uniforms.uOpacity.value = 1.0; }
                    });
                }
                launchAutoFlight(
                    m.userData.lat,
                    m.userData.lon,
                    () => onBookClickRef.current?.(autoFlyTarget)
                );
            } else {
                const nextAttempts = autoFlyRetryRef.current.attempts + 1;
                autoFlyRetryRef.current.attempts = nextAttempts;
                clearAutoFlyRetry();
                if (nextAttempts <= 8) {
                    autoFlyRetryRef.current.timer = window.setTimeout(() => {
                        setAutoFlyRetryTick((value) => value + 1);
                    }, 120);
                } else if (lastHandledTargetIdRef.current !== targetId) {
                    lastHandledTargetIdRef.current = targetId;
                    const flewByCoordinates = launchAutoFlight(
                        targetLocation?.lat,
                        targetLocation?.lon,
                        () => onBookClickRef.current?.(autoFlyTarget)
                    );
                    if (!flewByCoordinates) {
                        onBookClickRef.current?.(autoFlyTarget);
                    }
                }
            }
        }
        
        // 如果目标清空，重置记录以便下次可以再次触发同一本书
        if (!autoFlyTarget) {
            lastHandledTargetIdRef.current = null;
            clearAutoFlyRetry();
            autoFlyRetryRef.current = { targetId: null, attempts: 0, timer: null };
        }
        return () => {
            clearAutoFlyRetry();
        };
    }, [autoFlyEnabled, visible, sceneReady, meshesReady, autoFlyTarget, autoFlyRetryTick]);

    useEffect(() => {
        const s = stateRef.current;
        if (s && s.loadContent && sceneReady) {
            s.loadContent(books);
        }
    }, [books, sceneReady]);

    useEffect(() => { const cleanup = init(); return cleanup; }, [init, engineAttempt]);

    useEffect(() => {
        return () => {
            if (retryTimerRef.current) {
                window.clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            if (autoFlyRetryRef.current.timer) {
                window.clearTimeout(autoFlyRetryRef.current.timer);
                autoFlyRetryRef.current.timer = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!visible) {
            hiddenWarmFramesRef.current = Math.max(hiddenWarmFramesRef.current, 2);
        }
    }, [visible]);

    return <div ref={mountRef} style={{ position:'absolute', inset:0 }} />;
}
