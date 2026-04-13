'use client';

// GlobeScene V2.3 - Cinematic Constellation Upgrade (Fully Restored & Fixed)
import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuration
const R = 5;
const ATMO_R = 5.35;
const MARKER_R = 5.1;
const EARTH_TEXTURE_URL = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg';

// Helper: resolve lat/lon
function resolveBookLocation(book) {
  if (!book) return { lat: null, lon: null };
  const lat = Number.isFinite(Number(book.lat)) ? Number(book.lat) : (Number.isFinite(Number(book._sampleLat)) ? Number(book._sampleLat) : null);
  const lon = Number.isFinite(Number(book.lon)) ? Number(book.lon) : (Number.isFinite(Number(book._sampleLon)) ? Number(book._sampleLon) : null);
  return { lat, lon };
}

// Convert Lat/Lon to Vector3
function geo2xyz(lat, lon, r = R) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Ease function interpolation
const ease3 = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Fallback Texture
function createFallbackEarthTexture() {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  const W = 2048, H = 1024;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Deep night background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0c1e38');
  grad.addColorStop(0.5, '#112a4e');
  grad.addColorStop(1.0, '#080e1c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(80,140,200,0.07)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const y = (H / 12) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = 1; i < 24; i++) {
    const x = (W / 24) * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Faint continents
  [
    { cx: 0.50, cy: 0.37, rx: 0.08, ry: 0.13 }, 
    { cx: 0.56, cy: 0.53, rx: 0.06, ry: 0.12 }, 
    { cx: 0.66, cy: 0.36, rx: 0.12, ry: 0.14 }, 
    { cx: 0.29, cy: 0.37, rx: 0.09, ry: 0.11 }, 
    { cx: 0.32, cy: 0.62, rx: 0.05, ry: 0.10 }, 
    { cx: 0.77, cy: 0.65, rx: 0.06, ry: 0.07 }, 
  ].forEach(({ cx, cy, rx, ry }) => {
    const rg = ctx.createRadialGradient(cx * W, cy * H, 0, cx * W, cy * H, rx * W * 1.4);
    rg.addColorStop(0, 'rgba(40,65,55,0.55)');
    rg.addColorStop(0.6, 'rgba(28,50,40,0.28)');
    rg.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.save();
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(cx * W, (cy * H) / (ry / rx), rx * W, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Shaders ──────────────────────────────────────────────────

const earthVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv         = uv;
    vNormal     = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos   = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthFrag = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3      uSunDir;
  uniform float     uTime;
  varying vec2      vUv;
  varying vec3      vNormal;
  varying vec3      vWorldPos;

  void main() {
    vec3  viewDir = normalize(cameraPosition - vWorldPos);
    vec4 tex = texture2D(uMap, vUv);

    // Desaturate and drift towards nocturnal blue
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    float contrast = clamp((lum - 0.5) * 1.35 + 0.5, 0.0, 1.0);
    vec3 base = mix(vec3(contrast), tex.rgb, 0.28);
    base *= 0.60;

    float diff = max(dot(vNormal, uSunDir), 0.0);
    
    // Lift floor
    float night = 1.0 - smoothstep(0.0, 0.48, diff);
    vec3 nightBase = base * 0.12;
    nightBase += vec3(0.01, 0.02, 0.055) * (1.0 - lum * 0.6);
    base = mix(base, nightBase, night * 0.85);

    vec3 halfDir = normalize(uSunDir + viewDir);
    float spec   = pow(max(dot(vNormal, halfDir), 0.0), 60.0) * 0.12 * diff;

    float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
    rim = pow(rim, 3.8);
    vec3 rimCol = vec3(0.14, 0.36, 0.76) * rim * 0.28;

    vec3 color = base * (0.22 + diff * 0.78) + spec + rimCol;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmoVert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal  = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 mvp = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvp.xyz);
    gl_Position = projectionMatrix * mvp;
  }
`;

const atmoFrag = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float rim = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    rim       = pow(rim, 5.5);
    vec3 col  = vec3(0.16, 0.44, 0.90);
    float alpha = rim * 0.22;
    gl_FragColor = vec4(col * rim * 1.6, alpha);
  }
`;

const markerVert = /* glsl */`
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const markerFrag = /* glsl */`
  uniform vec3  uColor;
  uniform float uPulse;
  uniform float uVisibility;
  uniform float uFocus;
  void main() {
    float alpha = (0.55 + uPulse * 0.30) * uVisibility * clamp(uFocus, 0.1, 1.0);
    vec3  col   = uColor * (0.8 + uPulse * 0.65) * uFocus;
    gl_FragColor = vec4(col, alpha);
  }
`;

const arcVert = /* glsl */`
  varying float vLen;
  void main() {
    vLen = position.x * 0.0 + uv.x; // just grab x from uv
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const arcFrag = /* glsl */`
  uniform vec3  uColor;
  uniform float uActive; // 0=ambient, 1=active
  uniform float uHead;   // 0..1 moving head phase
  uniform float uVisibility;
  varying float vLen;

  void main() {
    float dist = fract(vLen - uHead + 1.0); // tail logic
    float intensity = smoothstep(0.4, 0.0, dist);
    
    float ambientAlpha = 0.05 * uVisibility;
    float activeAlpha  = (0.2 + intensity * 0.8) * uVisibility;
    float alpha = mix(ambientAlpha, activeAlpha, uActive);
    
    vec3 col = uColor + (vec3(1.0) * intensity * uActive);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Utilities ────────────────────────────────────────────────

// Cluster overlapping books (radial fan-out)
function clusterBooks(books) {
  if (!books || !books.length) return [];
  const CELL_SIZE = 5; 
  const BUCKETS = {};
  
  books.forEach(b => {
    let lat = Number(b.lat);
    let lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (b._sampleLat !== undefined) lat = b._sampleLat;
      if (b._sampleLon !== undefined) lon = b._sampleLon;
    }
    if (!Number.isFinite(lat)) return;

    let row = Math.floor(lat / CELL_SIZE);
    let col = Math.floor(lon / CELL_SIZE);
    let key = `${row}_${col}`;
    if (!BUCKETS[key]) BUCKETS[key] = [];
    BUCKETS[key].push({ ...b, _latOrig: lat, _lonOrig: lon });
  });

  const output = [];
  Object.values(BUCKETS).forEach(cluster => {
    if (cluster.length <= 1) {
      if (cluster[0]) {
        cluster[0].lat = cluster[0]._latOrig;
        cluster[0].lon = cluster[0]._lonOrig;
        output.push(cluster[0]);
      }
      return;
    }

    // Spread them out if there are multiples
    const cLat = cluster[0]._latOrig;
    const cLon = cluster[0]._lonOrig;
    const radius = 2.0;

    cluster.forEach((item, idx) => {
      const angle = (idx / cluster.length) * Math.PI * 2;
      const dLat = Math.sin(angle) * radius;
      const dLon = Math.cos(angle) * radius;
      item.lat = cLat + dLat;
      item.lon = cLon + dLon;
      output.push(item);
    });
  });

  return output;
}

const GLOBE_PALETTE = ['#7eb8f7', '#9da8d8', '#8ba3ee', '#b0a0e8', '#e8c97a'];
function bookColor(book, idx) {
  return GLOBE_PALETTE[idx % GLOBE_PALETTE.length];
}

function createMarkerMesh(color, tier) {
  const rs = [0.048, 0.056, 0.064];
  const geo = new THREE.SphereGeometry(rs[tier] || 0.048, 12, 12);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPulse: { value: 0.5 },
      uVisibility: { value: 1.0 },
      uFocus: { value: 1.0 },
    },
    vertexShader: markerVert,
    fragmentShader: markerFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.tier = tier;
  return mesh;
}

function createMarkerHalo(color, tier) {
  if (tier === 0) return null;
  const rs = { 1: 0.1, 2: 0.13 };
  const geo = new THREE.SphereGeometry(rs[tier], 12, 12);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: tier === 2 ? 0.07 : 0.05,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geo, mat);
}

function selectArcPairs(placed, maxArcs = 4) {
  const n = placed.length;
  if (n < 2) return [];
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push({ i, j, dist: placed[i].pos.distanceTo(placed[j].pos) });
    }
  }
  edges.sort((a, b) => b.dist - a.dist);
  
  const connected = new Set();
  const pairs = [];
  for (const e of edges) {
    if (pairs.length >= maxArcs) break;
    if (!connected.has(e.i) || !connected.has(e.j)) {
      connected.add(e.i);
      connected.add(e.j);
      pairs.push({ i: e.i, j: e.j, tier: 1 });
    }
  }
  return pairs;
}

function createOrbitalArc(p1, p2, tier) {
  const dist = p1.distanceTo(p2);
  const h = Math.max(0.2, dist * 0.25);
  const mid = p1.clone().add(p2).normalize().multiplyScalar(MARKER_R + h);
  
  const curve = new THREE.CatmullRomCurve3([
    p1.clone().normalize().multiplyScalar(MARKER_R),
    mid,
    p2.clone().normalize().multiplyScalar(MARKER_R)
  ], false, 'centripetal');
  
  const pts = curve.getPoints(60);
  const uvs = new Float32Array(pts.length * 2);
  for (let i=0; i<pts.length; i++){
    uvs[i*2] = i / (pts.length - 1);
    uvs[i*2+1] = 0;
  }
  
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#5a82c8') },
      uActive: { value: 0.0 },
      uHead: { value: 0.0 },
      uVisibility: { value: 1.0 },
    },
    vertexShader: arcVert,
    fragmentShader: arcFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Line(geo, mat);
}

// ─── Main Component ───────────────────────────────────────────

export default function GlobeScene({
  books = [],
  onBookClick = null,
  autoFlyTarget = null,
  isFocused = false,
  visible = true,
  onReadyChange = null,
  autoFlyEnabled = true
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const booksRef = useRef(books);
  const visibleRef = useRef(visible);
  
  const onBookClickRef = useRef(onBookClick);
  const onReadyRef = useRef(onReadyChange);
  const isFocusedRef = useRef(isFocused);
  
  const targetBookRef = useRef(null);
  const hiddenWarmRef = useRef(0);
  
  const initAttemptsRef = useRef(0);
  const [engineAttempt, setEngineAttempt] = useState(0);

  const [hud, setHud] = useState({
    visible: false,
    isBehind: false,
    x: 0,
    y: 0,
    book: null
  });

  useEffect(() => { booksRef.current = books; }, [books]);
  useEffect(() => { visibleRef.current = visible; }, [visible]);
  useEffect(() => { onBookClickRef.current = onBookClick; }, [onBookClick]);
  useEffect(() => { onReadyRef.current = onReadyChange; }, [onReadyChange]);

  const init = useCallback(() => {
    const container = mountRef.current;
    if (!container || stateRef.current) return;

    const dbg = document.getElementById('globe-debug-overlay');
    const stage = (msg) => { if (dbg) dbg.innerText = `[STAGE] ${msg}`; };

    try {
      stage('1: Check WebGL');
      if (!container || !window.WebGLRenderingContext) {
        setEngineAttempt(a => a + 1);
        return; 
      }

      stage('2: Create Renderer');
      let renderer;
      try {
        initAttemptsRef.current += 1;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (err) {
        stage('ERROR: Renderer creation failed');
        console.error('[GlobeScene] WebGL init failed:', err);
        if (initAttemptsRef.current < 4) {
          setTimeout(() => setEngineAttempt(v => v + 1), 250);
        }
        return;
      }
      initAttemptsRef.current = 0;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setClearColor(0x000000, 0); 
      container.appendChild(renderer.domElement);

      stage('3: Setup scene');
      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 900);
      camera.position.set(0, 0, 16.5);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping    = true;
      controls.dampingFactor    = 0.07;
      controls.minDistance      = 7;
      controls.maxDistance      = 28;
      controls.autoRotate       = true;
      controls.autoRotateSpeed  = 0.22;
      controls.enablePan        = false;

      stage('4: Build Stars');
      // Build Stars
      const STAR_COUNT = 3000;
      const starPos = new Float32Array(STAR_COUNT * 3);
      for (let i = 0; i < STAR_COUNT; i++) {
        const phi   = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        const r     = 300 + Math.random() * 200;
        starPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
        starPos[i*3+1] = r * Math.cos(phi);
        starPos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        size: 0.55, color: 0xc8d8ff, transparent: true, opacity: 0.30,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, depthWrite: false,
      });
      scene.add(new THREE.Points(starGeo, starMat));

      stage('5: Build Earth');
      // Build Earth
      let globeTexDisposed = false;
      const fallbackTex = createFallbackEarthTexture();
      const sunDir = new THREE.Vector3(1.2, 0.7, 0.5).normalize();

      const earthMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: fallbackTex }, uSunDir: { value: sunDir }, uTime: { value: 0 } },
        vertexShader: earthVert, fragmentShader: earthFrag,
      });
      const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), earthMat);
      earthMesh.frustumCulled = false;
      scene.add(earthMesh);

      stage('6: Build Atmosphere');
      const atmoMat = new THREE.ShaderMaterial({
        vertexShader: atmoVert, fragmentShader: atmoFrag,
        transparent: true, side: THREE.FrontSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(ATMO_R, 48, 48), atmoMat);
      atmoMesh.frustumCulled = false;
      scene.add(atmoMesh);

      stage('7: Setup groups');
      // Anim Context
      const anim = { active: false, frames: 0, maxFrames: 70, type: 'none', qS: new THREE.Quaternion(), qE: new THREE.Quaternion(), rS: 16.5, rE: 8.5 };
      const runAnim = (lat, lon, targetR, type, onDone) => {
        anim.active = false;
        const startPos = camera.position.clone();
        const endPos   = type === 'pull' ? startPos.clone().normalize().multiplyScalar(targetR) : geo2xyz(lat, lon, targetR);
        anim.qS.setFromUnitVectors(new THREE.Vector3(0,0,1), startPos.clone().normalize());
        anim.qE.setFromUnitVectors(new THREE.Vector3(0,0,1), endPos.clone().normalize());
        anim.rS = startPos.length(); anim.rE = targetR;
        anim.frames = 0; anim.type = type; anim.onDone = onDone;
        anim.active = true;
        controls.enabled = false; controls.autoRotate = false;
      };

      const markerGroup = new THREE.Group();
      const arcGroup = new THREE.Group();
      scene.add(markerGroup);
      scene.add(arcGroup);

      const markerMeshes = [];
      let frames = 0;
      let buildStep = "idle";
      let placedCount = 0;
      let clusterSummary = "";
      let loopStep = "V4.0: BOOT";

      stage('8: Build Markers function');
      window._globeInitCount = (window._globeInitCount || 0) + 1;

      const buildMarkers = (items) => {
        buildStep = "starting";
        try {
          while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0]);
          while (arcGroup.children.length)    arcGroup.remove(arcGroup.children[0]);
          markerMeshes.length = 0;

          const spreadItems = clusterBooks(items);
          buildStep = `clustered: ${spreadItems.length}`;
          clusterSummary = `In: ${items?.length} -> Out: ${spreadItems.length}`;
          
          if (!spreadItems || !spreadItems.length) return;

          const placed = [];
          spreadItems.forEach((book, idx) => {
            let lat = book.lat ?? null;
            let lon = book.lon ?? null;
            if (lat === null || lon === null) {
               const loc = resolveBookLocation(book);
               lat = loc.lat; lon = loc.lon;
            }
            if (lat === null || lon === null) { lat = 0; lon = 0; }

            const tier = idx === 0 ? 2 : (idx < 5 ? 1 : 0);
            const r = MARKER_R + [0.15, 0.25, 0.35][tier];
            const color = bookColor(book, idx);
            const pos = geo2xyz(lat, lon, r);

            const dot = createMarkerMesh(color, tier);
            dot.position.copy(pos);
            dot.userData = { book, index: idx, tier };
            markerGroup.add(dot);
            markerMeshes.push(dot);

            const halo = createMarkerHalo(color, tier);
            if (halo) { halo.position.copy(pos); markerGroup.add(halo); }

            placed.push({ pos, color, book });
          });

          placedCount = placed.length;
          buildStep = "done";

          const pairs = selectArcPairs(placed, 8);
          pairs.forEach(({ i, j, tier }) => {
            const arc = createOrbitalArc(placed[i].pos, placed[j].pos, tier);
            arc.userData = { meshI: i, meshJ: j };
            arcGroup.add(arc);
          });
        } catch(err) {
          buildStep = "crash: " + err.toString();
        }
      };

      stage('9: Setup interaction');
      const ray = new THREE.Raycaster();
      ray.params.Points = { threshold: 0.1 };
      const mouse = new THREE.Vector2();
      let isPointerDown = false, pointerMoved = false;
      let pdX = 0, pdY = 0;
      let hoveredIndex = -1, selectedIndex = -1;

      renderer.domElement.addEventListener('pointerdown', e => { isPointerDown = true; pointerMoved = false; pdX = e.clientX; pdY = e.clientY; });
      renderer.domElement.addEventListener('pointermove', e => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(markerMeshes);
        if (hits.length) { hoveredIndex = markerMeshes.indexOf(hits[0].object); document.body.style.cursor = 'pointer'; }
        else { hoveredIndex = -1; document.body.style.cursor = 'auto'; }
        if (isPointerDown && (Math.abs(e.clientX - pdX) > 4 || Math.abs(e.clientY - pdY) > 4)) pointerMoved = true;
      });
      renderer.domElement.addEventListener('pointerup', e => {
        if (isPointerDown && !pointerMoved && !anim.active) {
          const hits = ray.intersectObjects(markerMeshes);
          if (hits.length) {
            selectedIndex = markerMeshes.indexOf(hits[0].object);
            const book = hits[0].object.userData.book;
            const {lat, lon} = resolveBookLocation(book);
            runAnim(lat||0, lon||0, 8.5, 'fly', () => onBookClickRef.current?.(book));
          } else { onBookClickRef.current?.(null); }
        }
        isPointerDown = false;
      });

      const onResize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      stage('10: Enter Loop');

      if (booksRef.current?.length) buildMarkers(booksRef.current);

      const clock = new THREE.Clock();
      let animId, heartFallback;

      const loop = () => {
        animId = requestAnimationFrame(loop);
        clearTimeout(heartFallback);
        heartFallback = setTimeout(loop, 50);

        const dbg = document.getElementById('globe-debug-overlay');
        const updateDbg = (s) => {
          if (!dbg) return;
          loopStep = s;
          dbg.innerText = `[PIPELINE TRACE V4.0]
Init Count: ${window._globeInitCount}
Frames: ${frames}
Step: ${loopStep}
Last Op: ${buildStep}
Placed: ${placedCount}
Meshes: ${markerMeshes.length}
Time: ${clock.getElapsedTime().toFixed(1)}
Error: ${window._lastGlobeError || 'NONE'}
`;
        };

        updateDbg("11.1: Start");
        try {
          frames++;
          const t = clock.getElapsedTime();

          updateDbg("11.2: Uniforms");
          if (typeof earthMat !== 'undefined' && earthMat.uniforms.uTime) {
            earthMat.uniforms.uTime.value = t;
          }

          let targetMeshIdx = 0; 
          if (selectedIndex !== -1) targetMeshIdx = selectedIndex;
          else if (hoveredIndex !== -1) targetMeshIdx = hoveredIndex;

          const camDir = camera.position.clone().normalize();
          const anyActive = hoveredIndex !== -1 || selectedIndex !== -1;

          updateDbg("11.3: Markers");
          markerMeshes.forEach((mesh, i) => {
            if (!mesh.material.uniforms) return;
            const tier = mesh.userData.tier ?? 0;
            const phase = (t * (0.4 + tier * 0.2) + i * 1.4) % (Math.PI * 2);
            const pulse = Math.sin(phase) * 0.5 + 0.5;
            const vis = THREE.MathUtils.clamp((mesh.position.clone().normalize().dot(camDir) + 0.15) / 0.30, 0, 1);
            const isActive = (i === targetMeshIdx);
            const focusTarget = anyActive ? (isActive ? 1.0 : 0.05 + tier * 0.10) : 1.0;
            const prevFocus = mesh.material.uniforms.uFocus?.value ?? 0;
            mesh.material.uniforms.uPulse.value = pulse;
            mesh.material.uniforms.uVisibility.value = vis;
            mesh.material.uniforms.uFocus.value = THREE.MathUtils.lerp(prevFocus, focusTarget, 0.08);
          });

          updateDbg("11.4: Arcs");
          arcGroup.children.forEach(arc => {
            if (!arc.material.uniforms) return;
            const { meshI, meshJ } = arc.userData;
            const isConnected = targetMeshIdx === meshI || targetMeshIdx === meshJ;
            const isSelected = selectedIndex === meshI || selectedIndex === meshJ;
            const cur = arc.material.uniforms.uActive.value;
            arc.material.uniforms.uActive.value = THREE.MathUtils.lerp(cur, 1.0, isSelected ? 0.1 : (isConnected ? 0.06 : 0.025));
            if (arc.material.uniforms.uHead) arc.material.uniforms.uHead.value = (t * (isSelected ? 0.28 : 0.14)) % 1.0;
          });

          updateDbg("11.5: Anim");
          if (anim.active) {
            anim.frames++;
            const tAnim = ease3(Math.min(anim.frames / anim.maxFrames, 1));
            const q = new THREE.Quaternion().slerpQuaternions(anim.qS, anim.qE, tAnim);
            camera.position.set(0, 0, 1).applyQuaternion(q).multiplyScalar(anim.rS + (anim.rE - anim.rS) * tAnim);
            camera.lookAt(0, 0, 0);
            if (anim.frames >= anim.maxFrames) { anim.active = false; controls.enabled = true; controls.autoRotate = (anim.type === 'pull'); controls.update(); anim.onDone?.(); }
          } else {
            controls.update();
          }

          const targetMesh = markerMeshes[targetMeshIdx];
          if (targetMesh && container) {
            const vPos = targetMesh.position.clone();
            vPos.project(camera);
            const nx = (vPos.x * 0.5 + 0.5) * container.clientWidth, ny = (-vPos.y * 0.5 + 0.5) * container.clientHeight;
            const isBehind = targetMesh.position.clone().normalize().dot(camDir) < -0.15;
            setHud(prev => {
              if (prev.book === targetMesh.userData.book && Math.abs(prev.x - nx) < 1 && Math.abs(prev.y - ny) < 1 && prev.isBehind === isBehind && prev.visible) return prev;
              return { visible: true, isBehind, x: nx, y: ny, book: targetMesh.userData.book };
            });
          } else { setHud(h => h.visible ? { ...h, visible: false } : h); }

          loopStep = "11.6: Render";
          renderer.render(scene, camera);

          loopStep = "11.7: Schedule";
          animId = requestAnimationFrame(loop);
          clearTimeout(heartFallback);
          heartFallback = setTimeout(loop, 40);

        } catch (err) {
          window._lastGlobeError = err.toString();
        }
      };

      loop();

      stateRef.current = { renderer, scene, camera, controls, anim, runAnim, buildMarkers, markerMeshes };
      hiddenWarmRef.current = 6;
      onReadyRef.current?.(true);

      return () => {
        globeTexDisposed = true;
        cancelAnimationFrame(animId);
        clearTimeout(heartFallback);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
      };
    } catch (err) {
      if (dbg) dbg.innerText = "[CRASH] " + err.toString();
      console.error("CRITICAL INIT ERROR:", err);
    }
  }, []);

  useEffect(() => {
    const cleanup = init();
    return () => cleanup?.();
  }, [init, engineAttempt]);

  useEffect(() => {
    if (stateRef.current && books?.length) stateRef.current.buildMarkers(books);
  }, [books]);

  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    if (isFocused) {
      st.controls.autoRotate = false;
    } else if (isFocusedRef.current) {
      st.controls.autoRotate = true;
      if (st.camera.position.length() < 12) st.runAnim(0, 0, 16.5, 'pull');
    }
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    const st = stateRef.current;
    const tid = autoFlyTarget?.id;
    if (!autoFlyEnabled || !visible || !st || !autoFlyTarget || targetBookRef.current === tid) return;
    targetBookRef.current = tid;
    const {lat, lon} = resolveBookLocation(autoFlyTarget);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      setTimeout(() => st.runAnim(lat, lon, 8.5, 'fly'), 80);
    }
  }, [autoFlyTarget, autoFlyEnabled, visible]);

  return (
    <div ref={mountRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'auto' }}>
      <div 
        id="globe-debug-overlay"
        style={{ 
          position: 'absolute', 
          zIndex: 100, 
          top: 80, 
          left: 20, 
          background: 'rgba(0,100,0,0.85)', 
          color: '#fff', 
          fontFamily: 'monospace', 
          padding: '10px', 
          borderRadius: '4px',
          fontSize: '11px',
          whiteSpace: 'pre-wrap',
          minWidth: '150px'
        }}
      >
        Waiting for loop...
      </div>
      <div style={{ position: 'absolute', zIndex: 50, top: 20, left: 20, background: 'rgba(0,0,0,0.8)', color: '#0f0', fontFamily: 'monospace', padding: 8, borderRadius: 4, display: 'none' }}>
        [V2.3 RESTORED AND HOISTING BUG FIXED]
      </div>
      
      {hud.visible && hud.book && !hud.isBehind && (() => {
        const containerW = mountRef.current?.clientWidth ?? 800;
        const isRightSide = hud.x > containerW * 0.55;
        const annotX  = isRightSide ? hud.x - 70  : hud.x + 70;
        const annotDir = isRightSide ? -1 : 1;
        const cardLeft = isRightSide ? annotX - 160 : annotX;
        const cardTop  = hud.y - 52;

        return (
          <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 30 }}>
            {/* Guide line */}
            <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              <line x1={hud.x} y1={hud.y} x2={annotX} y2={hud.y - 18} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <line x1={annotX} y1={hud.y - 18} x2={annotX + annotDir * 44} y2={hud.y - 18} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            </svg>

            {/* Typography block */}
            <div style={{ position: 'absolute', left: cardLeft, top: cardTop, width: 160, textAlign: isRightSide ? 'right' : 'left', color: '#fff' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                {hud.book.title}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                {hud.book.author}
              </div>
              {(hud.book.country || hud.book.location) && (
                <div style={{ fontSize: '10px', color: '#aab8ff', marginTop: '6px', letterSpacing: '0.05em' }}>
                  <span style={{ display:'inline-block', width:4, height:4, background:'#aab8ff', borderRadius:'50%', marginRight:6, verticalAlign:'middle' }} />
                  {hud.book.country || hud.book.location}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
