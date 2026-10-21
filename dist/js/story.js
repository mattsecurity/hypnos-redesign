// HYPNOS — scroll-driven cinematic sequence.
// City from above → zoom on the car → descent to the ANPR camera on the median → camera feed with plate reading.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCity, CITY } from './city.js';
import { loadDriver, seatDriver } from './driver.js';

/* ------------------------------------------------------------------ */
/*  World constants (metres). Aerial photo: 1536×1024 px @ 0.135 m/px  */
/* ------------------------------------------------------------------ */
const MPP = 0.135;
const GW = 1536 * MPP, GH = 1024 * MPP;           // ground size
const L1 = { x0: -51.84, x1: 51.84, z0: -34.56, z1: 34.56 }; // LOD1 crop
const ROAD = {
  medianZ0: -2.05, medianZ1: 0.45,
  north: [-10.45, -2.15], south: [0.5, 8.95],
  laneS1: 2.95, laneS2: 6.85,       // eastbound (south carriageway)
  laneN1: -4.36, laneN2: -8.37,     // westbound (north carriageway)
  dashS: 4.9, dashN: -6.38,
  edges: [-10.35, -2.33, 1.0, 8.8],
};
const LAMPS_X = [-61.2, -42, -20.8, -2.6, 15.4, 38.1, 58.3, 74.4];
const LAMP_Z = [-13.1, 9.6];
const POLE = new THREE.Vector3(28, 0, (ROAD.medianZ0 + ROAD.medianZ1) / 2);
const PLATE = 'GM 471 KX';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// smooth band-limited noise (sum of incommensurate sines) — drone hover, gimbal drift, pole sway
const wob = (t, s = 0) => Math.sin(t + s * 1.7) * .5 + Math.sin(t * 2.31 + s * 3.1) * .3 + Math.sin(t * 4.77 + s * 5.3) * .2;

