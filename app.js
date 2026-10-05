import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ================= renderer / scene ================= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b16);
scene.fog = new THREE.Fog(0x070b16, 18, 46);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(7.2, 4.4, 9.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 3;
controls.maxDistance = 30;
controls.target.set(0, 1.8, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 1.1;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x1a1430, 0.75));
const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
key.position.set(6, 10, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -10; key.shadow.camera.right = 10;
key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0x9db8ff, 0.55);
fill.position.set(-5, 3, 7);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x7c6cff, 1.2);
rim.position.set(-7, 4, -6);
scene.add(rim);
const spot = new THREE.SpotLight(0xfff6e8, 55, 40, 0.55, 0.7, 1.6);
spot.position.set(-6, 10, 8);
scene.add(spot);

/* studio floor: soft radial sheen fading into the backdrop */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(16, 64),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 })
);
{
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
  grd.addColorStop(0, '#1c2547');
  grd.addColorStop(0.45, '#111736');
  grd.addColorStop(1, '#070b16');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 512, 512);
  const gt = new THREE.CanvasTexture(c);
  gt.colorSpace = THREE.SRGBColorSpace;
  ground.material.map = gt;
}
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.PolarGridHelper(12, 12, 8, 64, 0x22d3ee, 0x2a3560);
grid.position.y = 0.01;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const dustGeo = new THREE.BufferGeometry();
{
  const n = 260, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = Math.random() * 12;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 26;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x88ccff, size: 0.05, transparent: true, opacity: 0.7 }));
scene.add(dust);

const modelRoot = new THREE.Group();
scene.add(modelRoot);

/* ================= utils ================= */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const rr = (rng, a, b) => a + rng() * (b - a);

/* deterministic value-noise fbm for organic displacement */
function makeNoise(seed) {
  const h = (x, y, z) => {
    let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
    return n - Math.floor(n);
  };
  const smooth = t => t * t * (3 - 2 * t);
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = smooth(xf), v = smooth(yf), w = smooth(zf);
    let res = 0;
    res += h(xi, yi, zi) * (1 - u) * (1 - v) * (1 - w);
    res += h(xi + 1, yi, zi) * u * (1 - v) * (1 - w);
    res += h(xi, yi + 1, zi) * (1 - u) * v * (1 - w);
    res += h(xi + 1, yi + 1, zi) * u * v * (1 - w);
    res += h(xi, yi, zi + 1) * (1 - u) * (1 - v) * w;
    res += h(xi + 1, yi, zi + 1) * u * (1 - v) * w;
    res += h(xi, yi + 1, zi + 1) * (1 - u) * v * w;
    res += h(xi + 1, yi + 1, zi + 1) * u * v * w;
    return res * 2 - 1;
  }
  return function fbm(x, y, z, oct = 3) {
    let a = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { a += amp * noise3(x * f, y * f, z * f); amp *= 0.5; f *= 2.03; }
    return a;
  };
}

/* weld + smooth normals: the single biggest "not primitives" win */
function smoothGeo(geo) {
  try {
    const merged = mergeVertices(geo, 1e-4);
    merged.computeVertexNormals();
    geo.dispose?.();
    return merged;
  } catch { geo.computeVertexNormals(); return geo; }
}
function displaceGeo(geo, fbm, amp, freq, seedOff = 0) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const d = fbm(v.x * freq + seedOff, v.y * freq, v.z * freq);
    pos.setXYZ(i, v.x + n.x * d * amp, v.y + n.y * d * amp, v.z + n.z * d * amp);
  }
  pos.needsUpdate = true;
  return smoothGeo(geo);
}

/* procedural canvas textures (map + bump reuse) */
function canvasTex(size, painter, { srgb = true, repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function woodTexture(base = '#8b5a2b', dark = '#5d3a17') {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      ctx.strokeStyle = `rgba(40,20,5,${0.08 + Math.random() * 0.22})`;
      ctx.lineWidth = 1 + Math.random() * 2.5;
      ctx.beginPath();
      const y = Math.random() * s;
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 4 + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = dark;
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath(); ctx.ellipse(x, y, 4 + Math.random() * 6, 2 + Math.random() * 3, 0, 0, 7); ctx.fill();
    }
  });
}
function stoneTexture(base = '#9aa0ad', mortar = '#565b66') {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = mortar; ctx.fillRect(0, 0, s, s);
    const rows = 5, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 30;
      for (let x = -1; x < 5; x++) {
        const w = 55 + Math.random() * 20;
        const g = 150 + Math.random() * 40;
        ctx.fillStyle = `rgb(${g},${g + 3},${g + 8})`;
        ctx.beginPath(); ctx.roundRect(x * 60 + off + 3, r * rh + 3, w, rh - 6, 8); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        ctx.beginPath(); ctx.roundRect(x * 60 + off + 3, r * rh + 3, w, 8, 6); ctx.fill();
      }
    }
    void base;
  });
}
function roofTexture(base = '#a33b2e') {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    const rows = 8, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < s; x += 32) {
        const o = (r % 2) * 16;
        const l = 0.85 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(${Math.round(150 * l)},${Math.round(55 * l)},${Math.round(45 * l)},1)`;
        ctx.beginPath(); ctx.roundRect(x + o + 1, r * rh + 1, 30, rh - 2, [0, 0, 8, 8]); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(x + o + 1, r * rh + rh - 4, 30, 3);
      }
    }
  });
}
function barkTexture() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#4a3521'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(${20 + Math.random() * 40},${12 + Math.random() * 26},8,${0.3 + Math.random() * 0.4})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      const x = Math.random() * s;
      ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 30, s);
      ctx.stroke();
    }
  });
}
function scaleTexture() {
  const t = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
    const n = 10, cell = s / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const g = 110 + Math.random() * 60;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.beginPath();
      ctx.arc(c * cell + cell / 2 + (r % 2) * cell / 2 - cell / 2, r * cell + cell / 2, cell * 0.46, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(c * cell + cell / 2 - 3, r * cell + cell / 2 - 3, cell * 0.14, 0, 7); ctx.fill();
    }
  }, { srgb: false });
  return t;
}
function foliageTexture() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#2d5a27'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const g = 40 + Math.random() * 70;
      ctx.fillStyle = `rgba(${g * 0.5},${g + 40},${g * 0.45},.8)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2 + Math.random() * 3);
    }
  });
}
function brushedTexture() {
  const t = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#888'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i++) {
      const g = 110 + Math.random() * 40;
      ctx.strokeStyle = `rgba(${g},${g},${g},.5)`;
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
  }, { srgb: false });
  return t;
}

/* PBR material helpers */
function PBR(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.55, metalness: 0.05,
    clearcoat: 0, clearcoatRoughness: 0.4,
    envMapIntensity: 0.9, ...opts,
  });
}
function mat(color, opts = {}) { return PBR(color, opts); }

