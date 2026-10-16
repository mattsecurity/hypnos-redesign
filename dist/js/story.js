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

  const [aerial, lod1, asph, env, carGltf, camGltf, shadowTex, atlasImg, atlasN, driverTpl, medianTex] = await Promise.all([
    loadTex('assets/img/aerial.webp'),
    loadTex('assets/img/aerial-lod1.webp'),
    loadTex('assets/tex/asphalt_diff.jpg'),
    hdrLoader.loadAsync('assets/tex/rooftop_night_1k.hdr'),
    gltfLoader.loadAsync('assets/3d/sedan.glb'),
    gltfLoader.loadAsync('assets/3d/camera/camera.gltf'),
    loadTex('assets/3d/car-shadow.png'),
    loadTex('assets/3d/sedan-atlas.jpg'),
    loadTex('assets/3d/sedan-atlas-n.jpg', false),
    loadDriver(gltfLoader),
    loadTex('assets/tex/median-veg.webp'),
  ]);
  draco.dispose();
  env.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  asph.wrapS = asph.wrapT = THREE.RepeatWrapping;
  for (const t of [aerial, lod1]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }

  /* ---------- lights (match the blue-hour photo) ---------- */
  scene.add(new THREE.HemisphereLight(0x6f86b8, 0x2a2420, 0.55));
  const key = new THREE.DirectionalLight(0xffd7a8, 0.9); key.position.set(-20, 40, 18); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.6); rim.position.set(30, 25, -30); scene.add(rim);

  /* ---------- ground: photo LODs + asphalt micro-detail + analytic headlights ---------- */
  const MAX_CARS = 6;
  const groundU = {
    tLod0: { value: aerial }, tLod1: { value: lod1 }, tDetail: { value: asph },
    uLod1: { value: 0 }, uDetail: { value: 0 }, uCars: { value: Array.from({ length: MAX_CARS }, () => new THREE.Vector4(9999, 0, 1, 0)) },
    uReveal: { value: 1 }, uCamPos: { value: new THREE.Vector3() }, uFogColor: { value: new THREE.Color(0x121b2a) }, uFogNear: { value: 70 }, uFogFar: { value: 260 },
  };
  const groundMat = new THREE.ShaderMaterial({
    uniforms: groundU,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tLod0, tLod1, tDetail; uniform float uLod1, uDetail, uReveal;
      uniform vec4 uCars[${MAX_CARS}]; uniform vec3 uCamPos, uFogColor; uniform float uFogNear, uFogFar;
      varying vec3 vW;
      float lum(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
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
        float road = (smoothstep(${ROAD.north[0].toFixed(2)}, ${(ROAD.north[0] + .3).toFixed(2)}, p.y) * (1. - smoothstep(${(ROAD.north[1] - .2).toFixed(2)}, ${ROAD.north[1].toFixed(2)}, p.y)))
                   + (smoothstep(${ROAD.south[0].toFixed(2)}, ${(ROAD.south[0] + .2).toFixed(2)}, p.y) * (1. - smoothstep(${(ROAD.south[1] - .3).toFixed(2)}, ${ROAD.south[1].toFixed(2)}, p.y)));
        // close up: photo markings are replaced by crisp geometry → use a de-marked (blurred) photo on asphalt
        c = mix(c, cb, road * uDetail);
        vec3 d = texture2D(tDetail, p / 3.2).rgb;
        vec3 d2 = texture2D(tDetail, p / 11.0 + .37).rgb;
        float dl = lum(d) / .19 * .75 + lum(d2) / .19 * .25;
        c *= mix(1., clamp(dl, .45, 1.8), uDetail * mix(.25, .9, road));
        // sidewalks: the photo's trees are replaced by 3D ones → turn their imprint into shaded paving, add slab joints
        float side = smoothstep(-22.6, -22.3, p.y) * (1. - smoothstep(-10.7, -10.45, p.y)) + smoothstep(8.95, 9.2, p.y) * (1. - smoothstep(21.1, 21.4, p.y));
        float gr = clamp((cb.g - max(cb.r, cb.b)) * 18. + .15, 0., 1.);
        c = mix(c, vec3(lum(cb)) * vec3(.62, .6, .58) * mix(.9, 1.15, dl), side * gr * uDetail * uReveal);
        float jx = smoothstep(.46, .5, abs(fract(p.x / .9) - .5)), jz = smoothstep(.46, .5, abs(fract(p.y / .6 + .5 * step(.5, fract(p.x / 1.8))) - .5));
        c *= 1. - side * uDetail * uReveal * .22 * max(jx, jz);
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
          add += car.w * (vec3(1., .93, .82) * (beam * .55 + spots * .35) + vec3(.9, .05, .03) * tail * .25);
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
  // dark surround beyond the photo
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: 0x141b27 }));
  surround.rotation.x = -Math.PI / 2; surround.position.y = -0.05; scene.add(surround);

  /* ---------- road furniture: curbs, crisp markings ---------- */
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: .85 });
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
  for (const z of LAMP_Z) for (const x of LAMPS_X) {
    const side = z < 0 ? 1 : -1; // heads lean towards the road
    const p = new THREE.Mesh(poleGeo, lampPole); p.position.set(x, 0, z); scene.add(p);
    const h = new THREE.Mesh(headGeo, lampPole); h.position.set(x, 7.25, z + side * .25); scene.add(h);
    const g = new THREE.Mesh(glowGeo, lampGlow); g.position.set(x, 7.18, z + side * .25); scene.add(g);
    lampHeads.push(V(x, 7.0, z + side * .25));
  }
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
    const p = new THREE.Mesh(poleGeo, lampPole); p.position.set(xx, 0, z); scene.add(p);
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
  const galv = new THREE.MeshStandardMaterial({ color: 0xa3a8ad, metalness: .85, roughness: .42 });
  const POLE_H = 6.6;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.075, .1, POLE_H, 24), galv); pole.position.y = POLE_H / 2; rig.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.2, .22, .12, 24), galv); base.position.y = .06; rig.add(base);
  const footing = new THREE.Mesh(new THREE.BoxGeometry(.7, .2, .7), concrete); footing.position.y = .1; rig.add(footing);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.078, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), galv); cap.position.y = POLE_H; rig.add(cap);
  const ARM_L = 2.3;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(.045, .05, ARM_L, 16), galv); arm.rotation.x = Math.PI / 2; arm.position.set(0, POLE_H - .25, ARM_L / 2); rig.add(arm);
  const cabinet = new THREE.Mesh(new RoundedBoxGeometry(.32, .5, .2, 3, .03), new THREE.MeshStandardMaterial({ color: 0x8e9398, metalness: .5, roughness: .45 }));
  cabinet.position.set(-.2, 2.4, 0); rig.add(cabinet);

  const housing = new THREE.Group();
  const camModel = camGltf.scene;
  camModel.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material; m.envMapIntensity = 1.25;
    // new unit: clean powder-coated aluminium (the scan's texture is a weathered, plaster-like CCTV)
    m.map = null; m.color.set(0xb9bdc2); m.metalness = .35; m.roughness = .38;
    if (m.normalScale) m.normalScale.setScalar(.35);
    m.roughnessMap = null; m.metalnessMap = null;
  });
  camModel.scale.setScalar(1.35);
  housing.add(camModel);
  // IR illuminator beside the housing (local +Z = lens direction, +X = south side)
  const irBox = new THREE.Mesh(new RoundedBoxGeometry(.13, .11, .2, 3, .02), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: .4, roughness: .5 }));
  irBox.position.set(-.2, .2, .2); housing.add(irBox);
  const irLeds = new THREE.Mesh(new THREE.PlaneGeometry(.11, .085), new THREE.MeshStandardMaterial({ color: 0x150404, emissive: 0xff2a1a, emissiveIntensity: 1.8, map: makeLedTexture() }));
  irLeds.position.set(-.2, .2, .301); housing.add(irLeds);
  const irArm = new THREE.Mesh(new THREE.BoxGeometry(.12, .02, .05), new THREE.MeshStandardMaterial({ color: 0x8e9398, metalness: .6, roughness: .4 }));
  irArm.position.set(-.13, .1, .15); housing.add(irArm);
  // brand labels on the housing (side + top of the sunshield)
  const labelMat = new THREE.MeshStandardMaterial({ map: makeLabelTexture(), transparent: true, roughness: .5, color: 0x3a3f45 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(.2, .045), labelMat);
  label.position.set(.0865 * 1.35 + .003, .2, .02); label.rotation.y = Math.PI / 2; housing.add(label);
  const labelTop = new THREE.Mesh(new THREE.PlaneGeometry(.26, .058), labelMat);
  labelTop.position.set(0, .2613 * 1.35 + .004, .0); labelTop.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); housing.add(labelTop);
  // camera sits on top of the arm, looks west (−X) at incoming eastbound traffic, pitched down
  housing.rotation.order = 'YXZ';
  housing.rotation.y = -Math.PI / 2;
  housing.rotation.x = 0.2;
  const HOUSING_POS = V(0, POLE_H - .25 + .045, ARM_L - .3);
  housing.position.copy(HOUSING_POS);
  rig.add(housing);
  rig.updateMatrixWorld(true);
  const lensWorld = housing.localToWorld(V(0, .2, .42)).clone();        // just in front of the window
  const housingWorld = housing.localToWorld(V(0, .2, 0)).clone();

  /* ---------- post-processing ---------- */
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isLow ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 5, aperture: .0004, maxblur: .016 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .55, .5, .92);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFeed: { value: 0 }, uFlash: { value: 0 }, uVig: { value: .9 }, uRes: { value: new THREE.Vector2(1, 1) }, uVel: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime, uFeed, uFlash, uVig; uniform vec2 uRes, uVel; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv; vec2 cc = uv - .5;
        // feed: slight barrel distortion + chromatic fringe
        float k = uFeed * .06; uv = .5 + cc * (1. + k * dot(cc, cc));
        vec2 off = cc * (.0012 + uFeed * .0025);
        vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
        // camera motion blur (180° shutter) on fast moves only
        float vl = length(uVel);
        if (vl > .0006) {
          vec3 acc = vec3(0.);
          for (int i = 0; i < 9; i++) acc += texture2D(tDiffuse, uv + uVel * (float(i) / 8. - .5)).rgb;
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
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight; aspect = W / H;
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
  const lookOverShoulder = V(POLE.x - 26, 0, CAR_Z);

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
      const alt = lerp(lerp(hStart, 34, a), portrait() ? 13.5 : 10.5, b);
      const focusX = lerp(lerp(-8, cx + 6, a), cx + 1.2, b);
      const focusZ = lerp(lerp(-.7, CAR_Z, a), CAR_Z, b);
      shot.pos.set(focusX, alt, focusZ);
      shot.look.set(focusX, 0, focusZ);
      // drone hover: position drift scaled with altitude, gimbal roll drift, a gentle bank while yawing
      const sway = (1 - b * .6) * .0032 * alt;
      shot.pos.x += wob(time * .31, 1) * sway; shot.pos.z += wob(time * .27, 7) * sway;
      shot.pos.y += wob(time * .23, 4) * sway * .6;
      shot.roll = wob(time * .21, 3) * .006 + (startAngle === 1 ? 0 : Math.sin(Math.PI * rotT) * .045);
    } else if (p < .64) {
      // B — rush ahead to the checkpoint (nadir), descend onto the ANPR camera, swing behind it
      const t = range(p, .46, .64);
      const H = housingWorld;
      const startX = carX(.46) + 1.2;
      if (t < .4) {
        const e = easeIO(t / .4);
        const alt = lerp(portrait() ? 13.5 : 10.5, 8.8, e) + 6 * Math.sin(Math.PI * e);
        shot.pos.set(lerp(startX, H.x - .25, e), alt, lerp(CAR_Z, H.z, e));
        shot.look.set(shot.pos.x, 0, shot.pos.z);
        shot.up.set(1, 0, 0);
      } else if (t < .68) {
        const e = easeIO((t - .4) / .28);
        const alt = lerp(8.8, H.y + 1.25, e);
        shot.pos.set(H.x - .25 * (1 - e) - .12 * e, alt, H.z);
        shot.look.set(shot.pos.x, H.y, H.z);
        const phi = Math.PI * e;                                  // turn around to face the traffic
        shot.up.set(Math.cos(phi), 0, Math.sin(phi));
      } else {
        const e = easeIO((t - .68) / .32);
        const theta = lerp(0, 1.2, e);                            // polar angle from vertical
        const r = lerp(1.25, 1.0, e);
        const dir = tmpA.set(Math.sin(theta), Math.cos(theta), Math.sin(theta) * .12).normalize();
        shot.pos.copy(H).addScaledVector(dir, r);
        shot.pos.x -= .12 * (1 - e);
        const roadPt = tmpB.set(POLE.x - 16, 0, H.z + 1.1).lerp(H, .2);
        shot.look.copy(H).lerp(roadPt, ease(range(e, .15, 1)));
        shot.up.set(-1, 0, 0).lerp(V(0, 1, 0), ease(range(e, 0, .7))).normalize();
        shot.fov = lerp(fovDeg, 38, e);
      }
      const hover = 1 - ease(range(t, .55, .9)) * .75;
      shot.pos.x += wob(time * .6, 2) * .03 * hover; shot.pos.z += wob(time * .5, 9) * .03 * hover; shot.pos.y += wob(time * .45, 5) * .015 * hover;
      shot.roll = wob(time * .4, 6) * .01 * hover + (t > .4 && t < .68 ? Math.sin(Math.PI * (t - .4) / .28) * .04 : 0);
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
    // aerial shots = the original photo; the 3D city fades in as the camera rushes down to the checkpoint
    const reveal = ease(range(p, .462, .495));
    city.setReveal(reveal); groundU.uReveal.value = reveal; haloMat.opacity = .55 * reveal;
    hero.driver.update(clockT);
    computeShot(p, clockT);
    if (window.__cam) { const c = window.__cam; shot.pos.set(...c.pos); shot.look.set(...c.look); shot.up.set(0, 1, 0); shot.fov = c.fov || 40; shot.roll = 0; }
    updateLampPool(tmpB.copy(shot.look).lerp(hero.group.position, .5));
    camera.position.copy(shot.pos);
    camera.up.copy(shot.up);
    camera.lookAt(shot.look);
    if (shot.roll) camera.rotateZ(shot.roll);
    camera.updateMatrixWorld();
    if (Math.abs(camera.fov - shot.fov) > .01) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
    // near plane tight when close to the housing
    const near = p > .5 ? .02 : .3; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }

    // LOD + detail by altitude
    const alt = camera.position.y;
    groundU.uLod1.value = 1 - ease(clamp((alt - 55) / 60));
    groundU.uDetail.value = 1 - ease(clamp((alt - 6) / 40));
    groundU.uCamPos.value.copy(camera.position);
    const fogFar = p < .46 ? 2000 : lerp(2000, 150, ease(range(p, .46, .56)));
    groundU.uFogNear.value = fogFar * .35; groundU.uFogFar.value = fogFar;
    scene.fog.near = fogFar * .35; scene.fog.far = fogFar;

    // depth of field around the camera housing
    const dofW = ease(range(p, .53, .57)) * (1 - ease(range(p, .638, .642)));
    bokeh.enabled = !isLow && dofW > .01;
    if (bokeh.enabled) {
      bokeh.uniforms.focus.value = camera.position.distanceTo(housingWorld);
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
      const k = dt > 0 ? (1 / 60) / Math.max(dt, 1 / 240) * .5 : 0;
      const vx = (cur.x - proj.x) * .5 * k, vy = (cur.y - proj.y) * .5 * k;
      const vlen = Math.hypot(vx, vy), cap = .035;
      grade.uniforms.uVel.value.set(vx, vy).multiplyScalar(vlen > cap ? cap / vlen : 1).multiplyScalar(p > .64 ? 0 : 1);
      prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    }
    const flash = Math.max(0, 1 - Math.abs(p - .641) / .005);
    grade.uniforms.uFlash.value = ease(flash) * .9;
    bloom.strength = lerp(.55, .8, feed);

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
function makeLedTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 88; const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 128, 88);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { const gr = g.createRadialGradient(14 + x * 20, 14 + y * 20, 1, 14 + x * 20, 14 + y * 20, 8); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#300'); g.fillStyle = gr; g.beginPath(); g.arc(14 + x * 20, 14 + y * 20, 7, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeLabelTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 116; const g = c.getContext('2d');
  g.fillStyle = 'rgba(235,236,238,.92)';
  g.font = '700 70px "Inter Tight", Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('HYPNOS', 96, 62);
  // mini H mark
  g.strokeStyle = 'rgba(235,236,238,.92)'; g.lineWidth = 9; g.lineJoin = 'miter';
  g.beginPath(); const s = 2.6, ox = 6, oy = 18;
  [[10.5, 14], [10.5, 22.75], [3.5, 22.75], [3.5, 2.25], [10.5, 2.25], [10.5, 9.5], [20.5, 9.5], [20.5, 22.75], [28.5, 22.75], [28.5, 2.25], [22, 2.25]]
    .forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, ox + x * s, oy + y * s));
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
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