export async function createStory({ canvas, onProgress, quality = 'high' }) {
  const isLow = quality === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isLow ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f17);
  const FOG = 0x121b2a;
  scene.fog = new THREE.Fog(FOG, 70, 260);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1200);

  /* ---------- loading ---------- */
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, l, t) => onProgress && onProgress(l / t);
  const texLoader = new THREE.TextureLoader(manager);
  const draco = new DRACOLoader(manager).setDecoderPath('vendor/draco/').setDecoderConfig({ type: 'wasm' });
  const gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco);
  const hdrLoader = new HDRLoader(manager);
  const loadTex = (url, srgb = true) => new Promise((res, rej) => texLoader.load(url, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t); }, undefined, rej));

  const [aerial, lod1, asph, env, carGltf, shadowTex, atlasImg, atlasN, driverTpl, medianTex, paveD, paveN] = await Promise.all([
    loadTex('assets/img/aerial.webp'),
    loadTex('assets/img/aerial-lod1.webp'),
    loadTex('assets/tex/asphalt_diff.jpg'),
    hdrLoader.loadAsync('assets/tex/rooftop_night_1k.hdr'),
    gltfLoader.loadAsync('assets/3d/sedan.glb'),
    loadTex('assets/3d/car-shadow.png'),
    loadTex('assets/3d/sedan-atlas.jpg'),
    loadTex('assets/3d/sedan-atlas-n.jpg', false),
    loadDriver(gltfLoader),
    loadTex('assets/tex/median-veg.webp'),
    loadTex('assets/tex/pavement_diff.jpg'),
    loadTex('assets/tex/pavement_nor.jpg', false),
  ]);
  draco.dispose();
  env.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  for (const t of [asph, paveD, paveN]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  for (const t of [aerial, lod1]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }

  /* ---------- lights (match the blue-hour photo) ---------- */
  scene.add(new THREE.HemisphereLight(0x6f86b8, 0x2a2420, 0.55));
  const key = new THREE.DirectionalLight(0xffd7a8, 0.9); key.position.set(-20, 40, 18); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.6); rim.position.set(30, 25, -30); scene.add(rim);

  /* ---------- ground: photo LODs + asphalt micro-detail + analytic headlights ---------- */
  const MAX_CARS = 6;
  const groundU = {
    tLod0: { value: aerial }, tLod1: { value: lod1 }, tDetail: { value: asph }, tPave: { value: paveD }, tPaveN: { value: paveN }, uLamps: { value: [] },
    uLod1: { value: 0 }, uDetail: { value: 0 }, uCars: { value: Array.from({ length: MAX_CARS }, () => new THREE.Vector4(9999, 0, 1, 0)) },
    uReveal: { value: 1 }, uCamPos: { value: new THREE.Vector3() }, uFogColor: { value: new THREE.Color(0x121b2a) }, uFogNear: { value: 70 }, uFogFar: { value: 260 },
  };
  const groundMat = new THREE.ShaderMaterial({
    uniforms: groundU,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tLod0, tLod1, tDetail, tPave, tPaveN; uniform float uLod1, uDetail, uReveal;
      uniform vec3 uLamps[${LAMPS_X.length * LAMP_Z.length}];
      uniform vec4 uCars[${MAX_CARS}]; uniform vec3 uCamPos, uFogColor; uniform float uFogNear, uFogFar;
      varying vec3 vW;
      float lum(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
      float fbm2(vec2 p){ return vn(p) * .55 + vn(p * 2.07 + 3.1) * .3 + vn(p * 4.3 + 7.7) * .15; }
      // thin, pixel-crisp dark line along a noise iso-contour (cracks / sealed joints)
      float isoLine(float n, float w){ return 1. - smoothstep(0., fwidth(n) * w, abs(n - .5)); }
      // heavily blurred photo (both LODs) at a world position
      vec3 blurAt(vec2 q, float w1){
        vec2 u0 = vec2((q.x + ${(GW / 2).toFixed(3)}) / ${GW.toFixed(3)}, 1. - (q.y + ${(GH / 2).toFixed(3)}) / ${GH.toFixed(3)});
        vec2 u1 = vec2((q.x - ${L1.x0.toFixed(3)}) / ${(L1.x1 - L1.x0).toFixed(3)}, 1. - (q.y - ${L1.z0.toFixed(3)}) / ${(L1.z1 - L1.z0).toFixed(3)});
        return mix(texture2D(tLod0, u0, 2.5).rgb, texture2D(tLod1, u1, 4.).rgb, w1);
      }
      void main(){
        vec2 p = vW.xz;
        vec2 uv0 = vec2((p.x + ${(GW / 2).toFixed(3)}) / ${GW.toFixed(3)}, 1. - (p.y + ${(GH / 2).toFixed(3)}) / ${GH.toFixed(3)});
        vec3 c = texture2D(tLod0, uv0).rgb;
        vec3 cb = texture2D(tLod0, uv0, 2.5).rgb;
        vec2 uv1 = vec2((p.x - ${L1.x0.toFixed(3)}) / ${(L1.x1 - L1.x0).toFixed(3)}, 1. - (p.y - ${L1.z0.toFixed(3)}) / ${(L1.z1 - L1.z0).toFixed(3)});
        vec2 e = smoothstep(vec2(0.), vec2(.12), uv1) * smoothstep(vec2(0.), vec2(.12), 1. - uv1);
        float w1 = uLod1 * e.x * e.y;
        c = mix(c, texture2D(tLod1, uv1).rgb, w1);
        cb = mix(cb, texture2D(tLod1, uv1, 4.).rgb, w1);
        // asphalt micro detail only on carriageways
        // (the kerb-side edges extend under the 3D kerbs so no strip of the photo's planting peeks out)
        float road = (smoothstep(${ROAD.north[0].toFixed(2)}, ${(ROAD.north[0] + .3).toFixed(2)}, p.y) * (1. - smoothstep(-2.05, -1.95, p.y)))
                   + (smoothstep(.35, .45, p.y) * (1. - smoothstep(${(ROAD.south[1] - .3).toFixed(2)}, ${ROAD.south[1].toFixed(2)}, p.y)));
        // close up: photo markings are replaced by crisp geometry → de-marked photo on asphalt.
        // Markings are thin bright lines along x: the darkest of three samples across the lane removes their blurred halo.
        // clamp into the carriageway core first, so the kerb-side strips reuse nearby asphalt
        float py = p.y < -1. ? clamp(p.y, ${(ROAD.north[0] + .3).toFixed(2)}, ${(ROAD.north[1] - .3).toFixed(2)}) : clamp(p.y, ${(ROAD.south[0] + .3).toFixed(2)}, ${(ROAD.south[1] - .3).toFixed(2)});
        vec3 cm = blurAt(vec2(p.x, py), w1);
        vec3 c0 = cm;
        for (int k = 0; k < 4; k++) {
          float dz = (k < 2 ? .75 : 1.5) * (mod(float(k), 2.) < .5 ? 1. : -1.);
          float qz = py + dz;
          // only samples that are still on the same carriageway (never pull in the median / kerb colours)
          float inN = step(${(ROAD.north[0] + .25).toFixed(2)}, qz) * step(qz, ${(ROAD.north[1] - .25).toFixed(2)}) * step(py, -1.);
          float inS = step(${(ROAD.south[0] + .25).toFixed(2)}, qz) * step(qz, ${(ROAD.south[1] - .25).toFixed(2)}) * step(-1., py);
          vec3 sm = blurAt(vec2(p.x, qz), w1) * (k < 2 ? 1. : 1.04);
          cm = min(cm, mix(c0, sm, max(inN, inS)));
        }
        c = mix(c, cm, road * uDetail);
        vec3 d = texture2D(tDetail, p / 3.2).rgb;
        vec3 d2 = texture2D(tDetail, p / 11.0 + .37).rgb;
        vec3 d3 = texture2D(tDetail, p / 1.15 + .61).rgb;
        float dl = lum(d) / .19 * .6 + lum(d2) / .19 * .2 + lum(d3) / .19 * .2;
        float side = smoothstep(-22.6, -22.3, p.y) * (1. - smoothstep(-10.7, -10.45, p.y)) + smoothstep(8.95, 9.2, p.y) * (1. - smoothstep(21.1, 21.4, p.y));
        // crisp aggregate: full-strength asphalt on the carriageways, a stone grain on the pavements
        c *= mix(1., clamp(dl, .4, 1.9), uDetail * (road * .95 + (1. - road - side) * .3));
        // fine wear: tyre polish along the wheel tracks, darker oil-stained lane centres
        float lanePos = fract((p.y - ${ROAD.south[0].toFixed(2)}) / 3.9);
        float tracks = smoothstep(.12, .0, abs(lanePos - .27)) + smoothstep(.12, .0, abs(lanePos - .73));
        c *= 1. + road * uDetail * (tracks * .06 - smoothstep(.1, .0, abs(lanePos - .5)) * .07);
        // crisp features that a real drone frame resolves: hairline cracks, tar-sealed seams
        float crackMask = smoothstep(.62, .8, vn(p * .23 + 11.));
        float crack = isoLine(fbm2(p * vec2(.9, 2.2)), 1.4) * crackMask;
        float seam = isoLine(fract((p.y + .35 * sin(p.x * .07)) / 4.2) * .999 + .001 * vn(p * 3.), 1.6) * .6;
        c *= 1. - road * uDetail * (crack * .28 + seam * .22);
        // sidewalks (close shots): real granite-chip slabs (Poly Haven concrete_pavement_02, 1.8 m tile);
        // the photo only contributes its light — lamp pools, warm tint, soft shade — never its blurred texture
        // not across the side-street mouths (they stay asphalt from the photo)
        float gapN = 0., gapS = 0.;
        ${CITY.gapsN.map(([a, b]) => `gapN += smoothstep(${(a - .3).toFixed(2)}, ${(a + .3).toFixed(2)}, p.x) * (1. - smoothstep(${(b - .3).toFixed(2)}, ${(b + .3).toFixed(2)}, p.x));`).join('\n        ')}
        ${CITY.gapsS.map(([a, b]) => `gapS += smoothstep(${(a - .3).toFixed(2)}, ${(a + .3).toFixed(2)}, p.x) * (1. - smoothstep(${(b - .3).toFixed(2)}, ${(b + .3).toFixed(2)}, p.x));`).join('\n        ')}
        float sidePave = side * (1. - (p.y < 0. ? gapN : gapS));
        // side-street mouths: plain asphalt continuing from the avenue (no flat photo trees / kerb arcs)
        float gapA = side * (p.y < 0. ? gapN : gapS);
        vec3 mouth = blurAt(vec2(p.x, p.y < 0. ? -6.3 : 4.7), w1) * clamp(dl, .45, 1.8) * .92;
        c = mix(c, mouth, gapA * uReveal);
        vec2 tp = p / 1.8;
        vec3 pav = texture2D(tPave, tp).rgb;
        vec3 pn = texture2D(tPaveN, tp).xyz * 2. - 1.;
        vec3 nw = normalize(vec3(pn.x, pn.z, -pn.y));
        float relief = .8 + .28 * max(dot(nw, normalize(vec3(.3, 1., .2))), 0.);
        // street lamps (cosine-weighted point lights at the real 3D lamp heads) + blue-hour sky
        vec3 light = vec3(.13, .15, .2);
        for (int i = 0; i < ${LAMPS_X.length * LAMP_Z.length}; i++) {
          vec3 L = uLamps[i] - vec3(p.x, .15, p.y);
          float d2 = dot(L, L);
          light += vec3(1., .74, .47) * 62. * L.y * inversesqrt(d2) / d2;
        }
        // keep a whisper of the photo's own light variation (shop windows, entrances)
        light *= mix(.85, 1.15, smoothstep(.05, .35, lum(blurAt(p, w1))));
        // grime towards the facades / kerb
        float edgeGrime = 1. - .18 * ((1. - smoothstep(-22.6, -21.6, p.y)) + smoothstep(20.4, 21.4, p.y) + smoothstep(-11.2, -10.45, p.y) + (1. - smoothstep(8.95, 9.7, p.y)));
        vec3 cSide = pav * relief * light * edgeGrime;
        c = mix(c, cSide, sidePave * uReveal);
        // headlights & tail-lights of moving cars (x, z, dirX, on)
        vec3 add = vec3(0.);
        for (int i = 0; i < ${MAX_CARS}; i++) {
          vec4 car = uCars[i];
          vec2 rel = p - car.xy; float s = car.z;
          float along = rel.x * s - 2.4; float lat = rel.y;
          float a = clamp(along, 0., 80.);
          float cone = (1. - smoothstep(.3 + a * .18, 1.1 + a * .30, abs(lat))) * step(0., along);
          float beam = cone * exp(-a / 13.) * smoothstep(0., 1.5, a);
          // twin hot-spots
          float spots = step(0., along) * exp(-pow(a - 4.5, 2.) / 6.) * (exp(-pow(lat - .7, 2.) * 2.) + exp(-pow(lat + .7, 2.) * 2.));
          float back = -rel.x * s - 2.45;
          float tail = exp(-clamp(back, 0., 80.) / 1.2) * step(0., back) * exp(-lat * lat / .9);
          add += car.w * (vec3(1., .93, .82) * (beam * .45 + spots * .3) + vec3(.9, .05, .03) * tail * .25);
        }
        c += add * (.35 + .65 * clamp(dl, 0., 1.4));
        float f = smoothstep(uFogNear, uFogFar, distance(uCamPos, vW));
        c = mix(c, uFogColor, f);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  // beyond the photo the clamped edge texels simply continue the avenue (always under fog)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.extent * 2 + 60, GH, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // dark surround beyond the photo: drawn first and without depth, so it can never z-fight with the ground
  // (on phone GPUs the two huge, nearly coplanar quads showed as dark shards from high altitude)
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: 0x141b27, depthTest: false, depthWrite: false }));
  surround.rotation.x = -Math.PI / 2; surround.position.y = -0.05; surround.renderOrder = -10; scene.add(surround);

  /* ---------- road furniture: curbs, crisp markings ---------- */
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: .85 });
  for (const z of [ROAD.medianZ0 + .1, ROAD.medianZ1 - .1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(CITY.extent * 2, .14, .2), concrete);
    curb.position.set(0, .07, z); scene.add(curb);
  }
  const paintCanvas = document.createElement('canvas'); paintCanvas.width = 256; paintCanvas.height = 32;
  {
    const g = paintCanvas.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 2600; i++) { const a = Math.random(); g.fillStyle = `rgba(255,255,255,${.55 + a * .45})`; g.fillRect(Math.random() * 256, 3 + Math.random() * 26, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  }
  const paintTex = new THREE.CanvasTexture(paintCanvas); paintTex.wrapS = THREE.RepeatWrapping;
  const paintMat = new THREE.MeshBasicMaterial({ color: 0xc9ccd0, alphaMap: paintTex, transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const dashGeo = new THREE.PlaneGeometry(4.0, .14); dashGeo.rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, paintMat, 160);
  const m4 = new THREE.Matrix4(); let di = 0;
  for (const z of [ROAD.dashS, ROAD.dashN]) for (let x = -CITY.extent + 4; x < CITY.extent - 4 && di < 160; x += 6.5) { m4.makeTranslation(x, .012, z); dashes.setMatrixAt(di++, m4); }
  dashes.count = di; scene.add(dashes);
  // zebra crossings across each side-street mouth, just behind the kerb line
  {
    const zg = new THREE.PlaneGeometry(.5, 3.2); zg.rotateX(-Math.PI / 2);
    var zebra = new THREE.InstancedMesh(zg, paintMat, 200); let zi = 0; const zm = new THREE.Matrix4();
    for (const [gaps, zc] of [[CITY.gapsN, -12.6], [CITY.gapsS, 11.1]]) for (const [a, b] of gaps) {
      if (Math.abs(a) > GW / 2 + 30) continue;
      for (let x = a + .5; x < b - .4 && zi < 200; x += 1.0) { zm.makeTranslation(x, .013, zc); zebra.setMatrixAt(zi++, zm); }
    }
    zebra.count = zi; scene.add(zebra);
  }
  for (const z of ROAD.edges) {
    const g = new THREE.PlaneGeometry(CITY.extent * 2, .13); g.rotateX(-Math.PI / 2);
    const l = new THREE.Mesh(g, paintMat); l.position.set(0, .011, z); scene.add(l);
  }

  /* ---------- street lamps ---------- */
  const lampPole = new THREE.MeshStandardMaterial({ color: 0x2d3136, metalness: .6, roughness: .5 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc27a, emissiveIntensity: 9 });
  const poleGeo = new THREE.CylinderGeometry(.06, .09, 7.2, 10); poleGeo.translate(0, 3.6, 0);
  const headGeo = new RoundedBoxGeometry(.75, .12, .3, 2, .04);
  const glowGeo = new THREE.PlaneGeometry(.6, .2); glowGeo.rotateX(Math.PI / 2);
  const lampHeads = [];
  // cast-iron base, collar and a soft contact shadow so the posts sit on the paving
  const baseGeo = (() => {
    const pts = [[0, 0], [.17, 0], [.17, .05], [.14, .08], [.13, .45], [.11, .52], [.1, .62], [.085, .66], [0, .66]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 20); g.translate(0, .15, 0); return g;
  })();
  const lampShadowMat = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(.35, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  })();
  const shadowGeo = new THREE.PlaneGeometry(1.1, 1.1); shadowGeo.rotateX(-Math.PI / 2);
  const addLampFoot = (x, z) => {
    const b = new THREE.Mesh(baseGeo, lampPole); b.position.set(x, 0, z); scene.add(b);
    const sh = new THREE.Mesh(shadowGeo, lampShadowMat); sh.position.set(x, .152, z); sh.renderOrder = 1; scene.add(sh);
  };
  for (const z of LAMP_Z) for (const x of LAMPS_X) {
    const side = z < 0 ? 1 : -1; // heads lean towards the road
    const p = new THREE.Mesh(poleGeo, lampPole); p.position.set(x, 0, z); scene.add(p); addLampFoot(x, z);
    const h = new THREE.Mesh(headGeo, lampPole); h.position.set(x, 7.25, z + side * .25); scene.add(h);
    const g = new THREE.Mesh(glowGeo, lampGlow); g.position.set(x, 7.18, z + side * .25); scene.add(g);
    lampHeads.push(V(x, 7.0, z + side * .25));
  }
  groundU.uLamps.value = lampHeads;
  // soft halo around each lamp head: humid evening air
  {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,160,1)'); gr.addColorStop(.12, 'rgba(255,190,120,.55)'); gr.addColorStop(.4, 'rgba(255,170,100,.12)'); gr.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    var haloMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .55, fog: true });
    for (const h of lampHeads) { const sp = new THREE.Sprite(haloMat); sp.position.copy(h).add(V(0, .05, 0)); sp.scale.setScalar(2.6); scene.add(sp); }
  }
  // the avenue's lamps continue past the photo (visual only)
  if (!isLow) for (const z of LAMP_Z) for (let x = 93; x < CITY.extent; x += 19) for (const sx of [-1, 1]) {
    const side = z < 0 ? 1 : -1, xx = sx * x;
    const p = new THREE.Mesh(poleGeo, lampPole); p.position.set(xx, 0, z); scene.add(p); addLampFoot(xx, z);
    const h = new THREE.Mesh(headGeo, lampPole); h.position.set(xx, 7.25, z + side * .25); scene.add(h);
    const g = new THREE.Mesh(glowGeo, lampGlow); g.position.set(xx, 7.18, z + side * .25); scene.add(g);
  }

  /* ---------- 3D city: sidewalks, planted median, trees, buildings ---------- */
  const SKY = { top: 0x2c3f63, ground: 0x2a221b };
  const city = buildCity({ scene, groundMat, ROAD, GW, lamps: lampHeads, isLow, sky: SKY, medianTex });
  // sky dome (only visible in the low, grazing shots)
  {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x0b1a33) }, uHor: { value: new THREE.Color(0x46587a) }, uGlow: { value: new THREE.Color(0x9a6f55) } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform vec3 uTop, uHor, uGlow; varying vec3 vD;
        void main(){ float h = clamp(vD.y, 0., 1.);
          vec3 c = mix(uHor, uTop, pow(h, .55));
          c += uGlow * pow(1. - h, 6.) * smoothstep(-.2, 1., -vD.x) * .55; // last light low in the west
          gl_FragColor = vec4(c, 1.); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat); sky.renderOrder = -10; scene.add(sky);
    sky.onBeforeRender = (r, s, cam) => sky.position.copy(cam.position);
  }
  // a small pool of real lights follows the action so cars, pole and curbs pick up the lamps
  const lampPool = Array.from({ length: isLow ? 2 : 4 }, () => { const l = new THREE.PointLight(0xffc48a, 55, 26, 2); scene.add(l); return l; });
  function updateLampPool(focus) {
    const sorted = lampHeads.map(p => [p.distanceToSquared(focus), p]).sort((a, b) => a[0] - b[0]);
    lampPool.forEach((l, i) => l.position.copy(sorted[i][1]).add(V(0, -.25, 0)));
  }

  /* ---------- cars (generic saloon, de-badged) ---------- */
  const plateTex = makePlateTexture(renderer);
  // interior/detail atlas with our Italian plate composited into the plate slot
  const atlasCanvas = document.createElement('canvas'); atlasCanvas.width = atlasCanvas.height = 2048;
  {
    const g = atlasCanvas.getContext('2d');
    g.drawImage(atlasImg.image, 0, 0, 2048, 2048);
  }
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.flipY = false; atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
  atlasN.flipY = false; atlasN.needsUpdate = true;

  // normalise the source model: metres, centred, wheels on y = 0, front towards −Z
  const carSrc = new THREE.Group();
  const model = carGltf.scene;
  carSrc.add(model);
  {
    const b0 = new THREE.Box3().setFromObject(model);
    const s = 4.85 / (b0.max.z - b0.min.z);
    model.scale.setScalar(s);
    const b1 = new THREE.Box3().setFromObject(model);
    const c = b1.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -b1.min.y, -c.z);
    carSrc.updateMatrixWorld(true);
  }
  // wheel pivots at the axle centres, so they can spin
  const wheelNames = ['KLP', 'KPP', 'KLZ', 'KPZ'];
  for (const n of wheelNames) {
    const w = model.getObjectByName(n); if (!w) continue;
    const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.name = 'pivot_' + n; pivot.position.copy(c);
    carSrc.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(w);
  }
  // plate positions: ray-cast onto the bumpers
  const platePos = {};
  {
    carSrc.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    const meshes = []; carSrc.traverse(o => o.isMesh && meshes.push(o));
    rc.set(V(0, .44, -6), V(0, 0, 1)); let h = rc.intersectObjects(meshes, false)[0];
    platePos.front = h ? h.point.clone().add(V(0, 0, -.018)) : V(0, .44, -2.45);
    rc.set(V(0, .66, 6), V(0, 0, -1)); h = rc.intersectObjects(meshes, false)[0];
    platePos.back = h ? h.point.clone().add(V(0, 0, .018)) : V(0, .66, 2.45);
  }

  // lamp glass: white at the front, red at the back (per-vertex)
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  lampMat.color.setRGB(2.6, 2.6, 2.6);
  const amberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, .55, .08) });
  carSrc.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Gar_LXe' || o.name === 'IHL' || o.parent?.name === 'IHL') return;
    const g = o.geometry.clone(); const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3); const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const front = v.z < 0;
      col.set(front ? [1, .97, .9] : [1, .04, .02], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.geometry = g; o.userData.lamp = true;
  });

  const shared = {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x07090c, metalness: .1, roughness: .04, transparent: true, opacity: .62, envMapIntensity: 1.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd6d9dd, metalness: 1, roughness: .16, envMapIntensity: 1.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: .78 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x121316, metalness: .2, roughness: .45 }),
    alu: new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: .9, roughness: .35 }),
    rim: new THREE.MeshPhysicalMaterial({ color: 0x8e939a, metalness: .92, roughness: .32, clearcoat: .6, clearcoatRoughness: .2, envMapIntensity: 1.1 }),
    // interior leather etc.: the source atlas is very pale — bring it to a deep espresso/tan cabin
    atlas: new THREE.MeshStandardMaterial({ map: atlas, normalMap: atlasN, roughness: .6, metalness: .1, color: 0x6b5d50 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: .9 }),
  };
  // steering-wheel centre: the seated driver (driver.js) is posed from it
  const wheelObj = model.getObjectByName('方向盘');
  const wheelC = wheelObj ? new THREE.Box3().setFromObject(wheelObj).getCenter(new THREE.Vector3()) : V(-.38, .95, -.55);

  function buildCar(color, withPlates) {
    const car = carSrc.clone(true);
    const paint = new THREE.MeshPhysicalMaterial({ color, metalness: .55, roughness: .3, clearcoat: 1, clearcoatRoughness: .035, envMapIntensity: 1.35 });
    car.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.lamp) { o.material = lampMat; return; }
      const mn = o.material.name;
      const inWheel = /^K[LP][PZ]/.test(o.name) || /^K[LP][PZ]/.test(o.parent?.name || '');
      if (mn === 'MBSL_lak') o.material = paint;
      else if (mn === 'Gar_skl') o.material = shared.glass;
      else if (mn === 'Gar_chr') o.material = shared.chrome;
      else if (mn === 'Gar_gum') o.material = shared.rubber;
      else if (mn === 'Gar_cbs') o.material = shared.trim;
      else if (mn === 'Gar_alu') o.material = shared.alu;
      else if (mn === 'Gar_LOr') o.material = amberMat;
      else if (mn === 'Gar_LXe') o.material = shared.dark;           // interior lamps
      else if (mn === 'MBSL_tex') o.material = inWheel ? shared.rim : shared.atlas;
    });
    const driver = seatDriver(driverTpl, car, wheelC);
    const group = new THREE.Group();
    car.rotation.y = -Math.PI / 2; // model front is −Z; world travel along +X
    group.add(car);
    const sg = new THREE.PlaneGeometry(.655 * 3.9, 1.3 * 4.1); sg.rotateX(-Math.PI / 2); sg.rotateY(Math.PI / 2);
    const shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: shadowTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true, depthWrite: false }));
    shadow.position.y = .015; shadow.renderOrder = 2; group.add(shadow);
    const wheels = wheelNames.map(n => car.getObjectByName('pivot_' + n)).filter(Boolean);
    let plates = null;
    if (withPlates) {
      const mat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: .35, metalness: 0, emissive: 0xffffff, emissiveMap: plateTex, emissiveIntensity: .07 });
      const pg = new THREE.PlaneGeometry(.52, .11);
      const holder = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: .5 });
      const hg = new THREE.BoxGeometry(.55, .135, .012);
      const front = new THREE.Mesh(pg, mat); front.position.copy(platePos.front); front.rotation.y = Math.PI; car.add(front);
      const fh = new THREE.Mesh(hg, holder); fh.position.copy(platePos.front).add(V(0, 0, .008)); car.add(fh);
      const back = new THREE.Mesh(pg, mat); back.position.copy(platePos.back); car.add(back);
      const bh = new THREE.Mesh(hg, holder); bh.position.copy(platePos.back).add(V(0, 0, -.008)); car.add(bh);
      plates = { front, back };
    }
    scene.add(group);
    return { group, wheels, plates, driver, dist: 0 };
  }
  const hero = buildCar(0x0a0b0d, true);
  const traffic = [];
  const trafficDefs = isLow
    ? [{ color: 0x8c9198, lane: ROAD.laneN1, dir: -1, speed: 13, offset: 0 }]
    : [
      { color: 0x8c9198, lane: ROAD.laneN1, dir: -1, speed: 13, offset: 0 },
      { color: 0x1d2b45, lane: ROAD.laneN2, dir: -1, speed: 11, offset: 90 },
      { color: 0xe6e7e9, lane: ROAD.laneN1, dir: -1, speed: 14, offset: 150 },
    ];
  for (const d of trafficDefs) { const c = buildCar(d.color, false); c.def = d; if (d.dir < 0) c.group.rotation.y = Math.PI; traffic.push(c); }

  /* ---------- ANPR pole + camera ---------- */
  const rig = new THREE.Group(); rig.position.copy(POLE); scene.add(rig);
  const POLE_H = 6.6, ARM_L = 2.3, ARM_Y = POLE_H - .25;
  const poleR = y => lerp(.098, .068, (y - .24) / (POLE_H - .24));   // tapered tube, radius at height y
  const rigAdd = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); rig.add(m); return m; };
  // hot-dip galvanised steel: spangled, unevenly matte
  const galvMap = noiseTexture(256, .8, 1, 1); galvMap.colorSpace = THREE.SRGBColorSpace;
  const galvRough = noiseTexture(256, .28, .55, 1);
  const galvanised = (ru, rv, color = 0xaab0b6) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness: .85, roughness: 1, map: galvMap.clone(), roughnessMap: galvRough.clone(), envMapIntensity: 1.1 });
    m.map.repeat.set(ru, rv); m.roughnessMap.repeat.set(ru, rv); return m;
  };
  const galv = galvanised(2, 2);
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x5d6268, metalness: .8, roughness: .45 });
  {
    // foundation: concrete plinth, base plate on anchor bolts, four gussets, anti-corrosion collar
    rigAdd(new RoundedBoxGeometry(.62, .3, .62, 2, .03), concrete, 0, .07, 0);
    rigAdd(new THREE.BoxGeometry(.34, .022, .34), galv, 0, .231, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      rigAdd(new THREE.CylinderGeometry(.011, .011, .07, 10), darkSteel, sx * .13, .265, sz * .13);
      rigAdd(new THREE.CylinderGeometry(.024, .024, .004, 16), darkSteel, sx * .13, .244, sz * .13);
      rigAdd(new THREE.CylinderGeometry(.019, .019, .018, 6), darkSteel, sx * .13, .255, sz * .13);
    }
    const tri = new THREE.Shape(); tri.moveTo(.098, 0); tri.lineTo(.2, 0); tri.lineTo(.098, .17); tri.closePath();
    const gusset = new THREE.ExtrudeGeometry(tri, { depth: .01, bevelEnabled: false }); gusset.translate(0, 0, -.005);
    for (let k = 0; k < 4; k++) rigAdd(gusset, galv, 0, .242, 0).rotation.y = k * Math.PI / 2;
    rigAdd(new THREE.CylinderGeometry(.106, .108, .32, 40), galvanised(3, 1, 0x9ea4aa), 0, .242 + .16, 0);
    // tapered pole + cap
    rigAdd(new THREE.CylinderGeometry(poleR(POLE_H), poleR(.24), POLE_H - .24, 40), galvanised(3, 36), 0, (POLE_H + .24) / 2, 0);
    rigAdd(new THREE.SphereGeometry(.071, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), galv, 0, POLE_H, 0);
    // inspection hatch (towards the traffic it watches, −X) with two security screws
    const hx = -poleR(1.05) - .004;
    rigAdd(new RoundedBoxGeometry(.014, .3, .085, 2, .005), galvanised(1, 3, 0xa2a8ae), hx, 1.05, 0);
    for (const y of [.93, 1.17]) rigAdd(new THREE.CylinderGeometry(.006, .006, .006, 10), darkSteel, hx - .008, y, 0).rotation.z = Math.PI / 2;
  }
  {
    // outreach arm: clamp collar + flange on the pole, tapered tube, diagonal strut, end cap
    rigAdd(new THREE.CylinderGeometry(poleR(ARM_Y) + .014, poleR(ARM_Y) + .014, .3, 32), galv, 0, ARM_Y, 0);
    rigAdd(new THREE.BoxGeometry(.2, .2, .022), galv, 0, ARM_Y, poleR(ARM_Y) + .02);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) rigAdd(new THREE.CylinderGeometry(.012, .012, .016, 6), darkSteel, sx * .075, ARM_Y + sy * .075, poleR(ARM_Y) + .035).rotation.x = Math.PI / 2;
    const a0 = poleR(ARM_Y) + .03;
    const arm = rigAdd(new THREE.CylinderGeometry(.045, .053, ARM_L - a0, 24), galvanised(1, 10), 0, ARM_Y, (ARM_L + a0) / 2); arm.rotation.x = Math.PI / 2;
    rigAdd(new THREE.CircleGeometry(.046, 24), galv, 0, ARM_Y, ARM_L);
    const s0 = V(0, ARM_Y - 1.1, poleR(ARM_Y - 1.1) + .02), s1 = V(0, ARM_Y - .05, 1.15);
    const sd = s1.clone().sub(s0);
    const strut = rigAdd(new THREE.CylinderGeometry(.022, .022, sd.length(), 16), galvanised(1, 6), 0, 0, 0);
    strut.position.copy(s0).addScaledVector(sd, .5); strut.quaternion.setFromUnitVectors(V(0, 1, 0), sd.normalize());
    rigAdd(new THREE.CylinderGeometry(poleR(s0.y) + .012, poleR(s0.y) + .012, .1, 28), galv, 0, s0.y, 0);
    rigAdd(new THREE.BoxGeometry(.03, .05, .06), galv, 0, s1.y - .005, s1.z);
  }
  {
    // street cabinet on the pole: painted steel, rain hood, door seam, hinges, lock, conduit into the pole
    const cy = 2.5, cx = -poleR(cy) - .115;
    const paint = new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: .25, roughness: .5, envMapIntensity: .9 });
    rigAdd(new RoundedBoxGeometry(.2, .52, .36, 3, .014), paint, cx, cy, 0);
    rigAdd(new RoundedBoxGeometry(.006, .48, .32, 2, .003), new THREE.MeshStandardMaterial({ color: 0xb3b8bd, metalness: .25, roughness: .55 }), cx - .1, cy, 0);
    const hood = rigAdd(new THREE.BoxGeometry(.25, .012, .4), paint, cx - .01, cy + .272, 0); hood.rotation.z = .14;
    for (const y of [cy - .16, cy + .16]) rigAdd(new THREE.CylinderGeometry(.007, .007, .05, 10), darkSteel, cx - .1, y, -.163);
    rigAdd(new THREE.CylinderGeometry(.012, .012, .014, 16), darkSteel, cx - .106, cy, .12).rotation.z = Math.PI / 2;
    for (const y of [cy - .17, cy + .17]) {
      rigAdd(new THREE.TorusGeometry(poleR(y) + .004, .006, 8, 32), darkSteel, 0, y, 0).rotation.x = Math.PI / 2;
      rigAdd(new THREE.BoxGeometry(.03, .04, .06), darkSteel, -poleR(y) - .012, y, 0);
    }
    const duct = new THREE.CatmullRomCurve3([V(cx, cy - .26, 0), V(cx, cy - .4, 0), V(cx + .05, cy - .5, 0), V(-poleR(cy - .55) + .01, cy - .55, 0)]);
    rig.add(new THREE.Mesh(new THREE.TubeGeometry(duct, 24, .017, 10), new THREE.MeshStandardMaterial({ color: 0x3a3d41, roughness: .6 })));
  }
  {
    // "Area videosorvegliata" sign facing the oncoming traffic (−X), banded to the pole
    const sy = 3.35, sx = -poleR(sy) - .02;
    rigAdd(new THREE.BoxGeometry(.008, .36, .26), galv, sx, sy, 0);
    const sign = rigAdd(new THREE.PlaneGeometry(.25, .35), new THREE.MeshStandardMaterial({ map: makeSignTexture(renderer), roughness: .5 }), sx - .0045, sy, 0);
    sign.rotation.y = -Math.PI / 2;
    for (const y of [sy - .12, sy + .12]) rigAdd(new THREE.TorusGeometry(poleR(y) + .003, .005, 8, 32), darkSteel, 0, y, 0).rotation.x = Math.PI / 2;
  }

  // ANPR unit (local +Z = lens direction, +X = south side, origin = tilt pivot on the bracket)
  const housing = buildAnprCamera(renderer);
  // camera sits on top of the arm, looks west (−X) at incoming eastbound traffic, pitched down
  housing.rotation.order = 'YXZ';
  housing.rotation.y = -Math.PI / 2;
  housing.rotation.x = 0.2;
  const HOUSING_POS = V(0, ARM_Y + .045, ARM_L - .3);
  housing.position.copy(HOUSING_POS);
  rig.add(housing);
  // pipe clamp + swivel stem on the arm (not tilted with the camera)
  const mount = new THREE.Group(); mount.position.copy(HOUSING_POS); mount.rotation.y = -Math.PI / 2; rig.add(mount);
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0x6f757c, metalness: .8, roughness: .38 });
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .13, 28), steel); sleeve.rotation.z = Math.PI / 2; sleeve.position.y = -.045; mount.add(sleeve);
    for (const x of [-.05, .05]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(.061, .0045, 8, 32), steel); band.rotation.y = Math.PI / 2; band.position.set(x, -.045, 0); mount.add(band);
      const lug = new THREE.Mesh(new THREE.BoxGeometry(.012, .018, .022), steel); lug.position.set(x, -.045, .066); mount.add(lug);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.02, .024, .05, 20), steel); stem.position.y = .02; mount.add(stem);
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .07, 20), steel); knuckle.rotation.z = Math.PI / 2; knuckle.position.y = .045; mount.add(knuckle);
  }
  rig.updateMatrixWorld(true);
  // power + data cables: out of the rear glands, down into a grommet on top of the arm (pole side = mount −X)
  {
    const rubber = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: .55 });
    for (const gx of [-.03, .03]) {
      const pts = [housing.localToWorld(V(gx, .165, -.325))];
      for (const [x, y, z] of [[gx, .13, -.405], [gx * .5 - .05, .06, -.27], [-.12, .022, -.07 + gx * .5], [-.15, .006, gx * .25]]) pts.push(mount.localToWorld(V(x, y, z)));
      const curve = new THREE.CatmullRomCurve3(pts.map(p => rig.worldToLocal(p)));
      rig.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, .0055, 8), rubber));
    }
    const grommet = new THREE.Mesh(new THREE.CylinderGeometry(.018, .02, .012, 16), rubber);
    grommet.position.copy(rig.worldToLocal(mount.localToWorld(V(-.15, .003, 0)))); rig.add(grommet);
  }
  const lensWorld = housing.localToWorld(V(0, .2, .42)).clone();        // just in front of the window
  const housingWorld = housing.localToWorld(V(0, .2, 0)).clone();
  // plate-reading lens: centre on the window and optical axis (the push-in before the feed ends on it)
  const plateLens = housing.localToWorld(V(.036, CAM.CY - .004, CAM.Z1 + .006)).clone();
  const plateAxis = housing.localToWorld(V(.036, CAM.CY - .004, CAM.Z1 + 1)).sub(plateLens).normalize();

  /* ---------- post-processing ---------- */
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isLow ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 5, aperture: .0004, maxblur: .016 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  // phone GPUs can shade a few sub-pixel fragments (tiny cars, lamps seen from 250 m) as NaN / Inf: bloom grows each one
  // into blocks and the camera motion blur smears them into dark shards, so the frame is sanitised before both
  const sanitize = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        if (any(isnan(c)) || any(isinf(c))) c = vec4(0., 0., 0., 1.);
        gl_FragColor = vec4(min(max(c.rgb, vec3(0.)), vec3(64.)), 1.);
      }`,
  });
  composer.addPass(sanitize);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .45, .45, 1.35);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFeed: { value: 0 }, uFlash: { value: 0 }, uVig: { value: .9 }, uRes: { value: new THREE.Vector2(1, 1) }, uVel: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime, uFeed, uFlash, uVig; uniform vec2 uRes, uVel; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      vec3 fin(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.) : min(max(c, vec3(0.)), vec3(64.)); }
      void main(){
        vec2 uv = vUv; vec2 cc = uv - .5;
        // feed: slight barrel distortion + chromatic fringe
        float k = uFeed * .06; uv = .5 + cc * (1. + k * dot(cc, cc));
        vec2 off = cc * (.0012 + uFeed * .0025);
        vec3 c = fin(vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b));
        // camera motion blur (180° shutter) on fast moves only
        float vl = length(uVel);
        if (vl > .0006) {
          vec3 acc = vec3(0.);
          for (int i = 0; i < 9; i++) acc += fin(texture2D(tDiffuse, uv + uVel * (float(i) / 8. - .5)).rgb);
          c = mix(c, acc / 9., smoothstep(.0006, .004, vl));
        }
        // feed grade: lifted blacks, slightly desaturated, cold
        float l = dot(c, vec3(.299,.587,.114));
        vec3 feed = mix(vec3(l), c, .55) * vec3(.94, 1., 1.04) + .012;
        float line = .985 + .015 * sin(uv.y * uRes.y * 1.4 + uTime * 6.);
        feed *= line;
        c = mix(c, feed, uFeed);
        // grain
        float g = h(uv * uRes + fract(uTime * 13.7) * 91.) - .5;
        c += g * (.022 + uFeed * .05);
        // vignette
        float v = smoothstep(.95, .25, length(cc * vec2(1., .85)));
        c *= mix(1., v, uVig * (.45 + uFeed * .35));
        c = mix(c, vec3(1.), uFlash);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  /* ---------- sizing ---------- */
  let W = 1, H = 1, aspect = 1;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    // mobile browsers fire resize when their toolbars slide: reallocating the buffers then flashes black tiles
    if (w === W && h === H) return;
    W = w; H = h; aspect = W / H;
    renderer.setSize(W, H, false); composer.setSize(W, H);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    grade.uniforms.uRes.value.set(W * renderer.getPixelRatio(), H * renderer.getPixelRatio());
  }
  resize();

  /* ---------- choreography ---------- */
  const carX = p => -76 + 98 * p;           // hero car moves with scroll
  const CAR_Z = ROAD.laneS1;
  const tmpA = V(0, 0, 0), tmpB = V(0, 0, 0), up = V(0, 0, -1);
  const portrait = () => aspect < 0.9;
  // where the frame centres relative to the hero car: on portrait screens the car sits in the upper third
  // (a fixed share of the visible height at that altitude), clear of the captions at the bottom
  const lead = alt => (portrait() ? -.3 * alt * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)) : 1.2);
  const closeAlt = () => (portrait() ? 16.5 : 10.5);
  const fovDeg = 35;

  function nadirAltitudeToFit() {
    // altitude that keeps the frame inside the photo (cover)
    const t = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
    const rot = portrait();
    const visH = rot ? GW * .82 : GH * .92; // along screen-vertical
    const visW = rot ? GH * .92 : GW * .92;
    return Math.min(visH / (2 * t), visW / (2 * t * aspect));
  }

  const shot = { pos: V(), look: V(), up: V(0, 0, -1), fov: fovDeg, roll: 0 };
  // top-down shot on the ANPR unit: high enough to hold the whole unit and its logo
  const topDist = () => (portrait() ? 2.35 : 1.6);
  // ...and framed clear of the captions: higher up on phones (caption at the bottom), right of the text on wide screens.
  // Moves camera and target together, by a share of the frame visible at the target's distance.
  const offR = V(), offU = V(), offF = V();
  function frameOffset(w) {
    if (w <= 0) return;
    offF.copy(shot.look).sub(shot.pos); const d = offF.length(); offF.divideScalar(d);
    offR.crossVectors(offF, shot.up).normalize(); offU.crossVectors(offR, offF);
    const visH = 2 * d * Math.tan(THREE.MathUtils.degToRad(shot.fov / 2)), visW = visH * aspect;
    const sx = (portrait() ? 0 : .15 * visW) * w, sy = (portrait() ? .16 * visH : 0) * w;
    shot.pos.addScaledVector(offR, -sx).addScaledVector(offU, -sy);
    shot.look.addScaledVector(offR, -sx).addScaledVector(offU, -sy);
  }

  function computeShot(p, time) {
    const cx = carX(p);
    const hStart = nadirAltitudeToFit();
    const startAngle = portrait() ? 1 : 0;                       // 0 = north up, 1 = heading up
    // rotate the frame so the car heads "up" while descending
    const rotT = startAngle === 1 ? 1 : easeIO(range(p, .12, .40));
    const ang = lerp(0, -Math.PI / 2, rotT);
    shot.up.set(Math.sin(-ang), 0, -Math.cos(ang));             // (0,0,-1) → (1,0,0)
    shot.fov = fovDeg;
    shot.roll = 0;

    if (p < .46) {
      // A — nadir: frame from city to car
      const a = easeIO(range(p, .04, .30));
      const b = easeIO(range(p, .28, .46));
      const alt = lerp(lerp(hStart, 34, a), closeAlt(), b);
      const focusX = lerp(lerp(-8, cx + (portrait() ? lead(alt) : 6), a), cx + lead(alt), b);
      const focusZ = lerp(lerp(-.7, CAR_Z, a), CAR_Z, b);
      shot.pos.set(focusX, alt, focusZ);
      shot.look.set(focusX, 0, focusZ);
      // drone hover: position drift scaled with altitude, gimbal roll drift, a gentle bank while yawing
      const sway = (1 - b * .6) * .0032 * alt;
      shot.pos.x += wob(time * .31, 1) * sway; shot.pos.z += wob(time * .27, 7) * sway;
      shot.pos.y += wob(time * .23, 4) * sway * .6;
      shot.roll = wob(time * .21, 3) * .006 + (startAngle === 1 ? 0 : Math.sin(Math.PI * rotT) * .045);
    } else if (p < .64) {
      // B — rush ahead to the checkpoint (nadir), descend onto the ANPR camera, orbit to its front, push into the lens
      const t = range(p, .46, .64);
      const H = housingWorld;
      const startX = carX(.46) + lead(closeAlt());
      let still = 0;                                              // 1 = locked on the lens (no hover)
      if (t < .4) {
        const e = easeIO(t / .4);
        const alt = lerp(closeAlt(), 8.8, e) + 6 * Math.sin(Math.PI * e);
        shot.pos.set(lerp(startX, H.x - .25, e), alt, lerp(CAR_Z, H.z, e));
        shot.look.set(shot.pos.x, 0, shot.pos.z);
        shot.up.set(1, 0, 0);
      } else if (t < .6) {
        const e = easeIO((t - .4) / .2);
        const alt = lerp(8.8, H.y + topDist(), e);
        shot.pos.set(H.x - .25 * (1 - e) - .12 * e, alt, H.z);
        shot.look.set(shot.pos.x, H.y, H.z);
        const phi = Math.PI * e;                                  // turn around: the lens ends up pointing to the top of the frame
        shot.up.set(Math.cos(phi), 0, Math.sin(phi));
        frameOffset(e);
      } else {
        const u = range(t, .6, 1);
        const e1 = easeIO(range(u, 0, .55));                      // orbit from above to a front three-quarter view
        const e2 = easeIO(range(u, .72, 1));                      // then push into the plate-reading lens
        // front = −X (towards the traffic), logo side = +Z; almost level with the window, which is pitched down
        const front = tmpA.set(-.86, portrait() ? .14 : .1, portrait() ? .42 : .5).normalize();
        const dir = tmpB.set(0, 1, 0).lerp(front, e1).normalize();
        shot.pos.copy(H).addScaledVector(dir, lerp(topDist(), portrait() ? 2.15 : 1.05, e1));
        shot.pos.x -= .12 * (1 - e1);
        // aim between the centre and the front face: lenses, IR array and side logo in one frame
        shot.look.copy(H); shot.look.x -= .12 + .08 * e1; shot.look.y -= .03 * e1;
        shot.up.set(-1, 0, 0).lerp(tmpA.set(0, 1, 0), ease(range(e1, 0, .6))).normalize();
        shot.fov = fovDeg;
        frameOffset(1 - e2);
        if (e2 > 0) {
          shot.pos.lerp(tmpA.copy(plateLens).addScaledVector(plateAxis, .06), e2);
          shot.look.lerp(plateLens, e2);
          shot.fov = lerp(fovDeg, 28, e2);
        }
        still = e2;
      }
      const hover = (1 - ease(range(t, .55, .9)) * .75) * (1 - still);
      shot.pos.x += wob(time * .6, 2) * .03 * hover; shot.pos.z += wob(time * .5, 9) * .03 * hover; shot.pos.y += wob(time * .45, 5) * .015 * hover;
      shot.roll = wob(time * .4, 6) * .01 * hover + (t > .4 && t < .6 ? Math.sin(Math.PI * (t - .4) / .2) * .04 : 0);
    } else {
      // C — through the lens: ANPR feed (fixed mount, slow optical zoom)
      shot.pos.copy(lensWorld);
      shot.look.set(POLE.x - 22, .4, CAR_Z + .25);
      // the pole sways a hair in the wind
      shot.look.y += wob(time * 1.3, 8) * .012; shot.look.z += wob(time * 1.1, 2) * .01;
      shot.up.set(0, 1, 0);
      shot.fov = lerp(24, 18.5, easeIO(range(p, .64, .84)));
    }
  }

  /* ---------- per-frame ---------- */
  let progress = 0, smoothP = 0, running = false, raf = 0, lastT = performance.now(), clockT = 0;
  const hudState = { p: 0, phase: 'aerial', carBox: null, plateBox: null, carScreen: null, visible: false };
  const proj = V();
  const prevVP = new THREE.Matrix4();

  function projectBox(obj, pad = 0) {
    const box = new THREE.Box3().setFromObject(obj);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
    for (let i = 0; i < 8; i++) {
      proj.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      if (proj.z > 1) behind = true;
      const sx = (proj.x * .5 + .5) * W, sy = (-proj.y * .5 + .5) * H;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    return behind ? null : { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }

  function update(dt) {
    clockT += dt;
    smoothP += (progress - smoothP) * Math.min(1, dt * 7);
    if (Math.abs(progress - smoothP) < 1e-5) smoothP = progress;
    const p = smoothP;

    // hero car
    const hx = carX(p);
    const travelled = hx - hero.group.position.x;
    hero.group.position.set(hx, 0, CAR_Z);
    for (const w of hero.wheels) w.rotation.x -= travelled / .34;
    // traffic loops (time-based, keeps the city alive)
    traffic.forEach((c, i) => {
      const d = c.def; const span = GW + 40;
      const s = ((clockT * d.speed + d.offset) % span);
      const x = d.dir > 0 ? -span / 2 + s : span / 2 - s;
      const dx = x - c.group.position.x;
      c.group.position.set(x, 0, d.lane);
      if (Math.abs(dx) < 5) for (const w of c.wheels) w.rotation.x -= Math.abs(dx) / .34;
    });
    // headlight uniforms
    const cars = groundU.uCars.value;
    cars[0].set(hx, CAR_Z, 1, 1);
    traffic.forEach((c, i) => { if (i + 1 < MAX_CARS) cars[i + 1].set(c.group.position.x, c.def.lane, c.def.dir, 1); });

    city.update(clockT);
    hero.driver.update(clockT);
    computeShot(p, clockT);
    // high aerial shots = the original photo; below ~70 m the 3D city (trees, planted median, lamps…) dissolves in,
    // so the close shots stay crisp instead of showing a magnified photo
    const reveal = Math.max(ease(range(p, .462, .495)), ease(clamp((70 - shot.pos.y) / 28)));
    city.setReveal(reveal); groundU.uReveal.value = reveal; haloMat.opacity = .55 * reveal; zebra.visible = reveal > .5;
    if (window.__cam) { const c = window.__cam; shot.pos.set(...c.pos); shot.look.set(...c.look); shot.up.set(0, 1, 0); shot.fov = c.fov || 40; shot.roll = 0; }
    updateLampPool(tmpB.copy(shot.look).lerp(hero.group.position, .5));
    camera.position.copy(shot.pos);
    camera.up.copy(shot.up);
    camera.lookAt(shot.look);
    if (shot.roll) camera.rotateZ(shot.roll);
    camera.updateMatrixWorld();
    if (Math.abs(camera.fov - shot.fov) > .01) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
    // near plane tight when close to the housing; in the aerial shots it scales with the altitude,
    // which keeps the depth precision high enough for mobile GPUs
    const near = p > .5 ? .02 : Math.max(.3, Math.round(shot.pos.y * .02 * 10) / 10);
    if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }

    // LOD + detail by altitude
    const alt = camera.position.y;
    groundU.uLod1.value = 1 - ease(clamp((alt - 55) / 60));
    groundU.uDetail.value = 1 - ease(clamp((alt - 12) / 80));
    groundU.uCamPos.value.copy(camera.position);
    const fogFar = p < .46 ? 2000 : lerp(2000, 150, ease(range(p, .46, .56)));
    groundU.uFogNear.value = fogFar * .35; groundU.uFogFar.value = fogFar;
    scene.fog.near = fogFar * .35; scene.fog.far = fogFar;

    // depth of field around the camera housing
    const dofW = ease(range(p, .53, .57)) * (1 - ease(range(p, .638, .642)));
    bokeh.enabled = !isLow && dofW > .01;
    if (bokeh.enabled) {
      bokeh.uniforms.focus.value = camera.position.distanceTo(shot.look);
      bokeh.uniforms.aperture.value = .006 * dofW;
    }

    // grading
    const feed = ease(range(p, .638, .645));
    grade.uniforms.uFeed.value = feed;
    grade.uniforms.uTime.value = clockT;
    // screen-space velocity of what the camera looks at → motion blur vector
    {
      proj.copy(shot.look).applyMatrix4(prevVP);
      const cur = tmpA.copy(shot.look).project(camera);
      const k = dt > 0 ? (1 / 60) / Math.max(dt, 1 / 240) * .3 : 0;
      const vx = (cur.x - proj.x) * .5 * k, vy = (cur.y - proj.y) * .5 * k;
      const vlen = Math.hypot(vx, vy), cap = .02;
      grade.uniforms.uVel.value.set(vx, vy).multiplyScalar(vlen > cap ? cap / vlen : 1).multiplyScalar(p > .64 ? 0 : 1);
      prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    }
    const flash = Math.max(0, 1 - Math.abs(p - .641) / .005);
    grade.uniforms.uFlash.value = ease(flash) * .9;
    bloom.strength = lerp(.45, .8, feed); bloom.threshold = lerp(1.35, .92, feed);

    // HUD data
    hudState.p = p;
    hudState.phase = p < .46 ? 'aerial' : p < .64 ? 'approach' : 'feed';
    hudState.carBox = projectBox(hero.group.children[0], 6);
    hudState.plateBox = hero.plates ? projectBox(hero.plates.front, 3) : null;
    proj.copy(housingWorld).project(camera);
    hudState.pole = proj.z < 1 ? { x: (proj.x * .5 + .5) * W, y: (-proj.y * .5 + .5) * H } : null;
    hudState.time = clockT;
  }

  function frame(now) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    update(dt);
    composer.render(dt);
    onFrame && onFrame(hudState);
    raf = requestAnimationFrame(frame);
  }

  let onFrame = null;
  return {
    resize,
    setProgress(p) { progress = clamp(p); },
    jump(p) { progress = smoothP = clamp(p); },
    start() { if (running) return; running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    onFrame(fn) { onFrame = fn; },
    renderOnce() { update(0); composer.render(0); onFrame && onFrame(hudState); },
    plate: PLATE,
    plateCanvas: plateTex.image,
    debug: { scene, camera, hero, housing, rig, renderer, composer, housingWorld, lensWorld },
  };
}

/* ------------------------------------------------------------------ */
function makePlateTexture(renderer) {
  const c = document.createElement('canvas'); c.width = 1040; c.height = 220;
  const g = c.getContext('2d');
  const r = 16;
  g.fillStyle = '#f4f5f2'; roundRect(g, 0, 0, 1040, 220, r); g.fill();
  g.fillStyle = '#1b3f9a'; roundRect(g, 0, 0, 104, 220, r, [1, 0, 0, 1]); g.fill(); roundRect(g, 936, 0, 104, 220, r, [0, 1, 1, 0]); g.fill();
  // EU stars + I
  g.fillStyle = '#ffd200';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.arc(52 + Math.cos(a) * 26, 70 + Math.sin(a) * 26, 4.2, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; g.font = '700 64px "Inter Tight", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('I', 52, 186);
  g.font = '600 40px Arial'; g.fillText('26', 988, 196);
  g.strokeStyle = '#ffd200'; g.lineWidth = 5; g.beginPath(); g.arc(988, 78, 30, 0, 7); g.stroke();
  g.fillStyle = '#121418';
  g.save(); g.translate(520, 118); g.scale(.86, 1);
  g.font = '600 168px "Inter Tight", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(PLATE, 0, 6, 900);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; roundRect(g, 2, 2, 1036, 216, r); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
/* ------------------------------------------------------------------ */
/*  ANPR camera: powder-coated aluminium body, sunshield on standoffs,  */
/*  front window with coated plate lens, context lens and IR LEDs,      */
/*  rear cap with glands, tilt bracket. Origin = tilt pivot.            */
/* ------------------------------------------------------------------ */
const CAM = { W: .2, H: .15, Z0: -.3, Z1: .32, CY: .2 };
function roundedRect(w, h, r, path = new THREE.Shape()) {
  const x = -w / 2, y = -h / 2;
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  return path;
}
function noiseTexture(size, lo, hi, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  // two octaves of value noise: soft mottling of the powder coat + fine orange-peel grain
  const cell = 16, grid = Array.from({ length: (size / cell + 1) ** 2 }, Math.random);
  const at = (i, j) => grid[(j % (size / cell)) * (size / cell + 1) + (i % (size / cell))];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const s = u * u * (3 - 2 * u), t = v * v * (3 - 2 * v);
    const n = (at(i, j) * (1 - s) + at(i + 1, j) * s) * (1 - t) + (at(i, j + 1) * (1 - s) + at(i + 1, j + 1) * s) * t;
    const val = lo + (hi - lo) * (n * .45 + Math.random() * .55);
    const k = (y * size + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = val * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat);
  return tex;
}
function buildAnprCamera(renderer) {
  const { W, H, Z0, Z1, CY } = CAM;
  const cam = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); cam.add(m); return m; };
  const mottle = noiseTexture(256, .97, 1, 3); mottle.colorSpace = THREE.SRGBColorSpace;
  const powder = new THREE.MeshPhysicalMaterial({ color: 0xe6e8ea, map: mottle, roughness: 1, roughnessMap: noiseTexture(256, .4, .52, 14), metalness: 0, clearcoat: .3, clearcoatRoughness: .32, envMapIntensity: 1.1 });
  const shieldMat = powder.clone(); shieldMat.color.set(0xdfe2e5);
  const satin = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: .42, metalness: .25 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: .9, roughness: .3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x070809, roughness: .55 });

  // body: extruded rounded section with real bevels (catches the lamp light on every edge)
  const bev = .007;
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(W - 2 * bev, H - 2 * bev, .024), { depth: Z1 - Z0 - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 10 });
  bodyGeo.translate(0, CY, Z0 + bev);
  add(bodyGeo, powder);

  // front: satin bezel, dark backplate, plate-reading lens, context lens, IR LED array, window glass
  const bezelShape = roundedRect(W - .01, H - .01, .02); bezelShape.holes.push(roundedRect(W - .036, H - .036, .01, new THREE.Path()));
  const bezelGeo = new THREE.ExtrudeGeometry(bezelShape, { depth: .009, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 2, curveSegments: 8 });
  add(bezelGeo, satin, 0, CY, Z1 - .002);
  add(new THREE.ShapeGeometry(roundedRect(W - .034, H - .034, .01)), new THREE.MeshStandardMaterial({ color: 0x050607, roughness: .7 }), 0, CY, Z1 + .0008);
  const lensCoat = new THREE.MeshPhysicalMaterial({ color: 0x0a0c16, metalness: .3, roughness: .06, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [260, 620], envMapIntensity: 2.2 });
  const disc = (r, h, mat, x, y, z) => { const m = add(new THREE.CylinderGeometry(r, r, h, 36), mat, x, y, z); m.rotation.x = Math.PI / 2; return m; };
  disc(.034, .004, steel, .036, CY - .004, Z1 + .002);
  disc(.03, .0045, black, .036, CY - .004, Z1 + .0025);
  disc(.023, .005, lensCoat, .036, CY - .004, Z1 + .003);
  disc(.014, .004, steel, -.056, CY + .027, Z1 + .002);
  disc(.0095, .005, lensCoat, -.056, CY + .027, Z1 + .0028);
  {
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x1a0606, roughness: .3, emissive: 0x9a1408, emissiveIntensity: 1.1 });
    const led = new THREE.SphereGeometry(.0042, 10, 6); led.scale(1, 1, .45);
    const leds = new THREE.InstancedMesh(led, ledMat, 12); const m = new THREE.Matrix4(); let k = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { m.makeTranslation(-.078 + i * .0145, CY - .036 + j * .0135, Z1 + .002); leds.setMatrixAt(k++, m); }
    cam.add(leds);
  }
  // window: reflections only (additive), so the lens stays visible behind it
  add(new THREE.ShapeGeometry(roundedRect(W - .034, H - .034, .01)), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: .025, clearcoat: 1, envMapIntensity: 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0, CY, Z1 + .0062);

  // sunshield: thin folded sheet with side skirts, on four standoffs, overhanging the window
  const TOP = CY + H / 2 + .016, SW = .244, t = .0045, sk = .052, r1 = .012, r2 = .0075;
  const sec = new THREE.Shape();
  sec.moveTo(-SW / 2, TOP - sk); sec.lineTo(-SW / 2, TOP + t - r1); sec.quadraticCurveTo(-SW / 2, TOP + t, -SW / 2 + r1, TOP + t);
  sec.lineTo(SW / 2 - r1, TOP + t); sec.quadraticCurveTo(SW / 2, TOP + t, SW / 2, TOP + t - r1); sec.lineTo(SW / 2, TOP - sk);
  sec.lineTo(SW / 2 - t, TOP - sk); sec.lineTo(SW / 2 - t, TOP - r2); sec.quadraticCurveTo(SW / 2 - t, TOP, SW / 2 - t - r2, TOP);
  sec.lineTo(-SW / 2 + t + r2, TOP); sec.quadraticCurveTo(-SW / 2 + t, TOP, -SW / 2 + t, TOP - r2); sec.lineTo(-SW / 2 + t, TOP - sk);
  const shieldGeo = new THREE.ExtrudeGeometry(sec, { depth: .7, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0012, bevelSegments: 2, curveSegments: 6 });
  shieldGeo.translate(0, 0, -.315);
  add(shieldGeo, shieldMat);
  for (const x of [-.062, .062]) for (const z of [-.2, .21]) {
    add(new THREE.CylinderGeometry(.007, .007, TOP - (CY + H / 2), 12), steel, x, (TOP + CY + H / 2) / 2, z);
    add(new THREE.CylinderGeometry(.0065, .0065, .003, 16), steel, x, TOP + t + .0015, z);
  }

  // rear cap: screwed plate, two cable glands, status LED, rating plate
  const capGeo = new THREE.ExtrudeGeometry(roundedRect(W - .028, H - .028, .016), { depth: .004, bevelEnabled: false, curveSegments: 8 });
  add(capGeo, satin, 0, CY, Z0 - .004);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) disc(.0045, .003, steel, sx * (W / 2 - .028), CY + sy * (H / 2 - .028), Z0 - .0055);
  for (const gx of [-.03, .03]) {
    disc(.012, .01, steel, gx, CY - .035, Z0 - .009).geometry = new THREE.CylinderGeometry(.012, .012, .01, 6);
    disc(.0085, .014, black, gx, CY - .035, Z0 - .02);
  }
  add(new THREE.SphereGeometry(.0028, 10, 8), new THREE.MeshStandardMaterial({ color: 0x062a10, emissive: 0x2cff6a, emissiveIntensity: 2.2 }), .05, CY + .042, Z0 - .0045);
  const plate = add(new THREE.PlaneGeometry(.07, .028), new THREE.MeshStandardMaterial({ color: 0x7d8288, metalness: .45, roughness: .55 }), -.01, CY + .03, Z0 - .0042);
  plate.rotation.y = Math.PI;

  // tilt bracket under the body: plate, two ears, through-bolt with knobs (pivot at the origin)
  add(new THREE.BoxGeometry(.09, .01, .18), steel, 0, CY - H / 2 - .005, 0);
  for (const x of [-.039, .039]) add(new THREE.BoxGeometry(.006, .08, .05), steel, x, (CY - H / 2 + .045) / 2, 0);
  const bolt = add(new THREE.CylinderGeometry(.008, .008, .096, 12), steel, 0, .045, 0); bolt.rotation.z = Math.PI / 2;
  for (const x of [-.05, .05]) { const k = add(new THREE.CylinderGeometry(.015, .015, .009, 8), black, x, .045, 0); k.rotation.z = Math.PI / 2; }

  // HYPNOS logo printed on the sunshield and on the south side of the body
  const logo = new THREE.MeshStandardMaterial({ map: makeLogoTexture(renderer), transparent: true, roughness: .4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const top = add(new THREE.PlaneGeometry(.36, .36 / LOGO_ASPECT), logo, 0, TOP + t + .0022, .03);
  top.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  const side = add(new THREE.PlaneGeometry(.22, .22 / LOGO_ASPECT), logo, W / 2 + .0006, CY, .02);
  side.rotation.y = Math.PI / 2;
  return cam;
}

// new HYPNOS lockup: faceted H mark + wordmark with the orange O ring (same paths as #hmark / #hword in index.html)
const HMARK = ['M256 356L177 356L177 563L118 564L116 524L13 622L256 622Z', 'M177 90L177 268L372 268L374 462L437 527L437 210L230 210L230 145Z', 'M512 73L512 616L374 478L374 622L627 622L627 187Z', 'M106 0L230 128L230 0Z', 'M91 0L0 0L0 616L116 508L116 27Z', 'M627 170L627 0L399 0L399 58L513 58Z'];
const HWORD = ['M0 9H14V31H54.5V9H68V64H54.5V41.5H14V70.4L0 61.1Z', 'M63.9 9H79.2L99.4 30.6L121 9H136.7L106 39.7V70.5L92.5 61.5V39.4Z', 'M136.7 9H163.4A17.1 17.1 0 0 1 163.4 43.2H140.2V61.7L127.2 70.6V37.5L132 32.7H163.4A6.5 6.5 0 0 0 163.4 19.7H126Z', 'M183.8 64V18A9 9 0 0 1 192.8 9H196.3L232.7 47.8V9H244.5V57A7 7 0 0 1 237.5 64H232.7L195.8 24.5V64Z', 'M396 9V19.7H349.5A5.65 5.65 0 0 0 349.5 31H381A16.5 16.5 0 0 1 381 64H325.8L332.5 52.8H381A5.7 5.7 0 0 0 381 41.4H349.5A16.2 16.2 0 0 1 349.5 9Z'];
const HRING = [
  'M255.97 18.35L257.02 16.73L258.15 15.16L259.37 13.65L260.67 12.20L262.05 10.82L263.50 9.51L265.03 8.27L266.61 7.11L268.26 6.02L269.97 5.02L271.73 4.11L273.54 3.28L275.39 2.55L277.27 1.90L279.19 1.35L281.14 0.90L283.11 0.54L285.10 0.28L287.10 0.12L289.10 0.05L291.11 0.09L293.11 0.22L295.10 0.45L297.07 0.78L299.03 1.21L300.96 1.73L302.85 2.35L304.72 3.05L306.54 3.85L308.31 4.74L310.03 5.72L311.70 6.78L313.31 7.91L314.85 9.13L316.32 10.42L317.72 11.78L319.05 13.21L320.29 14.70L321.45 16.25L322.53 17.86L323.51 19.52L324.40 21.22L325.20 22.97L325.90 24.75L326.50 26.56L327.01 28.40L327.41 30.27L327.71 32.15L327.90 34.04L327.99 35.94L327.98 37.84L327.86 39.74L327.64 41.63L327.32 43.51L326.89 45.37L326.36 47.20L325.73 49.01L325.01 50.78L324.18 52.52L323.27 54.21L322.26 55.85L321.16 57.44L319.98 58.98L318.72 60.46L317.37 61.87L315.95 63.21L314.46 64.49L312.90 65.68L311.28 66.80L309.60 67.84L307.86 68.79L306.08 69.66L304.25 70.43L302.38 71.12L300.47 71.71L298.53 72.21L296.57 72.61L294.59 72.92L292.60 73.12L290.60 73.23L288.59 73.24L286.59 73.15L284.59 72.96L282.61 72.68L280.64 72.30L278.70 71.82L276.79 71.24L274.91 70.57L273.07 69.81L271.28 68.97L271.28 68.97L273.41 69.13L275.40 69.43L277.36 69.69L279.29 69.89L281.20 70.02L283.10 70.07L284.98 70.04L286.84 69.94L288.67 69.75L290.47 69.49L292.25 69.15L293.99 68.73L295.70 68.24L297.37 67.68L299.00 67.05L300.58 66.35L302.12 65.59L303.60 64.76L305.04 63.87L306.42 62.93L307.74 61.92L309.01 60.87L310.21 59.76L311.35 58.61L312.43 57.42L313.45 56.18L314.39 54.90L315.27 53.59L316.08 52.24L316.82 50.86L317.49 49.46L318.08 48.03L318.61 46.58L319.06 45.12L319.43 43.63L319.73 42.14L319.96 40.63L320.11 39.12L320.19 37.60L320.19 36.08L320.12 34.57L319.97 33.06L319.74 31.55L319.44 30.06L319.06 28.59L318.60 27.13L318.07 25.69L317.47 24.28L316.79 22.89L316.04 21.54L315.22 20.22L314.34 18.93L313.38 17.69L312.36 16.49L311.28 15.33L310.14 14.22L308.94 13.17L307.68 12.16L306.36 11.22L305.00 10.33L303.58 9.50L302.12 8.74L300.62 8.05L299.07 7.42L297.49 6.86L295.88 6.37L294.23 5.96L292.56 5.62L290.86 5.36L289.14 5.18L287.41 5.08L285.66 5.06L283.91 5.12L282.15 5.26L280.39 5.48L278.63 5.79L276.88 6.18L275.14 6.66L273.41 7.21L271.71 7.85L270.02 8.57L268.37 9.38L266.74 10.26L265.14 11.22L263.57 12.25L262.04 13.36L260.54 14.55L259.07 15.79L257.60 17.09L255.97 18.35Z',
  'M282.70 72.69L281.62 72.50L280.54 72.27L279.47 72.02L278.42 71.74L277.37 71.43L276.32 71.09L275.29 70.72L274.28 70.32L273.27 69.90L272.28 69.45L271.30 68.98L270.33 68.47L269.38 67.95L268.45 67.39L267.54 66.81L266.64 66.21L265.76 65.58L264.90 64.93L264.06 64.26L263.24 63.56L262.44 62.84L261.66 62.11L260.91 61.35L260.18 60.57L259.47 59.77L258.79 58.95L258.13 58.11L257.50 57.26L256.89 56.39L256.31 55.50L255.76 54.60L255.23 53.68L254.74 52.75L254.27 51.81L253.82 50.85L253.41 49.89L253.03 48.91L252.68 47.92L252.35 46.92L252.06 45.92L251.79 44.90L251.56 43.88L251.36 42.86L251.19 41.83L251.05 40.79L250.94 39.76L250.86 38.71L250.82 37.67L250.80 36.63L250.82 35.59L250.86 34.54L250.94 33.50L251.05 32.46L251.19 31.43L251.37 30.40L251.57 29.37L251.84 28.36L252.16 27.36L252.51 26.38L252.90 25.41L253.33 24.45L253.79 23.51L254.28 22.58L254.81 21.68L255.36 20.79L255.95 19.93L256.56 19.08L257.20 18.25L257.86 17.45L258.55 16.67L259.26 15.91L260.00 15.18L260.76 14.47L261.54 13.79L262.34 13.14L263.15 12.51L263.99 11.90L264.84 11.33L265.71 10.78L266.59 10.26L267.49 9.77L268.40 9.31L269.32 8.87L270.25 8.47L271.18 8.09L272.13 7.75L273.09 7.43L274.04 7.15L275.01 6.89L275.98 6.67L275.98 6.67L275.25 7.40L274.47 7.96L273.68 8.49L272.89 9.02L272.12 9.56L271.36 10.10L270.60 10.65L269.87 11.22L269.14 11.80L268.44 12.39L267.74 13.00L267.07 13.62L266.41 14.26L265.77 14.91L265.14 15.57L264.54 16.25L263.95 16.95L263.38 17.65L262.84 18.37L262.31 19.11L261.81 19.85L261.33 20.61L260.87 21.38L260.43 22.17L260.01 22.96L259.62 23.76L259.26 24.58L258.92 25.40L258.60 26.23L258.32 27.07L258.06 27.92L257.83 28.78L257.63 29.64L257.47 30.51L257.36 31.38L257.28 32.26L257.22 33.14L257.18 34.01L257.17 34.89L257.18 35.76L257.20 36.63L257.25 37.50L257.32 38.37L257.42 39.23L257.53 40.09L257.66 40.95L257.82 41.80L258.00 42.65L258.19 43.50L258.41 44.34L258.65 45.18L258.91 46.01L259.18 46.83L259.47 47.66L259.78 48.47L260.11 49.29L260.46 50.09L260.83 50.89L261.21 51.69L261.62 52.48L262.04 53.26L262.48 54.04L262.94 54.81L263.42 55.57L263.92 56.33L264.44 57.08L264.98 57.82L265.54 58.55L266.11 59.28L266.71 59.99L267.32 60.70L267.96 61.40L268.61 62.09L269.29 62.77L269.98 63.44L270.70 64.10L271.43 64.74L272.19 65.38L272.96 66.01L273.75 66.63L274.57 67.23L275.40 67.83L276.25 68.41L277.12 68.99L278.01 69.56L278.92 70.12L279.85 70.69L280.79 71.26L281.75 71.87L282.70 72.69Z',
];
const LOGO_ASPECT = 1180 / 256;
function makeLogoTexture(renderer) {
  const c = document.createElement('canvas'); c.width = 1180; c.height = 256; const g = c.getContext('2d');
  const ink = '#24282e';
  // mark: 627×622 units → 196 px tall
  g.save(); g.translate(24, 30); g.scale(196 / 622, 196 / 622); g.fillStyle = ink;
  for (const d of HMARK) g.fill(new Path2D(d));
  g.restore();
  // wordmark: letters 0.6× the mark height, baseline aligned with the mark's foot
  const s = 2.1;
  g.save(); g.translate(270, 226 - 64 * s); g.scale(s, s); g.fillStyle = ink;
  for (const d of HWORD) g.fill(new Path2D(d));
  // the O: orange ring (two crescents, gradient as in the site's #hy-ring)
  const ring = g.createLinearGradient(251, 0, 328, 73);
  [[0, '#ffa062'], [.45, '#f26a21'], [.8, '#d9501a'], [1, '#f68a46']].forEach(([o, col]) => ring.addColorStop(o, col));
  g.fillStyle = ring;
  for (const d of HRING) g.fill(new Path2D(d));
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// standard Italian CCTV notice (generic pictogram, no authority named)
function makeSignTexture(renderer) {
  const c = document.createElement('canvas'); c.width = 250; c.height = 350; const g = c.getContext('2d');
  g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, 250, 350);
  g.strokeStyle = '#1b1d20'; g.lineWidth = 6; g.strokeRect(9, 9, 232, 332);
  g.fillStyle = '#1b1d20'; g.textAlign = 'center';
  g.font = '800 30px "Inter Tight", Arial, sans-serif'; g.fillText('AREA', 125, 62);
  g.font = '800 23px "Inter Tight", Arial, sans-serif'; g.fillText('VIDEOSORVEGLIATA', 125, 92, 214);
  // camera pictogram: body, sunshield, bracket
  g.save(); g.translate(125, 190); g.rotate(-.18);
  roundRect(g, -62, -26, 112, 52, 8); g.fill();
  g.fillRect(-70, -36, 128, 8);
  g.beginPath(); g.moveTo(50, -18); g.lineTo(76, -30); g.lineTo(76, 30); g.lineTo(50, 18); g.closePath(); g.fill();
  g.restore();
  g.fillRect(112, 220, 14, 46); g.fillRect(92, 262, 54, 10);
  g.font = '500 14px Arial, sans-serif'; g.fillStyle = '#3a3d42';
  g.fillText('La registrazione è effettuata', 125, 300); g.fillText('per la sicurezza stradale', 125, 318);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function roundRect(g, x, y, w, h, r, c = [1, 1, 1, 1]) {
  g.beginPath();
  g.moveTo(x + r * c[0], y);
  g.lineTo(x + w - r * c[1], y); c[1] ? g.quadraticCurveTo(x + w, y, x + w, y + r) : g.lineTo(x + w, y);
  g.lineTo(x + w, y + h - r * c[2]); c[2] ? g.quadraticCurveTo(x + w, y + h, x + w - r, y + h) : g.lineTo(x + w, y + h);
  g.lineTo(x + r * c[3], y + h); c[3] ? g.quadraticCurveTo(x, y + h, x, y + h - r) : g.lineTo(x, y + h);
  g.lineTo(x, y + r * c[0]); c[0] ? g.quadraticCurveTo(x, y, x + r, y) : g.lineTo(x, y);
  g.closePath();
}