function mesh(geo, material, x = 0, y = 0, z = 0, parent = modelRoot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
/* soft blob shadow that grounds the model on its stage */
let blobTexCache = null;
function blobShadow(parent, y, radius, opacity = 0.5) {
  if (!blobTexCache) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    blobTexCache = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTexCache, transparent: true, opacity, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = 2;
  parent.add(m);
  return m;
}
function rbox(w, h, d, r = 0.06, seg = 3) { return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2.2)); }
function lathe(points, segs = 40) {
  return smoothGeo(new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), segs));
}
/* tapered tube along a curve — necks, tails, limbs, trunks */
function taperedTube(pts, radiusFn, tubular = 28, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos = [], norm = [], uv = [], idx = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const P = curve.getPoint(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = radiusFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const sin = Math.sin(a), cos = Math.cos(a);
      const nx = cos * N.x + sin * B.x, ny = cos * N.y + sin * B.y, nz = cos * N.z + sin * B.z;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
      norm.push(nx, ny, nz);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ================= palettes ================= */
const PALETTES = {
  forest: [0x2f9e44, 0x74c69d, 0x8b5a2b, 0xd8f3dc, 0x40916c],
  ocean: [0x0096c7, 0x48cae4, 0x023e8a, 0xade8f4, 0xf4f1de],
  sunset: [0xff6d00, 0xff9e00, 0xff5400, 0x9e2b25, 0xffe66d],
  candy: [0xff5d8f, 0x7c6cff, 0x22d3ee, 0xffe66d, 0xffffff],
  royal: [0x5a189a, 0x9d4edd, 0xff8500, 0xffd60a, 0xffffff],
  lava: [0x370617, 0x9d0208, 0xf48c06, 0xffba08, 0x03071e],
  ice: [0xcaf0f8, 0x90e0ef, 0x00b4d8, 0xffffff, 0x0077b6],
  gold: [0xd4af37, 0x8b6508, 0xfff3b0, 0xb08968, 0x2b2d42],
  moss: [0x606c38, 0x283618, 0xdda15e, 0xbc6c25, 0xfefae0],
  mono: [0xe8edf7, 0x93a0b8, 0x334155, 0x7c6cff, 0x22d3ee],
};
const COLOR_WORDS = [
  [/black|midnight|stealth/, 0x1b1d22], [/white|ivory|ghost/, 0xf0f3f8],
  [/red|crimson|scarlet|ruby/, 0xd21f26], [/blue|azure|saphire|sapphire|navy/, 0x1663c7],
  [/green|emerald|jade/, 0x2f9e44], [/pink|rose/, 0xff5d8f],
  [/purple|violet|lavender/, 0x7c3aed], [/orange|tangerine/, 0xff6d00],
  [/yellow|lemon/, 0xffc400], [/gold|golden/, 0xd4af37], [/silver|chrome/, 0xc8ccd4],
  [/teal|turquoise|cyan/, 0x14b8a6], [/brown|chocolate/, 0x7a5230],
];
function colorWord(prompt) {
  const p = prompt.toLowerCase();
  for (const [re, c] of COLOR_WORDS) if (re.test(p)) return c;
  return null;
}
function paletteFor(prompt) {
  const p = prompt.toLowerCase();
  if (/lava|volcano|fire|dragon|hell/.test(p)) return { name: 'lava', colors: PALETTES.lava };
  if (/ocean|sea|water|fish|whale|shark|island|beach/.test(p)) return { name: 'ocean', colors: PALETTES.ocean };
  if (/forest|tree|moss|leaf|garden|jungle|elf/.test(p)) return { name: 'forest', colors: PALETTES.forest };
  if (/sunset|desert|autumn|warm|cozy/.test(p)) return { name: 'sunset', colors: PALETTES.sunset };
  if (/ice|frozen|snow|winter|arctic|crystal|diamond|gem/.test(p)) return { name: 'ice', colors: PALETTES.ice };
  if (/gold|luxury|king|queen|royal|temple|god/.test(p)) return { name: 'gold', colors: PALETTES.gold };
  if (/night|neon|cyber|robot|space|future|laser/.test(p)) return { name: 'candy', colors: PALETTES.candy };
  if (/castle|medieval|knight|kingdom/.test(p)) return { name: 'royal', colors: PALETTES.royal };
  if (/mushroom|frog|cottage|farm|shroom/.test(p)) return { name: 'moss', colors: PALETTES.moss };
  return { name: 'aurora', colors: PALETTES.mono };
}

function styleMats(style, colors, rng, fbm) {
  void fbm;
  const paint = (c, extra = {}) => PBR(c, {
    roughness: 0.42, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.35,
    envMapIntensity: 1.0, ...extra,
  });
  if (style === 'lowpoly') return {
    primary: mat(colors[0], { flatShading: true, roughness: 0.8 }),
    secondary: mat(colors[1] ?? colors[0], { flatShading: true, roughness: 0.8 }),
    accent: mat(colors[3] ?? 0xffe66d, { flatShading: true, roughness: 0.6 }),
    dark: mat(0x232a3d, { flatShading: true, roughness: 0.85 }),
    ground: mat(colors[2] ?? 0x8b5a2b, { flatShading: true, roughness: 0.9 }),
  };
  if (style === 'crystal') return {
    primary: new THREE.MeshPhysicalMaterial({ color: 0x9be8ff, roughness: 0.06, metalness: 0, transmission: 0.35, thickness: 1.4, clearcoat: 1, ior: 1.5, envMapIntensity: 1.4 }),
    secondary: new THREE.MeshPhysicalMaterial({ color: 0xc084fc, roughness: 0.1, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.3 }),
    accent: paint(0xffd60a, { emissive: 0xff9e00, emissiveIntensity: 0.5 }),
    dark: paint(0x1e1b4b, { roughness: 0.5, clearcoat: 0 }),
    ground: paint(0x334155, { roughness: 0.7, clearcoat: 0 }),
  };
  if (style === 'neon') return {
    primary: paint(pick(rng, colors), { emissive: pick(rng, colors), emissiveIntensity: 0.55, roughness: 0.3, clearcoat: 0.8 }),
    secondary: paint(0x141432, { emissive: 0x22d3ee, emissiveIntensity: 0.5, roughness: 0.35 }),
    accent: paint(0xffffff, { emissive: 0xf472b6, emissiveIntensity: 1.2, roughness: 0.2 }),
    dark: paint(0x0a0a1a, { roughness: 0.4, clearcoat: 0.3 }),
    ground: paint(0x111133, { roughness: 0.6, clearcoat: 0 }),
  };
  if (style === 'gold') return {
    primary: paint(0xd4af37, { metalness: 0.95, roughness: 0.3, clearcoat: 0.4 }),
    secondary: paint(0x8b6508, { metalness: 0.9, roughness: 0.42, clearcoat: 0.2 }),
    accent: paint(0xfff3b0, { metalness: 1, roughness: 0.15, emissive: 0x442200, emissiveIntensity: 0.25 }),
    dark: paint(0x2b2d42, { metalness: 0.6, roughness: 0.5, clearcoat: 0 }),
    ground: paint(0x3a3226, { roughness: 0.7, clearcoat: 0 }),
  };
  return {
    primary: paint(colors[0]),
    secondary: paint(colors[1] ?? colors[0]),
    accent: paint(colors[3] ?? 0xffe66d, { roughness: 0.35 }),
    dark: paint(0x2a3042, { roughness: 0.62, clearcoat: 0.1 }),
    ground: paint(colors[2] ?? 0x8b5a2b, { roughness: 0.75, clearcoat: 0 }),
  };
}

/* ================= builders (realistic v2) ================= */
function buildPedestal(M) {
  const g = new THREE.Group();
  const stone = stoneTexture();
  const disc = mesh(
    smoothGeo(new THREE.CylinderGeometry(3.1, 3.45, 0.35, 56)),
    PBR(0x3d4457, { map: stone, roughness: 0.8, metalness: 0.05 }), 0, 0.18, 0, g);
  disc.receiveShadow = true;
  mesh(new THREE.TorusGeometry(3.1, 0.055, 14, 96), M.accent, 0, 0.36, 0, g).rotation.x = Math.PI / 2;
  return g;
}

function buildFloatingIsland(g, M, rng, detail, fbm) {
  const rockTex = stoneTexture('#6b5a4e', '#3a3129');
  const rockGeo = displaceGeo(new THREE.ConeGeometry(2.6, rr(rng, 2.4, 3.1), 24, 6), fbm, 0.28, 0.9, rng() * 9);
  const rock = mesh(rockGeo, PBR(0x7a6a5c, { map: rockTex, bumpMap: rockTex, bumpScale: 0.6, roughness: 0.95 }), 0, -1.2, 0, g);
  rock.rotation.x = Math.PI;
  const grassGeo = displaceGeo(new THREE.CylinderGeometry(2.75, 2.55, 0.55, 32, 2), fbm, 0.09, 1.4, rng() * 9);
  const grassTex = foliageTexture(); grassTex.repeat.set(3, 1);
  mesh(grassGeo, PBR(0x4a9e5c, { map: grassTex, roughness: 0.9 }), 0, 0.55, 0, g);
  // hanging roots / rock shards
  const n = detail === 0 ? 4 : 7;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const shard = mesh(displaceGeo(new THREE.ConeGeometry(rr(rng, 0.1, 0.22), rr(rng, 0.5, 1.2), 7), fbm, 0.04, 2, i),
      PBR(0x6a5f52, { roughness: 0.95 }), Math.cos(a) * rr(rng, 1, 2.2), rr(rng, -2.4, -1.4), Math.sin(a) * rr(rng, 1, 2.2), g);
    shard.rotation.x = Math.PI + rr(rng, -0.3, 0.3);
  }
  // orbiting pebbles
  for (let i = 0; i < (detail === 2 ? 6 : 4); i++) {
    const a = (i / 6) * Math.PI * 2 + rng();
    const s = mesh(displaceGeo(new THREE.DodecahedronGeometry(rr(rng, 0.14, 0.34), 1), fbm, 0.05, 2, i * 3),
      M.secondary, Math.cos(a) * rr(rng, 3.6, 5), rr(rng, 0.5, 3), Math.sin(a) * rr(rng, 3.6, 5), g);
    s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  }
}

function buildHouse(g, M, rng, detail, fbm) {
  const wood = woodTexture(); wood.repeat.set(1.5, 1.5);
  const stone = stoneTexture(); stone.repeat.set(2, 1);
  const roofT = roofTexture(); roofT.repeat.set(3, 2);
  const wallMat = PBR(0xe8dcc3, { roughness: 0.85, bumpMap: stone, bumpScale: 0.15 });
  const beamMat = PBR(0x4a2f18, { map: wood, roughness: 0.7 });
  // stone foundation + plaster walls (rounded, not sharp boxes)
  mesh(rbox(3.1, 0.5, 2.7, 0.08), PBR(0x8a8f9a, { map: stone, roughness: 0.9 }), 0, 0.6, 0, g);
  mesh(rbox(2.7, 1.9, 2.3, 0.05), wallMat, 0, 1.75, 0, g);
  // timber frame
  for (const x of [-1.28, 1.28]) mesh(rbox(0.14, 1.9, 0.14, 0.03), beamMat, x, 1.75, 1.1, g);
  mesh(rbox(2.7, 0.16, 0.14, 0.03), beamMat, 0, 2.6, 1.1, g);
  // gable roof: extruded triangle with overhang + ridge
  const tri = new THREE.Shape();
  tri.moveTo(-1.85, 0); tri.lineTo(1.85, 0); tri.lineTo(0, 1.35); tri.closePath();
  const roofGeo = smoothGeo(new THREE.ExtrudeGeometry(tri, { depth: 3.0, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 2 }));
  roofGeo.translate(0, 0, -1.5);
  const roof = mesh(roofGeo, PBR(0xa8402f, { map: roofT, bumpMap: roofT, bumpScale: 0.5, roughness: 0.8 }), 0, 2.62, 0, g);
  void roof;
  mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 10), beamMat, 0, 3.98, 0, g).rotation.x = Math.PI / 2;
  // stone chimney with cap
  mesh(rbox(0.5, 1.3, 0.5, 0.05), PBR(0x8a8f9a, { map: stone, roughness: 0.9 }), 0.9, 3.6, -0.4, g);
  mesh(rbox(0.7, 0.12, 0.7, 0.03), PBR(0x3a3f4a, { roughness: 0.8 }), 0.9, 4.28, -0.4, g);
  // recessed door with panels + iron handle
  mesh(rbox(0.8, 1.3, 0.1, 0.03), beamMat, 0, 1.25, 1.16, g);
  mesh(rbox(0.6, 1.1, 0.06, 0.02), PBR(0x6b4423, { map: wood, roughness: 0.65 }), 0, 1.25, 1.2, g);
  mesh(new THREE.SphereGeometry(0.05, 10, 8), M.accent, 0.2, 1.25, 1.26, g);
  // windows: deep frame + mullions + warm glass + shutters
  const glassMat = PBR(0xffdf9e, { emissive: 0xffb703, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1 });
  const shutterMat = PBR(0x3f5a3a, { roughness: 0.75 });
  for (const x of [-0.85, 0.85]) {
    mesh(rbox(0.66, 0.66, 0.1, 0.02), beamMat, x, 1.95, 1.16, g);
    mesh(new THREE.BoxGeometry(0.52, 0.52, 0.06), glassMat, x, 1.95, 1.18, g);
    mesh(new THREE.BoxGeometry(0.06, 0.52, 0.07), beamMat, x, 1.95, 1.19, g);
    mesh(new THREE.BoxGeometry(0.52, 0.06, 0.07), beamMat, x, 1.95, 1.19, g);
    for (const sx of [-0.5, 0.5]) {
      mesh(rbox(0.24, 0.7, 0.05, 0.015), shutterMat, x + sx, 1.95, 1.14, g);
      for (let l = 0; l < 3; l++) mesh(rbox(0.2, 0.03, 0.055, 0.008), beamMat, x + sx, 1.78 + l * 0.17, 1.14, g);
    }
    mesh(rbox(0.8, 0.08, 0.14, 0.02), beamMat, x, 1.58, 1.18, g); // sill
  }
  // gutters + downspout
  const gutterMat = PBR(0x3a3f4a, { metalness: 0.7, roughness: 0.45 });
  for (const sx of [-1.94, 1.94])
    mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.3, 10), gutterMat, sx, 2.64, 0, g).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), gutterMat, 1.94, 1.5, 1.2, g);
  // front porch: stoop + posts + shed roof
  mesh(rbox(2.0, 0.18, 0.75, 0.03), PBR(0x8a8f9a, { map: stone, roughness: 0.9 }), 0, 0.44, 1.5, g);
  for (const px of [-0.85, 0.85]) mesh(rbox(0.13, 1.9, 0.13, 0.02), beamMat, px, 1.4, 1.8, g);
  mesh(rbox(2.1, 0.12, 0.9, 0.02), beamMat, 0, 2.38, 1.55, g);
  const porchRoof = mesh(rbox(2.2, 0.07, 1.0, 0.02), PBR(0xa8402f, { map: roofT, roughness: 0.8 }), 0, 2.52, 1.5, g);
  porchRoof.rotation.x = 0.18;
  if (detail > 0) {
    // bushes: noise-displaced spheres with foliage texture
    const fol = foliageTexture();
    for (const [x, z, s] of [[-1.9, 0.9, 0.55], [1.9, 0.9, 0.7], [2.2, -0.7, 0.5]]) {
      mesh(displaceGeo(new THREE.SphereGeometry(s, 20, 16), fbm, s * 0.16, 2.2, x * 3),
        PBR(0x3d7a35, { map: fol, roughness: 0.95 }), x, s * 0.8, z, g);
    }
    // climbing vine on the left corner
    mesh(taperedTube([[-1.35, 0.4, 1.0], [-1.38, 1.4, 1.05], [-1.3, 2.4, 1.0]], t => 0.05 - t * 0.02, 8, 6), PBR(0x2f5a27, { roughness: 0.9 }), 0, 0, 0, g);
    for (let i = 0; i < 6; i++)
      mesh(displaceGeo(new THREE.SphereGeometry(0.14, 10, 8), fbm, 0.03, 3, i * 11),
        PBR(0x4a8f43, { map: fol, roughness: 0.95 }), -1.38 + rr(rng, -0.15, 0.15), 0.6 + i * 0.32, 1.05 + rr(rng, -0.1, 0.1), g);
    // path stones (clear of the porch)
    for (let i = 0; i < 2; i++)
      mesh(smoothGeo(new THREE.CylinderGeometry(0.32, 0.36, 0.07, 9)),
        PBR(0x9aa0ad, { roughness: 0.95 }), (rng() - 0.5) * 0.3, 0.4, 2.2 + i * 0.6, g);
  }
}

function buildCastle(g, M, rng, detail, fbm) {
  const stone = stoneTexture(); stone.repeat.set(2, 2);
  const wallMat = PBR(0x9aa0ad, { map: stone, bumpMap: stone, bumpScale: 0.4, roughness: 0.9 });
  const roofMat = PBR(0x37477a, { roughness: 0.6, metalness: 0.2 });
  // keep: tapered main mass with crenellations
  const keep = mesh(smoothGeo(new THREE.CylinderGeometry(1.75, 1.95, 2.4, 8)), wallMat, 0, 1.55, 0, g);
  void keep;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    mesh(rbox(0.34, 0.4, 0.34, 0.04), wallMat, Math.cos(a) * 1.7, 2.95, Math.sin(a) * 1.7, g);
  }
  // corner towers: battered (tapered) + conical shingle roofs + finials
  for (const [x, z] of [[-2.1, 1.3], [2.1, 1.3], [-2.1, -1.3], [2.1, -1.3]]) {
    mesh(smoothGeo(new THREE.CylinderGeometry(0.62, 0.78, 3.8, 16)), wallMat, x, 2.2, z, g);
    mesh(new THREE.TorusGeometry(0.66, 0.07, 10, 20), wallMat, x, 3.9, z, g).rotation.x = Math.PI / 2;
    mesh(smoothGeo(new THREE.ConeGeometry(0.85, 1.3, 16)), roofMat, x, 4.8, z, g);
    mesh(new THREE.SphereGeometry(0.12, 10, 8), M.accent, x, 5.55, z, g);
  }
  // arched gate: dark recess + stone surround + portcullis slats
  mesh(rbox(1.0, 1.6, 0.18, 0.05), PBR(0x14101c, { roughness: 0.9 }), 0, 1.15, 1.86, g);
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.07, 1.5, 0.05), PBR(0x2a2f3a, { metalness: 0.7, roughness: 0.5 }), -0.36 + i * 0.18, 1.15, 1.95, g);
  // slit windows with warm light
  const slitMat = PBR(0xffd98a, { emissive: 0xff9e00, emissiveIntensity: 1.1, roughness: 0.4 });
  for (let i = 0; i < (detail === 2 ? 6 : 4); i++) {
    const a = (i / 6) * Math.PI * 2;
    mesh(rbox(0.14, 0.5, 0.1, 0.03), slitMat, Math.cos(a) * 1.86, 2.1, Math.sin(a) * 1.86, g);
  }
  // waving banner
  const bGeo = new THREE.PlaneGeometry(0.85, 0.55, 12, 6);
  const bp = bGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    bp.setZ(i, Math.sin(x * 6) * 0.09 * (x + 0.425));
  }
  bGeo.computeVertexNormals();
  const banner = mesh(bGeo, PBR(0xb51f2e, { side: THREE.DoubleSide, roughness: 0.8 }), 0, 4.4, 0.6, g);
  banner.rotation.y = 0.2;
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 8), M.dark, -0.45, 4.6, 0.55, g);
}

function buildTree(g, M, rng, detail, fbm, x = 0, z = 0, s = 1) {
  const bark = barkTexture(); bark.repeat.set(2, 2);
  const trunkGeo = displaceGeo(new THREE.CylinderGeometry(0.16 * s, 0.3 * s, 1.6 * s, 10, 4), fbm, 0.05 * s, 2.5, x * 7 + z);
  mesh(trunkGeo, PBR(0x5a4028, { map: bark, bumpMap: bark, bumpScale: 0.5, roughness: 0.95 }), x, 1.1 * s, z, g);
  // roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const root = mesh(taperedTube([[x, 0.45 * s, z], [x + Math.cos(a) * 0.4 * s, 0.25 * s, z + Math.sin(a) * 0.4 * s]], t => 0.09 * s * (1 - t * 0.7), 6, 7),
      PBR(0x4a3521, { roughness: 0.95 }), 0, 0, 0, g);
    void root;
  }
  // canopy: clustered noise blobs with per-vertex color variation
  const fol = foliageTexture();
  const blobs = detail === 0 ? 3 : 5;
  for (let i = 0; i < blobs; i++) {
    const bs = s * rr(rng, 0.55, 0.9);
    const geo = displaceGeo(new THREE.IcosahedronGeometry(bs, 3), fbm, bs * 0.22, 1.8, i * 13 + x);
    const shade = 0.85 + rng() * 0.3;
    const col = new THREE.Color(M.primary.color).multiplyScalar(shade);
    const cnt = geo.attributes.position.count, carr = new Float32Array(cnt * 3);
    for (let k = 0; k < cnt; k++) { carr[k * 3] = col.r; carr[k * 3 + 1] = col.g; carr[k * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(carr, 3));
    mesh(geo, PBR(0xffffff, { map: fol, vertexColors: true, roughness: 0.95 }),
      x + rr(rng, -0.5, 0.5) * s, (2.1 + i * 0.42) * s, z + rr(rng, -0.5, 0.5) * s, g);
  }
}
function buildTrees(g, M, rng, detail, fbm) {
  const n = detail === 0 ? 3 : detail === 1 ? 5 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr(rng, -0.3, 0.3);
    const r = rr(rng, 1.1, 2.3);
    buildTree(g, M, rng, detail, fbm, Math.cos(a) * r, Math.sin(a) * r, rr(rng, 0.6, 1.15));
  }
}

function buildMushrooms(g, M, rng, detail, fbm) {
  const n = detail === 0 ? 3 : detail === 1 ? 5 : 7;
  const stemMat = PBR(0xf3ead5, { roughness: 0.7, bumpScale: 0.2, bumpMap: brushedTexture() });
  for (let i = 0; i < n; i++) {
    const x = rr(rng, -1.9, 1.9), z = rr(rng, -1.9, 1.9), s = rr(rng, 0.45, 1.25);
    // curved lathe stem (not a straight cylinder)
    const stem = mesh(lathe([[0.001, 0], [0.24 * s, 0.02], [0.18 * s, 0.5 * s], [0.22 * s, 0.95 * s], [0.3 * s, 1.05 * s]], 20), stemMat, x, 0.35, z, g);
    stem.rotation.z = rr(rng, -0.1, 0.1);
    // dome cap: lathe with rolled rim + noise
    const capGeo = displaceGeo(lathe([[0.001, 0.62 * s], [0.4 * s, 0.58 * s], [0.68 * s, 0.4 * s], [0.78 * s, 0.12 * s], [0.72 * s, 0.02 * s]], 28), fbm, 0.03 * s, 3, i * 5);
    mesh(capGeo, PBR(i % 2 ? 0xc23b2e : M.primary.color, { roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3 }), x, 1.32 * s, z, g);
    // gills
    mesh(smoothGeo(new THREE.CylinderGeometry(0.55 * s, 0.4 * s, 0.1 * s, 20)), PBR(0xe8d9b8, { roughness: 0.85 }), x, 1.32 * s, z, g);
    // spots hug the dome
    for (let d = 0; d < 5; d++) {
      const a = rng() * Math.PI * 2, e = rr(rng, 0.15, 0.75);
      const sx = x + Math.cos(a) * Math.sin(e) * 0.68 * s, sz = z + Math.sin(a) * Math.sin(e) * 0.68 * s;
      const sy = 1.32 * s + Math.cos(e) * 0.6 * s + 0.03;
      const spot = mesh(new THREE.SphereGeometry(rr(rng, 0.05, 0.1) * s, 10, 8), PBR(0xffffff, { roughness: 0.5 }), sx, sy, sz, g);
      spot.scale.y = 0.45;
    }
  }
  // grass blades + pebbles
  for (let i = 0; i < 14; i++) {
    const blade = mesh(smoothGeo(new THREE.ConeGeometry(0.03, rr(rng, 0.25, 0.5), 5)),
      PBR(0x4a8f43, { roughness: 0.9 }), rr(rng, -2.4, 2.4), 0.5, rr(rng, -2.4, 2.4), g);
    blade.rotation.set(rr(rng, -0.3, 0.3), 0, rr(rng, -0.3, 0.3));
  }
}

function buildCar(g, M, rng, detail, fbm) {
  void fbm; void rng;
  const paintMat = PBR(M.primary.color, { metalness: 0.3, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.5 });
  const glassMat = PBR(0x0e141f, { metalness: 0.9, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.7 });
  const trimMat = PBR(0x14161c, { metalness: 0.4, roughness: 0.5 });
  // body: lower, wider extruded silhouette with full bevel
  const s = new THREE.Shape();
  s.moveTo(-1.78, 0.12);
  s.quadraticCurveTo(-1.85, 0.5, -1.4, 0.58);
  s.quadraticCurveTo(-0.95, 0.6, -0.6, 0.92);
  s.quadraticCurveTo(-0.25, 1.12, 0.3, 1.08);
  s.quadraticCurveTo(0.9, 1.02, 1.25, 0.62);
  s.quadraticCurveTo(1.68, 0.52, 1.78, 0.32);
  s.quadraticCurveTo(1.8, 0.12, 1.55, 0.1);
  s.lineTo(-1.78, 0.12);
  const bodyGeo = smoothGeo(new THREE.ExtrudeGeometry(s, { depth: 1.24, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.2, bevelSegments: 5, curveSegments: 24 }));
  bodyGeo.translate(0, 0.35, -0.62);
  mesh(bodyGeo, paintMat, 0, 0, 0, g);
  // greenhouse glass inlay
  const gs = new THREE.Shape();
  gs.moveTo(-0.88, 0.56); gs.quadraticCurveTo(-0.52, 0.88, -0.18, 1.02);
  gs.quadraticCurveTo(0.28, 0.99, 0.82, 0.6); gs.quadraticCurveTo(0.05, 0.54, -0.88, 0.56);
  const glassGeo = new THREE.ExtrudeGeometry(gs, { depth: 1.06, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 16 });
  glassGeo.translate(0, 0.38, -0.53);
  mesh(glassGeo, glassMat, 0, 0, 0, g);
  // wheels: bigger low-profile + fender flares + arch liners + aero
  const tirePts = [[0.32, -0.17], [0.46, -0.17], [0.5, 0], [0.46, 0.17], [0.32, 0.17], [0.3, 0], [0.32, -0.17]];
  const wheelXZ = [[-1.15, 0.74], [1.15, 0.74], [-1.15, -0.74], [1.15, -0.74]];
  for (const [x, z] of wheelXZ) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.5, z); g.add(wheel);
    const tire = mesh(lathe(tirePts, 30), PBR(0x141414, { roughness: 0.92 }), 0, 0, 0, wheel);
    tire.rotation.x = Math.PI / 2;
    // brake disc + red caliper behind spokes
    mesh(smoothGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24)), PBR(0x777d88, { metalness: 0.9, roughness: 0.35 }), 0, 0, 0, wheel).rotation.x = Math.PI / 2;
    mesh(rbox(0.12, 0.2, 0.12, 0.03), PBR(0xc21313, { roughness: 0.4 }), 0.18, 0.1, 0, wheel);
    const rimM = mesh(smoothGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 24)), PBR(0xd4d8e0, { metalness: 0.95, roughness: 0.22 }), 0, 0, z > 0 ? 0.1 : -0.1, wheel);
    rimM.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const off of [-0.06, 0.06]) {
        const spoke = mesh(rbox(0.07, 0.26, 0.1, 0.02), PBR(0x2b2f38, { metalness: 0.85, roughness: 0.35 }), Math.cos(a + off) * 0.16, Math.sin(a + off) * 0.16, z > 0 ? 0.18 : -0.18, wheel);
        spoke.rotation.z = a + off;
      }
    }
    mesh(smoothGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12)), trimMat, 0, 0, z > 0 ? 0.18 : -0.18, wheel).rotation.x = Math.PI / 2;
    // arch liner (dark) + flared lip (paint) hugging the tire
    const sz = z > 0 ? 1 : -1;
    const liner = mesh(new THREE.TorusGeometry(0.56, 0.1, 10, 24, Math.PI), trimMat, x, 0.5, z - sz * 0.06, g);
    void liner;
    mesh(new THREE.TorusGeometry(0.62, 0.09, 10, 24, Math.PI), paintMat, x, 0.5, z + sz * 0.12, g);
  }
  // side skirts + front splitter + rear diffuser
  for (const sz of [-1, 1]) {
    mesh(rbox(1.7, 0.12, 0.1, 0.03), trimMat, 0, 0.3, sz * 0.82, g);
    // door seam + flush handle
    mesh(rbox(0.025, 0.42, 0.012, 0.005), trimMat, -0.15, 0.75, sz * 0.845, g);
    mesh(rbox(0.025, 0.4, 0.012, 0.005), trimMat, -1.0, 0.72, sz * 0.83, g);
    mesh(rbox(0.16, 0.035, 0.03, 0.01), trimMat, -0.35, 0.92, sz * 0.85, g);
    // mirror on slim stalk
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), trimMat, 0.5, 1.0, sz * 0.86, g).rotation.x = sz * 1.1;
    mesh(rbox(0.18, 0.12, 0.1, 0.04), paintMat, 0.5, 1.1, sz * 0.95, g);
  }
  mesh(rbox(0.4, 0.07, 1.75, 0.02), trimMat, 1.68, 0.26, 0, g);
  mesh(rbox(0.3, 0.16, 1.5, 0.03), trimMat, -1.78, 0.32, 0, g);
  for (let i = -1; i <= 1; i++) mesh(rbox(0.28, 0.14, 0.05, 0.01), paintMat, -1.78, 0.3, i * 0.4, g);
  // swept headlights + DRL blades + tail bar
  const lensMat = PBR(0xeaf4ff, { emissive: 0xbfe0ff, emissiveIntensity: 0.7, roughness: 0.08, clearcoat: 1 });
  for (const sz of [-1, 1]) {
    const lens = mesh(smoothGeo(new THREE.SphereGeometry(0.15, 16, 12)), lensMat, 1.74, 0.68, sz * 0.45, g);
    lens.scale.set(0.55, 0.55, 1.3);
    lens.rotation.y = sz * -0.35;
    mesh(rbox(0.04, 0.05, 0.42, 0.015), PBR(0xffffff, { emissive: 0xd6f4ff, emissiveIntensity: 1.6 }), 1.76, 0.58, sz * 0.45, g).rotation.y = sz * -0.35;
  }
  mesh(rbox(0.05, 0.1, 1.15, 0.02), PBR(0xaa1111, { emissive: 0xff2222, emissiveIntensity: 1.0 }), -1.86, 0.72, 0, g);
  // wing spoiler on pylons
  for (const sz of [-1, 1]) mesh(rbox(0.22, 0.22, 0.07, 0.02), trimMat, -1.62, 1.02, sz * 0.4, g);
  mesh(rbox(0.34, 0.05, 1.25, 0.02), paintMat, -1.64, 1.16, 0, g);
  if (detail > 1) {
    // hood crease lines
    for (const sz of [-1, 1]) mesh(rbox(0.7, 0.015, 0.02, 0.005), trimMat, 1.1, 0.94, sz * 0.3, g);
  }
}

function buildRocket(g, M, rng, detail, fbm) {
  void rng;
  const hullMat = PBR(0xe8ecf2, { metalness: 0.55, roughness: 0.3, clearcoat: 0.6, bumpMap: brushedTexture(), bumpScale: 0.1 });
  const accentMat = PBR(M.primary.color, { metalness: 0.4, roughness: 0.35, clearcoat: 0.8 });
  // fuselage: single smooth lathe from tail to ogive nose — zero primitive seams
  const fus = mesh(lathe([
    [0.001, 0], [0.55, 0.0], [0.68, 0.25], [0.7, 1.2], [0.66, 2.1],
    [0.52, 2.75], [0.3, 3.2], [0.1, 3.5], [0.001, 3.58],
  ], 48), hullMat, 0, 0.5, 0, g);
  void fus;
  // panel rings + rivet row
  for (const y of [1.1, 1.9, 2.5]) mesh(new THREE.TorusGeometry(0.695 - (y - 1) * 0.03, 0.02, 8, 48), accentMat, 0, 0.5 + y, 0, g).rotation.x = Math.PI / 2;
  // window: recessed frame ring + convex glass
  mesh(new THREE.TorusGeometry(0.3, 0.055, 12, 32), accentMat, 0, 2.9, 0.52, g);
  const win = mesh(smoothGeo(new THREE.SphereGeometry(0.29, 24, 16, 0, Math.PI * 2, 0, 0.9)), PBR(0x9fd8ff, { metalness: 0.9, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.8 }), 0, 2.72, 0.5, g);
  win.rotation.x = 1.15;
  // engine bell: flared lathe, dark alloy + glowing throat
  mesh(lathe([[0.3, 0.55], [0.34, 0.35], [0.45, 0.12], [0.52, -0.1]], 32), PBR(0x2a2d34, { metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }), 0, 0.5, 0, g);
  mesh(smoothGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 20)), PBR(0xff7b00, { emissive: 0xff5400, emissiveIntensity: 2.4 }), 0, 0.62, 0, g);
  const flameGeo = displaceGeo(new THREE.ConeGeometry(0.32, 1.3, 20, 6), makeNoise(4), 0.05, 2.5, 0);
  const flame = mesh(flameGeo, PBR(0xffb703, { emissive: 0xff6d00, emissiveIntensity: 2.2, transparent: true, opacity: 0.92 }), 0, -0.35, 0, g);
  flame.rotation.x = Math.PI;
  flame.userData.flicker = true;
  const pl = new THREE.PointLight(0xff8c00, 20, 9); pl.position.set(0, 0.2, 0); g.add(pl);
  // fins: airfoil-ish extruded rounded shape, swept
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.quadraticCurveTo(0.55, -0.15, 0.75, -1.0);
  finShape.quadraticCurveTo(0.4, -0.9, 0.1, -0.85); finShape.closePath();
  const finGeo = smoothGeo(new THREE.ExtrudeGeometry(finShape, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 12 }));
  finGeo.translate(0, 0, -0.045);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = mesh(finGeo, accentMat, Math.cos(a) * 0.62, 1.5, Math.sin(a) * 0.62, g);
    fin.rotation.y = -a + Math.PI / 2;
  }
  if (detail > 0) {
    // escape tower needle
    mesh(smoothGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8)), accentMat, 0, 4.35, 0, g);
    mesh(new THREE.SphereGeometry(0.06, 10, 8), accentMat, 0, 4.72, 0, g);
  }
  void detail; void fbm;
}

function buildRobot(g, M, rng, detail, fbm) {
  void rng; void fbm;
  const armor = PBR(M.primary.color, { metalness: 0.65, roughness: 0.32, clearcoat: 0.7, bumpMap: brushedTexture(), bumpScale: 0.08 });
  const joint = PBR(0x23262e, { metalness: 0.8, roughness: 0.45 });
  const glowMat = PBR(0x66f6ff, { emissive: 0x22d3ee, emissiveIntensity: 1.8, roughness: 0.2 });
  // torso: slimmer armor shell + chest glass + glowing core + panel lines + backpack
  mesh(rbox(1.3, 1.7, 0.95, 0.2, 4), armor, 0, 2.0, 0, g);
  mesh(rbox(1.0, 0.66, 0.12, 0.05), PBR(0x0b1226, { metalness: 0.6, roughness: 0.15, clearcoat: 1 }), 0, 2.25, 0.47, g);
  mesh(rbox(0.62, 0.26, 0.06, 0.03), glowMat, 0, 2.25, 0.52, g);
  mesh(new THREE.TorusGeometry(0.16, 0.045, 10, 24), glowMat, 0, 1.7, 0.49, g);
  mesh(smoothGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20)), joint, 0, 1.7, 0.48, g).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) mesh(rbox(0.44, 0.045, 0.04, 0.01), joint, 0, 1.32 + i * 0.11, 0.49, g);
  for (const sx of [-1, 1]) mesh(rbox(0.04, 1.2, 0.5, 0.01), joint, sx * 0.64, 2.0, 0, g); // side panel seams
  mesh(rbox(0.9, 1.1, 0.35, 0.1), joint, 0, 2.05, -0.6, g); // backpack unit
  mesh(smoothGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 14)), armor, -0.25, 2.1, -0.82, g);
  mesh(smoothGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 14)), armor, 0.25, 2.1, -0.82, g);
  // pelvis + legs: slim thighs, knee joints, shin guards, heeled feet
  mesh(rbox(0.9, 0.45, 0.65, 0.14), joint, 0, 1.0, 0, g);
  for (const s of [-1, 1]) {
    mesh(smoothGeo(new THREE.CapsuleGeometry(0.2, 0.55, 6, 14)), armor, s * 0.34, 0.85, 0, g);
    mesh(new THREE.SphereGeometry(0.17, 16, 12), joint, s * 0.34, 0.48, 0.08, g);
    mesh(rbox(0.3, 0.42, 0.36, 0.09), armor, s * 0.34, 0.16, 0.04, g);
    mesh(rbox(0.3, 0.1, 0.5, 0.04), joint, s * 0.34, 0.02, 0.1, g); // foot + heel
    // arms: shoulder pads, slim upper arm, guarded forearm, 3-finger hand
    const pad = mesh(displaceGeo(new THREE.SphereGeometry(0.3, 18, 14), makeNoise(12), 0.02, 3, s), armor, s * 1.0, 2.72, 0, g);
    pad.scale.set(1, 0.75, 1);
    mesh(new THREE.SphereGeometry(0.17, 16, 12), joint, s * 0.98, 2.5, 0, g);
    const arm = mesh(smoothGeo(new THREE.CapsuleGeometry(0.15, 0.55, 6, 14)), armor, s * 1.0, 2.05, 0, g);
    arm.rotation.z = s * -0.1;
    mesh(rbox(0.26, 0.45, 0.28, 0.08), armor, s * 1.02, 1.5, 0, g); // forearm guard
    mesh(new THREE.SphereGeometry(0.13, 14, 12), joint, s * 1.02, 1.2, 0, g);
    for (let f = -1; f <= 1; f++)
      mesh(smoothGeo(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8)), joint, s * 1.02 + f * 0.08, 1.02, 0.05, g);
  }
  // neck + head: smooth dome + wide curved visor + ear discs + antenna
  mesh(smoothGeo(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 16)), joint, 0, 3.0, 0, g);
  const head = mesh(displaceGeo(new THREE.SphereGeometry(0.58, 32, 24), makeNoise(11), 0.02, 3, 0), armor, 0, 3.5, 0, g);
  head.scale.set(1, 0.88, 1);
  mesh(new THREE.CylinderGeometry(0.51, 0.54, 0.2, 24, 1, false, -0.7, 1.4), PBR(0x05070d, { metalness: 0.7, roughness: 0.1, clearcoat: 1 }), 0, 3.55, 0.17, g);
  mesh(rbox(0.66, 0.14, 0.1, 0.05), glowMat, 0, 3.57, 0.58, g);
  for (const s of [-1, 1]) mesh(smoothGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16)), joint, s * 0.58, 3.5, 0, g).rotation.z = Math.PI / 2;
  mesh(taperedTube([[0, 4.0, -0.1], [0, 4.3, -0.25], [0, 4.5, -0.2]], t => 0.045 * (1 - t * 0.4), 10, 8), joint, 0, 0, 0, g);
  mesh(new THREE.SphereGeometry(0.09, 12, 10), M.accent, 0, 4.53, -0.2, g);
  if (detail > 0) {
    mesh(rbox(0.34, 0.2, 0.06, 0.02), M.accent, -0.45, 1.95, 0.52, g);
    mesh(smoothGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16)), glowMat, 0.45, 1.95, 0.53, g).rotation.x = Math.PI / 2;
  }
}

function buildChair(g, M, rng, detail, fbm) {
  void rng; void fbm;
  const wood = woodTexture(); wood.repeat.set(1, 1);
  const woodMat = PBR(0x7a5230, { map: wood, roughness: 0.55, clearcoat: 0.3 });
  const fabric = PBR(M.accent.color, { roughness: 0.95, bumpMap: foliageTexture(), bumpScale: 0.1 });
  mesh(rbox(1.4, 0.14, 1.35, 0.05), woodMat, 0, 1.12, 0, g);
  mesh(rbox(1.15, 0.16, 1.1, 0.07), fabric, 0, 1.26, 0, g);
  // backrest: bent slats (curved via cylinder segments) + top rail
  for (let i = 0; i < 3; i++) {
    const slat = mesh(rbox(0.16, 1.25, 0.07, 0.03), woodMat, -0.4 + i * 0.4, 1.95, -0.68, g);
    slat.rotation.x = -0.1;
  }
  const rail = mesh(rbox(1.3, 0.22, 0.12, 0.05), woodMat, 0, 2.62, -0.75, g);
  rail.rotation.x = -0.1;
  // tapered legs with stretchers
  for (const [x, z] of [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.55], [0.6, 0.55]])
    mesh(taperedTube([[x, 1.05, z], [x * 1.05, 0.4, z * 1.05]], () => 0.06, 4, 8), woodMat, 0, 0, 0, g);
  for (const z of [-0.58, 0.58]) mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8), woodMat, 0, 0.45, z, g).rotation.z = Math.PI / 2;
  void detail;
}

function buildLamp(g, M, rng, detail, fbm) {
  void rng; void detail; void fbm;
  const metal = PBR(0x2e3340, { metalness: 0.85, roughness: 0.35 });
  mesh(lathe([[0.001, 0.35], [0.5, 0.35], [0.55, 0.42], [0.3, 0.5], [0.12, 0.55]], 32), metal, 0, 0, 0, g);
  mesh(taperedTube([[0, 0.5, 0], [0.05, 1.5, 0], [0, 2.5, 0]], t => 0.07 - t * 0.02, 16, 10), metal, 0, 0, 0, g);
  // shade: flared lathe, double wall
  const shade = mesh(lathe([[0.18, 2.55], [0.35, 2.6], [0.62, 3.0], [0.78, 3.35]], 36),
    PBR(M.primary.color, { roughness: 0.4, metalness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide }), 0, 0, 0, g);
  void shade;
  const bulb = mesh(new THREE.SphereGeometry(0.22, 20, 16), PBR(0xfff3b0, { emissive: 0xffd60a, emissiveIntensity: 2.6 }), 0, 2.75, 0, g);
  bulb.userData.glow = true;
  const pl = new THREE.PointLight(0xffd60a, 14, 9); pl.position.set(0, 2.7, 0); g.add(pl);
}

/* crystals stay faceted (correct for gems) but get real transmission + matrix rock */
function buildCrystals(g, M, rng, detail, fbm, cx = 0, cz = 0, big = false) {
  const rockR = big ? 1.7 : 0.55;
  const rockGeo = displaceGeo(new THREE.DodecahedronGeometry(rockR, 2), fbm, rockR * 0.15, 1.6, 3);
  mesh(rockGeo, PBR(0x4a4458, { roughness: 0.95, flatShading: true }), cx, big ? 0.3 : 0.15, cz, g);
  const spread = big ? 1.4 : 0.45;
  const n = detail === 0 ? 5 : detail === 1 ? 8 : 12;
  for (let i = 0; i < n; i++) {
    const x = cx + rr(rng, -spread, spread), z = cz + rr(rng, -spread, spread);
    const h = rr(rng, 0.5, (detail === 2 ? 2.2 : 1.5) * (big ? 1 : 0.55)), r = rr(rng, 0.12, 0.3) * (big ? 1 : 0.7);
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(r, h / 2, r);
    const c = mesh(geo, i % 3 === 0 ? M.secondary : M.primary, x, (big ? 0.5 : 0.25) + h / 2.4, z, g);
    c.rotation.set(rr(rng, -0.22, 0.22), rng() * 3, rr(rng, -0.22, 0.22));
    // tiny glow shard
    if (i % 4 === 0) {
      const s = mesh(new THREE.OctahedronGeometry(0.09, 0), M.accent, x + r, 0.75, z, g);
      s.userData.glow = true;
    }
  }
}

function buildDragon(g, M, rng, detail, fbm) {
  const scaleBump = scaleTexture(); scaleBump.repeat.set(4, 4);
  const skin = PBR(M.primary.color, { roughness: 0.5, clearcoat: 0.35, bumpMap: scaleBump, bumpScale: 0.35 });
  const belly = PBR(0xe8d9b0, { roughness: 0.6 });
  const memMat = PBR(M.secondary.color, { roughness: 0.55, side: THREE.DoubleSide });
  // torso: sculpted noise-displaced spheroid, never a plain sphere
  const torsoGeo = displaceGeo(new THREE.SphereGeometry(0.95, 36, 28), fbm, 0.09, 1.6, 7);
  const torso = mesh(torsoGeo, skin, -0.1, 1.95, 0, g);
  torso.scale.set(1.6, 1.04, 1.0);
  const bellyM = mesh(displaceGeo(new THREE.SphereGeometry(0.8, 28, 20), fbm, 0.05, 2, 8), belly, 0.0, 1.66, 0, g);
  bellyM.scale.set(1.55, 0.82, 0.9);
  // neck: long tapered S-curve rising into a high-held head
  mesh(taperedTube([[1.15, 2.1, 0], [1.8, 2.55, 0], [2.05, 3.25, 0], [2.12, 3.75, 0]], t => 0.44 - t * 0.2, 24, 14), skin, 0, 0, 0, g);
  const skullGeo = displaceGeo(new THREE.SphereGeometry(0.44, 28, 22), fbm, 0.035, 3, 9);
  mesh(skullGeo, skin, 2.18, 3.92, 0, g);
  // snout: rounded box blended + jaw + nostrils + teeth
  const snout = mesh(rbox(0.58, 0.36, 0.44, 0.13, 3), skin, 2.58, 3.84, 0, g);
  void snout;
  mesh(rbox(0.42, 0.1, 0.36, 0.04), belly, 2.52, 3.62, 0, g);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.04, 8, 8), PBR(0x1a0d05, { roughness: 0.6 }), 2.82, 3.93, s * 0.15, g);
    // brow ridge over glowing eye
    mesh(rbox(0.22, 0.09, 0.14, 0.03), skin, 2.24, 4.1, s * 0.28, g).rotation.y = s * 0.3;
    const eye = mesh(new THREE.SphereGeometry(0.095, 14, 12), PBR(0xffcf3f, { emissive: 0xff5d00, emissiveIntensity: 1.6, roughness: 0.15 }), 2.24, 4.0, s * 0.31, g);
    eye.userData.glow = true;
    // long swept horns (tapered curved tubes, not spikes)
    mesh(taperedTube([[2.05, 4.12, s * 0.16], [1.75, 4.5, s * 0.3], [1.35, 4.68, s * 0.34]], t => 0.1 - t * 0.07, 12, 8), belly, 0, 0, 0, g);
    const fang = mesh(smoothGeo(new THREE.ConeGeometry(0.04, 0.16, 8)), belly, 2.72, 3.6, s * 0.13, g);
    fang.rotation.x = Math.PI;
  }
  // dorsal plates: flattened, swept-back, running neck → tail
  const platePos = [[0.9, 3.0], [0.45, 2.86], [0.0, 2.8], [-0.5, 2.72], [-1.0, 2.6], [1.35, 3.3], [1.7, 3.62]];
  for (const [px, py] of platePos) {
    const spike = mesh(smoothGeo(new THREE.ConeGeometry(0.12, 0.44, 6)), M.accent, px, py, 0, g);
    spike.rotation.z = 0.55;
    spike.scale.z = 0.4;
  }
  // wings: large raised membranes with vein structure + thumb claw
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(-0.2, 3.1, s * 0.55);
    wing.rotation.set(s * -0.55, 0.15, 0.5);
    g.add(wing);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.quadraticCurveTo(1.1, 0.75, 2.9, 0.45);
    sh.quadraticCurveTo(2.4, 0.1, 2.2, -0.35);
    sh.quadraticCurveTo(1.8, -0.2, 1.6, -0.7);
    sh.quadraticCurveTo(1.2, -0.55, 1.0, -1.05);
    sh.quadraticCurveTo(0.5, -0.75, 0, -0.85);
    sh.closePath();
    const wgeo = new THREE.ShapeGeometry(sh, 14);
    const wp = wgeo.attributes.position;
    for (let i = 0; i < wp.count; i++) wp.setZ(i, Math.sin(wp.getX(i) * 1.8) * 0.11 - wp.getY(i) * 0.14);
    wgeo.computeVertexNormals();
    const wmesh = new THREE.Mesh(wgeo, memMat);
    wmesh.castShadow = true; wmesh.receiveShadow = true;
    wing.add(wmesh);
    // finger struts from shoulder to each scallop tip
    const tips = [[2.9, 0.45], [2.2, -0.35], [1.6, -0.7], [1.0, -1.05]];
    for (const [tx, ty] of tips)
      mesh(taperedTube([[0, 0, 0.01], [tx * 0.55, ty * 0.5, 0.03], [tx, ty, 0]], () => 0.05, 8, 6), skin, 0, 0, 0, wing);
    // thumb claw at the leading apex
    const wc = mesh(smoothGeo(new THREE.ConeGeometry(0.06, 0.24, 8)), belly, 0.35, 0.28, 0, wing);
    wc.rotation.z = -0.9;
  }
  // tail: long tapered curl + spade tip
  mesh(taperedTube([[-1.4, 1.9, 0], [-2.4, 1.75, 0.25], [-3.3, 1.4, -0.15], [-4.1, 1.05, 0.1]], t => 0.38 * (1 - t * 0.86) + 0.03, 26, 12), skin, 0, 0, 0, g);
  const spade = mesh(smoothGeo(new THREE.ConeGeometry(0.3, 0.65, 4)), M.accent, -4.32, 1.0, 0.1, g);
  spade.rotation.z = Math.PI / 2; spade.scale.z = 0.38;
  // legs: digitigrade — thigh → knee → shin → ankle → foot + talons
  for (const [x, z] of [[-0.6, 0.55], [0.7, 0.55], [-0.6, -0.55], [0.7, -0.55]]) {
    mesh(taperedTube([[x, 1.55, z], [x + 0.18, 1.0, z * 1.08]], t => 0.24 - t * 0.08, 8, 10), skin, 0, 0, 0, g);
    mesh(taperedTube([[x + 0.18, 1.0, z * 1.08], [x + 0.02, 0.5, z * 1.18]], t => 0.14 - t * 0.05, 8, 10), skin, 0, 0, 0, g);
    const foot = mesh(rbox(0.34, 0.16, 0.3, 0.06), skin, x + 0.16, 0.42, z * 1.2, g);
    void foot;
    for (let c = 0; c < 3; c++) {
      const claw = mesh(smoothGeo(new THREE.ConeGeometry(0.055, 0.22, 8)), belly, x + 0.3 + (c - 1) * 0.13, 0.4, z * 1.2 + 0.16, g);
      claw.rotation.x = Math.PI / 2.2;
    }
  }
}

function buildCreature(g, M, rng, detail, fbm, kind) {
  const k = (kind || '').toLowerCase();
  const isCat = /cat|fox/.test(k), isDog = /dog|wolf/.test(k);
  const furC = isCat ? 0xd98e4a : isDog ? 0x8a6a4a : M.primary.color;
  const fur = PBR(furC, { roughness: 0.9, bumpMap: foliageTexture(), bumpScale: 0.25 });
  // body: sculpted loaf (displaced + smoothed), chest + haunch volumes
  const bodyGeo = displaceGeo(new THREE.SphereGeometry(0.8, 30, 24), fbm, 0.08, 2, 21);
  const body = mesh(bodyGeo, fur, 0, 1.25, 0, g);
  body.scale.set(1.45, 1, 0.95);
  const chest = mesh(displaceGeo(new THREE.SphereGeometry(0.55, 24, 18), fbm, 0.05, 2.4, 22), fur, 0.85, 1.15, 0, g);
  void chest;
  // head: rounded skull + tapered muzzle + nose + ears (extruded rounded triangles)
  mesh(displaceGeo(new THREE.SphereGeometry(0.48, 28, 22), fbm, 0.04, 2.6, 23), fur, 1.45, 1.75, 0, g);
  const muzzle = mesh(rbox(0.42, 0.3, 0.36, 0.12, 3), PBR(0xe8d5bd, { roughness: 0.8 }), 1.78, 1.6, 0, g);
  void muzzle;
  mesh(new THREE.SphereGeometry(0.07, 10, 8), PBR(0x1c1214, { roughness: 0.4 }), 2.0, 1.66, 0, g);
  const earShape = new THREE.Shape();
  earShape.moveTo(-0.11, 0); earShape.quadraticCurveTo(0, 0.3, 0.11, 0); earShape.closePath();
  const earGeo = smoothGeo(new THREE.ExtrudeGeometry(earShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }));
  for (const s of [-1, 1]) {
    const ear = mesh(earGeo, fur, 1.35, 2.1, s * 0.22, g);
    ear.rotation.x = s * 0.25;
    const eye = mesh(new THREE.SphereGeometry(0.075, 12, 10), PBR(isCat ? 0x7fe03f : 0x5a3010, { roughness: 0.1, clearcoat: 1 }), 1.72, 1.86, s * 0.2, g);
    void eye;
  }
  // legs: tapered tubes + rounded paws
  for (const [x, z] of [[0.7, 0.32], [0.7, -0.32], [-0.6, 0.32], [-0.6, -0.32]]) {
    mesh(taperedTube([[x, 0.95, z], [x, 0.5, z]], () => 0.13, 6, 8), fur, 0, 0, 0, g);
    const paw = mesh(displaceGeo(new THREE.SphereGeometry(0.15, 14, 12), fbm, 0.015, 4, x * 9), fur, x, 0.42, z, g);
    paw.scale.set(1, 0.7, 1.2);
  }
  // tail: curved tapered tube
  mesh(taperedTube([[body.position.x - 1.05, 1.3, 0], [-1.7, 1.5, 0.1], [-2.0, 1.9, 0]], t => 0.12 * (1 - t * 0.7), 12, 8), fur, 0, 0, 0, g);
  void detail;
}

function buildBird(g, M, rng, detail, fbm) {
  const feather = PBR(M.primary.color, { roughness: 0.7, bumpMap: brushedTexture(), bumpScale: 0.15 });
  // body: teardrop lathe (plump breast → tail), smooth single surface
  mesh(lathe([[0.001, -0.9], [0.3, -0.75], [0.5, -0.3], [0.52, 0.2], [0.38, 0.6], [0.001, 0.75]], 32), feather, 0, 2.0, 0, g).rotation.x = 0.5;
  mesh(displaceGeo(new THREE.SphereGeometry(0.32, 24, 18), fbm, 0.025, 3, 31), feather, 0, 2.75, 0.35, g);
  // beak: curved lathe cone
  const beak = mesh(lathe([[0.001, 0], [0.09, 0.02], [0.05, 0.2], [0.001, 0.32]], 16), M.accent, 0, 2.72, 0.68, g);
  beak.rotation.x = Math.PI / 2 - 0.15;
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.055, 10, 8), PBR(0x111111, { roughness: 0.1, clearcoat: 1 }), 0.14, 2.85, 0.5 + s * 0.02, g);
    eye.position.x = s * 0.14;
    // wing: cambered extruded shape hugging the body
    const ws = new THREE.Shape();
    ws.moveTo(0, 0.4); ws.quadraticCurveTo(-0.7, 0.3, -1.1, -0.5);
    ws.quadraticCurveTo(-0.5, -0.4, 0, -0.25); ws.closePath();
    const wgeo = smoothGeo(new THREE.ExtrudeGeometry(ws, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 12 }));
    const w = mesh(wgeo, PBR(M.secondary.color, { roughness: 0.65 }), 0, 2.25, s * 0.42, g);
    w.rotation.y = s * 0.15;
  }
  // tail fan
  for (let i = -2; i <= 2; i++) {
    const f = mesh(rbox(0.12, 0.05, 0.7, 0.02), PBR(M.secondary.color, { roughness: 0.65 }), i * 0.11, 1.35, -0.75, g);
    f.rotation.y = i * 0.14; f.rotation.x = -0.35;
  }
  // legs +7964 perch
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), M.accent, s * 0.15, 1.0, 0.1, g);
    mesh(rbox(0.3, 0.09, 0.12, 0.03), M.dark, s * 0.15, 0.78, 0, g);
  }
  mesh(smoothGeo(new THREE.CylinderGeometry(0.42, 0.5, 0.3, 16)), PBR(0x5a4028, { map: barkTexture(), roughness: 0.95 }), 0, 0.5, 0, g);
  void detail; void rng;
}

function buildSword(g, M, rng, detail, fbm) {
  void rng; void fbm;
  // blade: flattened diamond cross-section extruded with fuller groove
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.09, 0); bladeShape.lineTo(0.09, 0); bladeShape.lineTo(0.05, 1.7); bladeShape.lineTo(0, 1.95); bladeShape.lineTo(-0.05, 1.7); bladeShape.closePath();
  const bladeGeo = smoothGeo(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }));
  bladeGeo.translate(0, 0, -0.0175);
  mesh(bladeGeo, PBR(0xd7dde8, { metalness: 1, roughness: 0.18, envMapIntensity: 1.6 }), 0, 1.35, 0, g);
  mesh(rbox(0.03, 1.5, 0.045, 0.01), PBR(0x8a8f99, { metalness: 0.9, roughness: 0.4 }), 0, 2.05, 0, g);
  // guard: swept crescent (torus arc) + grip wrap + pommel gem
  const guard = mesh(new THREE.TorusGeometry(0.32, 0.07, 12, 32, Math.PI), M.dark, 0, 1.35, 0, g);
  guard.rotation.z = 0;
  const gripMat = PBR(0x3a1f14, { roughness: 0.8, bumpMap: brushedTexture(), bumpScale: 0.2 });
  mesh(smoothGeo(new THREE.CylinderGeometry(0.07, 0.08, 0.55, 14)), gripMat, 0, 1.0, 0, g);
  for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 14), M.accent, 0, 0.82 + i * 0.12, 0, g).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.11, 16, 12), M.dark, 0, 0.68, 0, g);
  const gem = mesh(new THREE.OctahedronGeometry(0.09, 0), M.accent, 0, 0.68, 0.1, g);
  gem.userData.glow = true;
  void detail;
}

function buildFlower(g, M, rng, detail, fbm) {
  // curving stem + leaves
  mesh(taperedTube([[0, 0.35, 0], [0.1, 1.2, 0.05], [0, 2.0, 0]], t => 0.07 - t * 0.03, 12, 8), PBR(0x2f7a2c, { roughness: 0.8 }), 0, 0, 0, g);
  for (const s of [-1, 1]) {
    const ls = new THREE.Shape();
    ls.moveTo(0, 0); ls.quadraticCurveTo(s * 0.5, 0.15, s * 0.7, 0.5); ls.quadraticCurveTo(s * 0.3, 0.4, 0, 0.1); ls.closePath();
    const leaf = mesh(smoothGeo(new THREE.ExtrudeGeometry(ls, { depth: 0.03, bevelEnabled: false, curveSegments: 10 })), PBR(0x3d8f37, { roughness: 0.75, side: THREE.DoubleSide }), 0.05, 1.0, 0, g);
    void leaf;
  }
  // petals: cupped displaced discs arranged in two whorls
  const petalMat = PBR(M.primary.color, { roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide });
  const whorls = detail === 0 ? 1 : 2;
  for (let w = 0; w < whorls; w++) {
    const n = 7 - w, tilt = 0.5 + w * 0.55, rad = 0.34 - w * 0.1, y = 2.35 + w * 0.16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + w * 0.45 + rng() * 0.1;
      const pg = displaceGeo(new THREE.SphereGeometry(0.3, 18, 14), fbm, 0.03, 3, i * 7 + w);
      const p = mesh(pg, petalMat, Math.cos(a) * rad, y, Math.sin(a) * rad, g);
      p.scale.set(1, 0.42, 0.72);
      p.rotation.y = -a + Math.PI / 2;
      p.rotation.x = tilt * 0.5;
    }
  }
  // heart: dome + pollen
  mesh(displaceGeo(new THREE.SphereGeometry(0.26, 20, 16), fbm, 0.03, 4, 51), PBR(0xffc93f, { roughness: 0.6 }), 0, 2.42, 0, g).scale.y = 0.75;
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    mesh(new THREE.SphereGeometry(0.03, 8, 6), PBR(0xff9e00, { emissive: 0xff6d00, emissiveIntensity: 0.4 }), Math.cos(a) * 0.2, 2.6, Math.sin(a) * 0.2, g);
  }
}

function buildTower(g, M, rng, detail, fbm) {
  const stone = stoneTexture(); stone.repeat.set(2, 2);
  const wallMat = PBR(0xb0a58e, { map: stone, bumpMap: stone, bumpScale: 0.35, roughness: 0.9 });
  const tiers = detail === 0 ? 2 : 3;
  for (let i = 0; i < tiers; i++) {
    const w = 1.7 - i * 0.28;
    mesh(rbox(w, 1.35, w, 0.06), wallMat, 0, 1.05 + i * 1.35, 0, g);
    mesh(rbox(w + 0.24, 0.14, w + 0.24, 0.04), PBR(0x6b6252, { roughness: 0.85 }), 0, 1.72 + i * 1.35, 0, g);
  }
  // arched glowing windows per tier
  const winMat = PBR(0xffd98a, { emissive: 0xff9e00, emissiveIntensity: 1.0, roughness: 0.4 });
  for (let i = 0; i < tiers; i++) {
    const y = 1.0 + i * 1.35;
    mesh(rbox(0.26, 0.5, 0.08, 0.06), winMat, 0, y, (1.7 - i * 0.28) / 2 + 0.01, g);
  }
  // hip roof + finial
  const topY = 1.05 + (tiers - 1) * 1.35 + 0.75;
  mesh(smoothGeo(new THREE.ConeGeometry(1.05, 1.0, 4)), PBR(0x37477a, { roughness: 0.6, flatShading: false }), 0, topY + 0.5, 0, g).rotation.y = Math.PI / 4;
  mesh(new THREE.SphereGeometry(0.12, 12, 10), M.accent, 0, topY + 1.1, 0, g);
  // door
  mesh(rbox(0.6, 0.9, 0.12, 0.05), PBR(0x3a2415, { roughness: 0.75 }), 0, 0.8, 0.86, g);
  void rng;
}

function buildSculpture(g, M, rng, detail, fbm, prompt) {
  const seedN = hashStr(prompt || 'dream') % 100;
  const nfbm = makeNoise(seedN);
  const geo = displaceGeo(new THREE.IcosahedronGeometry(1.25, detail === 0 ? 4 : 5), nfbm, 0.34, 1.1, 0);
  const chrome = styleIsMetal(prompt) ? 0.9 : 0.25;
  mesh(geo, PBR(M.primary.color, { metalness: chrome, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.5 }), 0, 2.2, 0, g);
  // polished orbit rings
  const ring1 = mesh(new THREE.TorusGeometry(1.95, 0.08, 16, 96), PBR(0xd7dde8, { metalness: 1, roughness: 0.15 }), 0, 2.2, 0, g);
  ring1.rotation.x = Math.PI / 2 + 0.4;
  const ring2 = mesh(new THREE.TorusGeometry(2.45, 0.045, 12, 96), M.accent, 0, 2.2, 0, g);
  ring2.rotation.x = 0.5;
  ring2.userData.orbit = 0.25;
  const n = detail + 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const orb = mesh(smoothGeo(new THREE.SphereGeometry(rr(rng, 0.1, 0.24), 18, 14)),
      PBR(M.accent.color, { metalness: 0.8, roughness: 0.2 }), Math.cos(a) * 2.45, rr(rng, 1.1, 3.3), Math.sin(a) * 2.45, g);
    orb.userData.orbit = 0.25;
    orb.userData.orbitR = 2.45;
    orb.userData.orbitA = a;
    orb.userData.orbitY = orb.position.y;
  }
  void fbm;
}
function styleIsMetal(prompt) {
  return /metal|chrome|gold|silver|robot|steel/.test((prompt || '').toLowerCase());
}

/* ================= interpreter ================= */
const RULES = [
  [/house|cottage|home|cabin|hut|villa/, 'house', 'cozy house'],
  [/castle|fortress|palace|kingdom/, 'castle', 'castle'],
  [/\btree\b|forest|pine|oak|jungle/, 'trees', 'forest'],
  [/mushroom|shroom|fungi/, 'mushrooms', 'mushroom grove'],
  [/\bcar\b|sports car|vehicle|truck|racer/, 'car', 'car'],
  [/rocket|spaceship|shuttle|launch|satellite|ufo/, 'rocket', 'rocket'],
  [/robot|android|mech|cyborg|droid/, 'robot', 'robot'],
  [/chair|throne|seat|sofa/, 'chair', 'chair'],
  [/lamp|lantern|light|chandelier/, 'lamp', 'lamp'],
  [/dragon/, 'dragon', 'dragon'],
  [/\bbird\b|owl|eagle|parrot|penguin/, 'bird', 'bird'],
  [/fish|shark|whale|dolphin|octopus/, 'fish', 'sea creature'],
  [/cat|dog|wolf|fox|tiger|lion|bear|monster|creature|spider|dino/, 'creature', 'creature'],
  [/sword|knife|blade|dagger|axe/, 'sword', 'sword'],
  [/flower|rose|tulip|blossom|garden/, 'flower', 'flower'],
  [/tower|skyscraper|building|temple|church|lighthouse/, 'tower', 'tower'],
  [/crystal|gem|diamond|emerald|amethyst/, 'crystals', 'crystal cluster'],
  [/island|floating|avatar/, 'island', 'floating island'],
];
function interpret(prompt) {
  const p = prompt.toLowerCase();
  const tags = [];
  let primary = null;
  for (const [re, id, label] of RULES) {
    if (re.test(p)) { tags.push(label); if (!primary && id !== 'island' && id !== 'crystals') primary = id; }
  }
  if (/island|floating/.test(p)) tags.push('floating island');
  if (/crystal|glow|magic|neon/.test(p) && !tags.includes('crystal cluster')) tags.push('glow accents');
  if (!primary) primary = 'sculpture';
  return { primary, tags: [...new Set(tags)].slice(0, 5) };
}

/* ================= title text ================= */
let fontCache = null;
async function loadFont() {
  if (fontCache) return fontCache;
  const loader = new FontLoader();
  fontCache = await loader.loadAsync('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json');
  return fontCache;
}

/* ================= generate ================= */
const $ = id => document.getElementById(id);
let currentMeta = { prompt: '', seed: 7, tris: 0 };
let aiMode = false;

async function generate(prompt, seed, styleOpt, detail, showText) {
  aiMode = false;
  prompt = (prompt || '').trim() || 'a dreamy abstract sculpture';
  const rng = mulberry32(hashStr(prompt + '::' + seed));
  const fbm = makeNoise(hashStr(prompt + seed) % 1000);
  clearModel();
  const pal = paletteFor(prompt);
  let style = styleOpt === 'auto'
    ? (/crystal|gem|diamond|ice/.test(prompt.toLowerCase()) ? 'crystal'
      : /neon|cyber|laser|glow/.test(prompt.toLowerCase()) ? 'neon'
      : /gold|luxury|king/.test(prompt.toLowerCase()) ? 'gold'
      : /low.?poly|voxel|game/.test(prompt.toLowerCase()) ? 'lowpoly' : 'clay')
    : styleOpt;
  const M = styleMats(style, pal.colors, rng, fbm);
  const cw = colorWord(prompt);
  if (cw !== null && style !== 'crystal' && style !== 'neon') {
    M.primary.color.setHex(cw);
    if (pal.name === 'aurora') pal.name = 'custom';
  }
  const { primary, tags } = interpret(prompt);

  const g = new THREE.Group();
  modelRoot.add(g);
  g.add(buildPedestal(M));

  const hasIsland = /island|floating|avatar|dragon/.test(prompt.toLowerCase());
  if (hasIsland) buildFloatingIsland(g, M, rng, detail, fbm);

  const tmp = new THREE.Group();
  const B = (builder, ...args) => builder(tmp, M, rng, detail, fbm, ...args);
  switch (primary) {
    case 'house': B(buildHouse); break;
    case 'castle': B(buildCastle); break;
    case 'trees': B(buildTrees); break;
    case 'mushrooms': B(buildMushrooms); break;
    case 'car': B(buildCar); break;
    case 'rocket': B(buildRocket); break;
    case 'robot': B(buildRobot); break;
    case 'chair': B(buildChair); break;
    case 'lamp': B(buildLamp); break;
    case 'dragon': B(buildDragon); break;
    case 'bird': B(buildBird); break;
    case 'fish': B((gg, MM, rr2, dd, ff) => buildCreature(gg, MM, rr2, dd, ff, 'fish')); break;
    case 'creature': B((gg, MM, rr2, dd, ff) => buildCreature(gg, MM, rr2, dd, ff, prompt.toLowerCase())); break;
    case 'sword': B(buildSword); break;
    case 'flower': B(buildFlower); break;
    case 'tower': B(buildTower); break;
    case 'crystals': B((gg, MM, rr2, dd, ff) => buildCrystals(gg, MM, rr2, dd, ff, 0, 0, true)); break;
    default: B((gg, MM, rr2, dd, ff) => buildSculpture(gg, MM, rr2, dd, ff, prompt));
  }
  if (/crystal|magic|glow|dragon/.test(prompt.toLowerCase()) && primary !== 'crystals')
    buildCrystals(tmp, M, rng, Math.min(detail, 1), fbm, rr(rng, -1.7, 1.7), rr(rng, -1.7, 1.7), false);
  if (/forest|garden|nature|tree/.test(prompt.toLowerCase()) && primary !== 'trees' && detail > 0)
    buildTree(tmp, M, rng, 0, fbm, rr(rng, -2, 2), rr(rng, -2, 2), 0.5);
  // auto-ground: rest the lowest solid point exactly on the stage (no floating / sinking)
  tmp.position.y = 0;
  tmp.updateMatrixWorld(true);
  {
    const gb = new THREE.Box3();
    let has = false;
    tmp.traverse(o => {
      if (o.isMesh && !o.userData.flicker && o.userData.orbit === undefined && !o.userData.noGround) {
        const b = new THREE.Box3().setFromObject(o);
        if (!has) { gb.copy(b); has = true; } else gb.union(b);
      }
    });
    const stageY = hasIsland ? 0.84 : 0.37;
    tmp.position.y = has ? stageY - gb.min.y : (hasIsland ? 0.5 : 0.35);
    const size = has ? gb.getSize(new THREE.Vector3()) : new THREE.Vector3(2, 1, 2);
    const r = Math.min(2.7, Math.max(1.15, Math.max(size.x, size.z) * 0.58));
    blobShadow(tmp, (has ? gb.min.y : 0) + 0.02, r, hasIsland ? 0.42 : 0.5);
  }
  g.add(tmp);

  if (showText) {
    try {
      const font = await loadFont();
      const words = prompt.split(/\s+/).slice(0, 3).join(' ').slice(0, 22);
      const tg = new TextGeometry(words, { font, size: 0.2, height: 0.05, curveSegments: 4 });
      tg.computeBoundingBox();
      const w = tg.boundingBox.max.x - tg.boundingBox.min.x;
      const tm = new THREE.Mesh(tg, PBR(0xffffff, { roughness: 0.35 }));
      tm.position.set(-w / 2, 0.38, 3.0);
      tm.rotation.x = -0.08;
      tm.castShadow = true;
      g.add(tm);
    } catch { /* offline font: skip */ }
  }

  finishGenerate(g, prompt, seed, style, pal, primary, tags, 'procedural');
}

function clearModel() {
  while (modelRoot.children.length) {
    const c = modelRoot.children.pop();
    c.traverse?.(o => { o.geometry?.dispose?.(); });
  }
}
function finishGenerate(g, prompt, seed, style, pal, primary, tags, source) {
  let tris = 0;
  g.traverse(o => {
    if (o.isMesh) {
      const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
      tris += Math.round(n);
    }
  });
  currentMeta = { prompt, seed, tris, style, palette: pal.name, kind: primary };
  $('modelName').textContent = `${primary} · ${pal.name} · seed ${seed}${source === 'ai' ? ' · AI' : ''}`;
  $('modelStats').textContent = `${tris.toLocaleString()} tris`;
  const tagBox = $('tags'); tagBox.innerHTML = '';
  [...tags, source === 'ai' ? 'AI cloud' : style, pal.name + ' palette'].forEach(t => {
    const s = document.createElement('span'); s.textContent = '✦ ' + t; tagBox.appendChild(s);
  });
  const iv = $('interpreted');
  if (iv) iv.textContent = source === 'ai' ? '☁️ generated by Meshy AI cloud' : '✨ auto-detect: ' + (tags.join(' · ') || 'abstract sculpture');
  pushHistory(prompt, seed);
}

/* ================= Meshy cloud AI ================= */
const MESHY_BASE = 'https://api.meshy.ai/openapi/v2/text-to-3d';
async function meshyCreatePreview(prompt, apiKey) {
  const res = await fetch(MESHY_BASE, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview', prompt: prompt.slice(0, 600), target_formats: ['glb'] }),
  });
  if (!res.ok) throw new Error(`Meshy preview request failed (HTTP ${res.status})`);
  const data = await res.json();
  if (!data.result) throw new Error('Meshy returned no task id');
  return data.result;
}
async function meshyCreateRefine(previewId, prompt, apiKey) {
  const res = await fetch(MESHY_BASE, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'refine', preview_task_id: previewId, texture_prompt: prompt.slice(0, 600), enable_pbr: true, target_formats: ['glb'] }),
  });
  if (!res.ok) throw new Error(`Meshy refine request failed (HTTP ${res.status})`);
  const data = await res.json();
  if (!data.result) throw new Error('Meshy returned no refine task id');
  return data.result;
}
async function meshyPoll(taskId, apiKey, onTick) {
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${MESHY_BASE}/${taskId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Meshy status check failed (HTTP ${res.status})`);
    const task = await res.json();
    onTick?.(task);
    if (task.status === 'SUCCEEDED') return task;
    if (task.status === 'FAILED' || task.status === 'CANCELED') throw new Error(task.task_error?.message || `Meshy task ${task.status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Meshy task timed out');
}
async function loadAIUrl(glbUrl) {
  const res = await fetch(glbUrl);
  if (!res.ok) throw new Error(`Model download failed (HTTP ${res.status})`);
  const blob = await res.blob();
  const loader = new GLTFLoader();
  const objUrl = URL.createObjectURL(blob);
  try {
    const gltf = await loader.loadAsync(objUrl);
    return gltf.scene;
  } finally {
    setTimeout(() => URL.revokeObjectURL(objUrl), 8000);
  }
}
function normalizeAIScene(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = 3.4 / maxDim;
  obj.scale.setScalar(s);
  obj.position.sub(center.clone().multiplyScalar(s));
  const g = new THREE.Group();
  obj.position.y -= box.min.y * s - 0.4;
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(obj);
  return g;
}
let aiRunning = false;
async function runAIGenerate() {
  if (aiRunning) return;
  const apiKey = ($('aiKey').value || '').trim();
  const prompt = ($('prompt').value || '').trim();
  const status = $('aiStatus');
  if (!apiKey) { status.textContent = 'Paste your Meshy API key first (free at meshy.ai).'; return; }
  if (!prompt) { status.textContent = 'Type a prompt first.'; return; }
  aiRunning = true;
  $('aiGenerateBtn').disabled = true;
  $('loading').classList.remove('hidden');
  try {
    localStorage.setItem('pf3d-meshy-key', apiKey);
    status.textContent = 'Sending prompt to Meshy AI…';
    $('loadingText').textContent = 'AI: creating preview mesh…';
    const previewId = await meshyCreatePreview(prompt, apiKey);
    status.textContent = `Preview task ${previewId.slice(0, 8)}… generating mesh (~1–3 min)…`;
    const preview = await meshyPoll(previewId, apiKey, t => {
      $('loadingText').textContent = `AI preview ${t.progress ?? 0}%…`;
      status.textContent = `Preview mesh generating… ${t.progress ?? 0}%`;
    });
    void preview;
    status.textContent = 'Mesh ready — texturing (refine)…';
    $('loadingText').textContent = 'AI: texturing model…';
    const refineId = await meshyCreateRefine(previewId, prompt, apiKey);
    const refined = await meshyPoll(refineId, apiKey, t => {
      $('loadingText').textContent = `AI texturing ${t.progress ?? 0}%…`;
      status.textContent = `Texturing… ${t.progress ?? 0}%`;
    });
    const glbUrl = refined.model_urls?.glb;
    if (!glbUrl) throw new Error('Meshy returned no GLB url');
    status.textContent = 'Downloading AI model…';
    const aiScene = await loadAIUrl(glbUrl);
    clearModel();
    const g = new THREE.Group();
    modelRoot.add(g);
    const pal = paletteFor(prompt);
    const M = styleMats('clay', pal.colors, Math.random, makeNoise(1));
    g.add(buildPedestal(M));
    const norm = normalizeAIScene(aiScene);
    norm.position.y += 0.35;
    g.add(norm);
    aiMode = true;
    finishGenerate(g, prompt, Number($('seed').value || 0), 'ai-textured', pal, 'ai model', [prompt.split(/\s+/).slice(0, 3).join(' ')], 'ai');
    status.textContent = 'Done — AI model loaded. Export buttons work on it too.';
  } catch (e) {
    console.error(e);
    status.textContent = 'AI failed: ' + (e.message || e);
  }
  $('loading').classList.add('hidden');
  $('aiGenerateBtn').disabled = false;
  aiRunning = false;
}

/* ================= UI ================= */
function resize() {
  const w = $('viewport').clientWidth, h = $('viewport').clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const STAGES = ['Analyzing prompt…', 'Mixing PBR palette…', 'Sculpting geometry…', 'Painting textures…', 'Polishing & lighting…'];
let generating = false;
async function runGenerate() {
  if (generating) return;
  generating = true;
  const btn = $('generateBtn');
  btn.disabled = true;
  $('loading').classList.remove('hidden');
  const prog = $('progress'); prog.classList.remove('hidden');
  const fill = $('progressFill'), label = $('progressLabel');
  for (let i = 0; i < STAGES.length; i++) {
    label.textContent = STAGES[i];
    $('loadingText').textContent = STAGES[i];
    fill.style.width = `${((i + 1) / (STAGES.length + 1)) * 100}%`;
    await new Promise(r => setTimeout(r, 210));
  }
  try {
    await generate($('prompt').value, Number($('seed').value || 0), $('style').value, Number($('detail').value), $('showText').checked);
    if ($('wireframe').checked) modelRoot.traverse(o => { if (o.isMesh && o.material) o.material.wireframe = true; });
  } catch (e) { console.error(e); label.textContent = 'Something glitched — try again.'; }
  fill.style.width = '100%';
  await new Promise(r => setTimeout(r, 250));
  prog.classList.add('hidden');
  $('loading').classList.add('hidden');
  btn.disabled = false;
  generating = false;
}

function pushHistory(prompt, seed) {
  try {
    const key = 'pf3d-history';
    const h = JSON.parse(localStorage.getItem(key) || '[]');
    h.unshift({ prompt, seed, t: Date.now() });
    localStorage.setItem(key, JSON.stringify(h.slice(0, 12)));
    renderHistory();
  } catch { renderHistoryFallback(prompt, seed); }
}
function renderHistory() {
  const box = $('history'); box.innerHTML = '';
  let h = [];
  try { h = JSON.parse(localStorage.getItem('pf3d-history') || '[]'); } catch { }
  if (!h.length) { box.innerHTML = '<span style="color:var(--mut);font-size:13px">Your generations will appear here.</span>'; return; }
  for (const item of h) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = `◈ ${item.prompt.slice(0, 42)} (s${item.seed})`;
    b.title = item.prompt;
    b.onclick = () => { $('prompt').value = item.prompt; $('seed').value = item.seed; runGenerate(); };
    box.appendChild(b);
  }
}
function renderHistoryFallback(prompt, seed) {
  const box = $('history');
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = `◈ ${prompt.slice(0, 42)} (s${seed})`;
  b.onclick = () => { $('prompt').value = prompt; $('seed').value = seed; runGenerate(); };
  box.prepend(b);
}

function download(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'model'; }

$('generateBtn').onclick = runGenerate;
$('prompt').addEventListener('input', e => { $('charCount').textContent = `${e.target.value.length} / 280`; });
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runGenerate(); });
$('diceSeed').onclick = () => { $('seed').value = Math.floor(Math.random() * 99999); };
$('autoRotate').onchange = e => controls.autoRotate = e.target.checked;
$('wireframe').onchange = e => modelRoot.traverse(o => { if (o.isMesh && o.material) o.material.wireframe = e.target.checked; });
document.querySelectorAll('.examples button').forEach(b => b.onclick = () => { $('prompt').value = b.dataset.prompt; $('charCount').textContent = `${b.dataset.prompt.length} / 280`; runGenerate(); });
$('surpriseBtn').onclick = () => {
  const ideas = [
    'a crystal dragon on a floating island', 'a cozy wooden cottage with a stone chimney',
    'a retro rocket ready for launch', 'a cute robot companion with antenna',
    'a red sports car', 'a giant glowing mushroom forest', 'a medieval castle on a cliff',
    'a golden lighthouse in a storm', 'a neon samurai sword', 'a glass flower that never wilts',
    'a tabby cat sitting', 'an ice castle with crystal towers',
  ];
  $('prompt').value = ideas[Math.floor(Math.random() * ideas.length)];
  $('seed').value = Math.floor(Math.random() * 99999);
  runGenerate();
};
$('snapshotBtn').onclick = () => {
  renderer.render(scene, camera);
  download(renderer.domElement.toDataURL('image/png'), slug(currentMeta.prompt) + '.png');
};
$('exportGlb').onclick = () => {
  new GLTFExporter().parse(modelRoot, res => {
    const blob = res instanceof ArrayBuffer ? new Blob([res], { type: 'model/gltf-binary' }) : new Blob([JSON.stringify(res)], { type: 'model/gltf+json' });
    download(URL.createObjectURL(blob), slug(currentMeta.prompt) + '.glb');
  }, err => console.error(err), { binary: true });
};
$('exportStl').onclick = () => {
  const data = new STLExporter().parse(modelRoot, { binary: true });
  download(URL.createObjectURL(new Blob([data], { type: 'model/stl' })), slug(currentMeta.prompt) + '.stl');
};
$('exportObj').onclick = () => {
  const data = new OBJExporter().parse(modelRoot);
  download(URL.createObjectURL(new Blob([data], { type: 'text/plain' })), slug(currentMeta.prompt) + '.obj');
};
$('viewFront').onclick = () => { camera.position.set(0, 2.6, 11); controls.target.set(0, 1.8, 0); };
$('viewTop').onclick = () => { camera.position.set(0, 13, 0.5); controls.target.set(0, 1, 0); };
$('viewIso').onclick = () => { camera.position.set(7.2, 4.4, 9.2); controls.target.set(0, 1.8, 0); };
$('detail').oninput = e => $('detailVal').textContent = ['light', 'medium', 'ultra'][Number(e.target.value)];
$('aiGenerateBtn').onclick = runAIGenerate;
try { $('aiKey').value = localStorage.getItem('pf3d-meshy-key') || ''; } catch { /* private mode */ }

/* ================= loop ================= */
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  const dt = Math.min(clock.getDelta(), 0.05);
  void dt;
  dust.rotation.y = t * 0.02;
  modelRoot.traverse(o => {
    if (o.userData.glow && o.material?.emissiveIntensity !== undefined) o.material.emissiveIntensity = 1.6 + Math.sin(t * 3) * 0.5;
    if (o.userData.flicker) o.scale.set(1 + Math.sin(t * 23) * 0.06, 1 + Math.sin(t * 31) * 0.1, 1 + Math.sin(t * 23) * 0.06);
    if (o.userData.orbit && o.userData.orbitR !== undefined) {
      const a = o.userData.orbitA + t * o.userData.orbit;
      o.position.x = Math.cos(a) * o.userData.orbitR;
      o.position.z = Math.sin(a) * o.userData.orbitR;
    }
  });
  controls.update();
  renderer.render(scene, camera);
}

/* ================= boot ================= */
resize();
renderHistory();
tick();
generate($('prompt').value, Number($('seed').value || 0), 'auto', 1, true).then(resize).catch(console.error);
setTimeout(resize, 500);
