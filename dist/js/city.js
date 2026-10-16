// HYPNOS — 3D city dressing aligned to the aerial photo:
// raised sidewalks with granite curbs, planted median (shrubs, roses, grass), tree rows with tree pits,
// front-row buildings with procedural Milanese facades (lit windows, shutters, shop fronts) and photo roofs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/*  Layout (metres, from the 0.135 m/px aerial)                        */
/* ------------------------------------------------------------------ */
export const CITY = {
  sidewalkN: [-22.6, -10.45], sidewalkS: [8.95, 21.4],
  treeZ: [-17.3, 14.4],
  facadeN: -22.6, facadeS: 21.4, depth: 13,
  // side-street mouths (x ranges) where sidewalks and buildings stop
  gapsN: [[-228, -221], [-162, -155], [-98.2, -93.4], [-37.6, -28.9], [30.6, 39.4], [94.8, 99.8], [158, 165], [222, 229]],
  gapsS: [[-227, -220], [-161, -154], [-97.6, -91.6], [-39.1, -29.8], [28.0, 37.8], [92.0, 98.0], [157, 164], [221, 228]],
  extent: 420,
};
const SIDEWALK_H = .15;

// deterministic random
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const inGaps = (x, gaps, pad = 0) => gaps.some(([a, b]) => x > a - pad && x < b + pad);
function spans(x0, x1, gaps) {
  const out = []; let a = x0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > a) out.push([a, Math.min(g0, x1)]); a = Math.max(a, g1); }
  if (a < x1) out.push([a, x1]);
  return out.filter(([p, q]) => q - p > .5);
}

/* ------------------------------------------------------------------ */
/*  Shared GLSL                                                         */
/* ------------------------------------------------------------------ */
const NOISE = /* glsl */`
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= .5; } return s; }
`;
// street-lamp light: warm sodium/LED mix, inverse-square with a soft core
const LAMP_GLSL = (n) => /* glsl */`
  uniform vec3 uLamps[${n}];
  uniform float uLampI;
  vec3 lampLight(vec3 p, vec3 N, float wrap){
    vec3 acc = vec3(0.);
    for (int i = 0; i < ${n}; i++){
      vec3 L = uLamps[i] - p; float d2 = dot(L, L); L *= inversesqrt(d2);
      float ndl = max((dot(N, L) + wrap) / (1. + wrap), 0.);
      acc += ndl / (d2 + 5.);
    }
    return acc * uLampI * vec3(1., .74, .46);
  }
`;

/* ------------------------------------------------------------------ */
/*  Vegetation atlas (canvas): tree leaves, shrub leaves, blossoms, grass */
/* ------------------------------------------------------------------ */
function makeVegetationAtlas() {
  const S = 512, T = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const R = rng(7);
  const leaf = (x, y, len, wid, ang, col, rib) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(wid, -len * .45, 0, -len); g.quadraticCurveTo(-wid, -len * .45, 0, 0);
    g.fillStyle = col; g.fill();
    if (rib) { g.strokeStyle = 'rgba(255,255,230,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -len * .9); g.stroke(); }
    g.restore();
  };
  const green = (h0, l0, l1) => `hsl(${h0 + R() * 26}, ${32 + R() * 26}%, ${l0 + R() * (l1 - l0)}%)`;
  // tile 0 — broadleaf cluster (plane / lime tree)
  g.save(); g.beginPath(); g.rect(0, 0, T, T); g.clip();
  for (let k = 0; k < 9; k++) {
    const ox = 40 + R() * 176, oy = 50 + R() * 170;
    for (let i = 0; i < 11; i++) {
      const a = R() * Math.PI * 2, d = 10 + R() * 34;
      leaf(ox + Math.cos(a) * d, oy + Math.sin(a) * d, 34 + R() * 26, 13 + R() * 9, a + Math.PI / 2 + (R() - .5) * .8, green(78, 16, 40), true);
    }
  }
  g.restore();
  // tile 1 — small dense shrub leaves (boxwood / laurel)
  g.save(); g.translate(T, 0); g.beginPath(); g.rect(0, 0, T, T); g.clip();
  for (let i = 0; i < 420; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 108;
    leaf(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 14 + R() * 12, 6 + R() * 5, R() * Math.PI * 2, green(84, 14, 36), false);
  }
  g.restore();
  // tile 2 — blossoms (white, tinted per instance) with a few leaves
  g.save(); g.translate(0, T); g.beginPath(); g.rect(0, 0, T, T); g.clip();
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 100; leaf(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 22, 9, R() * 6.3, green(90, 14, 26), false);
  }
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 84, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r, s = 16 + R() * 12;
    for (let k = 0; k < 7; k++) {
      const pa = k / 7 * Math.PI * 2 + R() * .4; const l = 255 - R() * 40;
      g.fillStyle = `rgb(${l},${l},${l - 6})`;
      g.beginPath(); g.ellipse(x + Math.cos(pa) * s * .45, y + Math.sin(pa) * s * .45, s * .45, s * .3, pa, 0, 7); g.fill();
    }
    const gr = g.createRadialGradient(x, y, 0, x, y, s * .5); gr.addColorStop(0, 'rgba(120,60,40,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, s * .5, 0, 7); g.fill();
  }
  g.restore();
  // tile 3 — grass tuft (vertical card)
  g.save(); g.translate(T, T); g.beginPath(); g.rect(0, 0, T, T); g.clip();
  for (let i = 0; i < 70; i++) {
    const x = 30 + R() * 196, h = 90 + R() * 150, bend = (R() - .5) * 70, w = 3 + R() * 4;
    g.beginPath(); g.moveTo(x - w, 256); g.quadraticCurveTo(x + bend * .3, 256 - h * .6, x + bend, 256 - h); g.quadraticCurveTo(x + bend * .3 + w * .4, 256 - h * .6, x + w, 256);
    g.fillStyle = green(70, 18, 40); g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}

function makeBarkTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  const R = rng(11);
  g.fillStyle = '#5b544b'; g.fillRect(0, 0, 128, 256);
  // plane-tree camouflage bark: patches of olive, cream, grey
  for (let i = 0; i < 160; i++) {
    const cols = ['#77705f', '#8d8a72', '#4a443c', '#a39d84', '#62604f'];
    g.fillStyle = cols[(R() * cols.length) | 0]; g.globalAlpha = .55;
    g.beginPath(); g.ellipse(R() * 128, R() * 256, 6 + R() * 18, 8 + R() * 26, R() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = .35; g.strokeStyle = '#2b2722';
  for (let i = 0; i < 40; i++) { g.lineWidth = .5 + R() * 1.2; g.beginPath(); const x = R() * 128; g.moveTo(x, R() * 256); g.lineTo(x + (R() - .5) * 8, R() * 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/* ------------------------------------------------------------------ */
export function buildCity({ scene, groundMat, ROAD, GW, lamps, isLow, sky, medianTex }) {
  const NL = lamps.length;
  const lampUniform = { value: lamps.map(v => v.clone()) };
  const timeU = { value: 0 };
  const lampI = { value: 15 };
  const R = rng(1234);
  const group = new THREE.Group(); group.name = 'city'; scene.add(group);
  const fogU = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

  /* ---------- concrete / granite ---------- */
  const granite = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: .78, metalness: 0 });
  granite.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\n' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gn = fbm(vWp.xz * 3.1 + vWp.y * 2.) * .5 + fbm(vWp.xz * 21.) * .5;
        float joint = smoothstep(.015, .0, abs(fract(vWp.x / 1.2 + .5 * step(.5, fract(vWp.z))) - .5) - .485);
        diffuseColor.rgb *= (.72 + gn * .5) * (1. - joint * .35);`);
  };

  /* ---------- raised sidewalks: photo on top, granite curb sides ---------- */
  {
    const tops = [], sides = [];
    const addSlab = (x0, x1, z0, z1) => {
      const w = x1 - x0, d = z1 - z0;
      const top = new THREE.PlaneGeometry(w, d); top.rotateX(-Math.PI / 2); top.translate((x0 + x1) / 2, SIDEWALK_H, (z0 + z1) / 2); tops.push(top);
      const box = new THREE.BoxGeometry(w, SIDEWALK_H, d); box.translate((x0 + x1) / 2, SIDEWALK_H / 2 - .001, (z0 + z1) / 2);
      // keep only side faces (drop top/bottom groups) — index ranges for BoxGeometry faces 2,3 are ±Y
      const idx = box.index.array; const keep = [];
      for (let f = 0; f < 6; f++) if (f !== 2 && f !== 3) for (let i = f * 6; i < f * 6 + 6; i++) keep.push(idx[i]);
      box.setIndex(keep); box.clearGroups(); sides.push(box);
    };
    const E = CITY.extent;
    for (const [x0, x1] of spans(-E, E, CITY.gapsN)) addSlab(x0, x1, CITY.sidewalkN[0], CITY.sidewalkN[1]);
    for (const [x0, x1] of spans(-E, E, CITY.gapsS)) addSlab(x0, x1, CITY.sidewalkS[0], CITY.sidewalkS[1]);
    var topMesh = new THREE.Mesh(mergeGeometries(tops), groundMat); topMesh.renderOrder = -1; group.add(topMesh);
    const curbMesh = new THREE.Mesh(mergeGeometries(sides), granite); group.add(curbMesh);
  }

  /* ---------- vegetation (one instanced card system for all plants) ---------- */
  const atlas = makeVegetationAtlas();
  const vegU = {
    tAtlas: { value: atlas }, uTime: timeU, uLamps: lampUniform, uLampI: lampI, uAmb: { value: 1 }, uSway: { value: 1 },
    uSky: { value: new THREE.Color(sky.top) }, uGround: { value: new THREE.Color(sky.ground) },
    ...fogU,
  };
  const vegMat = new THREE.ShaderMaterial({
    uniforms: vegU, fog: true, alphaToCoverage: !isLow, side: THREE.DoubleSide,
    defines: { A2C_MIN: isLow ? '.5' : '.02' },
    vertexShader: /* glsl */`
      attribute vec3 aCenter; attribute vec4 aTint; attribute float aTile; attribute float aDepth;
      uniform float uTime, uSway;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec4 vTint; varying float vDepth;
      #include <fog_pars_vertex>
      void main(){
        vec2 tile = vec2(mod(aTile, 2.), floor(aTile / 2.));
        vUv = vec2((uv.x + tile.x) * .5, (uv.y + 1. - tile.y) * .5);
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
        // wind: canopy sways more at the top/outside
        float sway = uSway * (aDepth < .5 ? 1. : .4) * (.03 + .02 * sin(uTime * .7 + aCenter.x * .21));
        w.x += sin(uTime * 1.6 + w.y * .8 + aCenter.x * .5 + w.z * .3) * sway;
        w.z += cos(uTime * 1.3 + w.x * .6 + aCenter.z * .4) * sway * .7;
        vW = w.xyz;
        vec3 cardN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0., 0., 1.));
        vec3 sph = normalize(w.xyz - aCenter + vec3(0., .15, 0.));
        vN = normalize(mix(cardN, sph, .78));
        vTint = aTint; vDepth = aDepth;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tAtlas; uniform vec3 uSky, uGround; uniform float uAmb;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec4 vTint; varying float vDepth;
      ${LAMP_GLSL(NL)}
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(tAtlas, vUv);
        // sharpened alpha for stable alpha-to-coverage at any distance
        float a = (t.a - .5) / max(fwidth(t.a), 1e-4) + .5;
        if (a < A2C_MIN) discard;
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = mix(-N, N, .6);
        vec3 alb = t.rgb * vTint.rgb;
        alb = mix(vec3(dot(alb, vec3(.3, .59, .11))), alb, .78) * .85;
        float ao = mix(1., .32, vDepth) * mix(.7, 1., smoothstep(0., 2.5, vW.y));
        vec3 amb = mix(uGround, uSky, N.y * .5 + .5) * .5 * uAmb;
        vec3 lamp = lampLight(vW, N, .6);
        // light passing through leaves near the lamp heads
        vec3 trans = lampLight(vW, -N, .0) * .3 * vec3(.8, 1., .45);
        vec3 col = alb * (amb + lamp + trans * (1. - vDepth)) * ao;
        col += alb * vTint.a; // tiny self-illumination for blossoms
        gl_FragColor = vec4(col, clamp(a, 0., 1.));
        #include <fog_fragment>
      }`,
  });

  const cards = [];   // tree foliage (canvas atlas)
  const mcards = [];  // median / tree-pit planting (photographic atlas)
  const tmpE = new THREE.Euler(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
  const pushCard = (x, y, z, s, center, tint, tile, depth, upright = false, arr = cards) => {
    if (upright) tmpE.set(0, R() * Math.PI, 0); else tmpE.set(R() * Math.PI * 2, R() * Math.PI * 2, R() * Math.PI * 2);
    arr.push({ x, y, z, s, q: new THREE.Quaternion().setFromEuler(tmpE), c: center, tint, tile, depth });
  };
  // card facing out of a surface (normal n), random spin about the normal, small random tilt
  const pushFacing = (p, n, s, tint, tile, depth, tilt = .45) => {
    const nn = n.clone().add(new THREE.Vector3(R() - .5, R() - .5, R() - .5).multiplyScalar(tilt)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Z, nn);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, R() * Math.PI * 2));
    mcards.push({ x: p.x, y: p.y, z: p.z, s, q, c: p.clone().addScaledVector(n, -.35), tint, tile, depth });
  };
  // canopy: points in an ellipsoid, biased to the shell
  function canopy(cx, cy, cz, rx, ry, rz, n, size, tile, tintFn) {
    const c = new THREE.Vector3(cx, cy, cz);
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const r = Math.pow(R(), .38);
      const x = cx + Math.cos(th) * s * rx * r, y = cy + u * ry * r, z = cz + Math.sin(th) * s * rz * r;
      pushCard(x, y, z, size * (.75 + R() * .5), c, tintFn(r), tile, 1 - r);
    }
  }

  /* --- trees: plane trees along both sidewalks --- */
  const trunkGeos = [];
  const treePits = [];
  const treeSpots = [];
  for (const [zi, z0] of CITY.treeZ.entries()) {
    const gaps = zi === 0 ? CITY.gapsN : CITY.gapsS;
    const TE = isLow ? GW / 2 + 20 : 190;
    let x = -TE + R() * 3;
    while (x < TE) {
      if (!inGaps(x, gaps, 3.5)) treeSpots.push([x + (R() - .5) * 1.2, z0 + (R() - .5) * 1.0]);
      x += 9.2 + R() * 1.8;
    }
  }
  const treeScale = isLow ? .55 : 1;
  for (const [tx, tz] of treeSpots) {
    const H = 9 + R() * 3.2, crownR = 3.9 + R() * 1.1;
    const lean = new THREE.Vector3((R() - .5) * .25, 1, (R() - .5) * .25).normalize();
    const forkY = 2.6 + R() * .8;
    // trunk
    const trunk = new THREE.CylinderGeometry(.13, .19, forkY + .2, 9, 4); trunk.translate(0, (forkY + .2) / 2, 0);
    const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
    trunk.applyQuaternion(tq); trunk.translate(tx, SIDEWALK_H, tz); trunkGeos.push(trunk);
    const fork = new THREE.Vector3(0, forkY, 0).applyQuaternion(tq).add(new THREE.Vector3(tx, SIDEWALK_H, tz));
    // main limbs
    const nb = 3 + ((R() * 2) | 0);
    for (let b = 0; b < nb; b++) {
      const a = b / nb * Math.PI * 2 + R() * .6;
      const dir = new THREE.Vector3(Math.cos(a) * .55, 1, Math.sin(a) * .55).normalize();
      const len = 3.2 + R() * 1.6;
      const limb = new THREE.CylinderGeometry(.05, .1, len, 6, 1); limb.translate(0, len / 2, 0);
      limb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      limb.translate(fork.x, fork.y - .1, fork.z); trunkGeos.push(limb);
    }
    // crown: one big ellipsoid + sub-clusters for a lumpy silhouette
    const cy = SIDEWALK_H + forkY + (H - forkY) * .52;
    const hue = .85 + R() * .3;
    const tint = r => [hue * (.85 + R() * .3), hue * (.9 + R() * .25), .8 + R() * .3, 0];
    const nMain = Math.round(520 * treeScale);
    canopy(fork.x, cy, fork.z, crownR, (H - forkY) * .5, crownR, nMain, 1.15, 0, tint);
    const nSub = 5;
    for (let k = 0; k < nSub; k++) {
      const a = R() * Math.PI * 2, d = crownR * (.45 + R() * .3);
      canopy(fork.x + Math.cos(a) * d, cy + (R() - .3) * 1.8, fork.z + Math.sin(a) * d, crownR * .55, crownR * .45, crownR * .55, Math.round(70 * treeScale), 1.0, 0, tint);
    }
    treePits.push([tx, tz]);
  }

  /* --- median: a designed Italian flowerbed —
         clipped boxwood edging on both sides, shrub roses (pink / white) and boxwood balls in the middle,
         ornamental grass tufts; photographic cut-outs (assets/tex/median-veg.webp) ---------------------- */
  const mz0 = ROAD.medianZ0 + .2, mz1 = ROAD.medianZ1 - .2, mzc = (mz0 + mz1) / 2, mw = mz1 - mz0;
  const SOIL = .12;
  const ME = isLow ? GW / 2 : 150;
  const dens = x => (isLow ? .5 : 1) * (Math.abs(x - 28) < 70 ? 1 : .55);   // full density around the checkpoint
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const BOX = 0, PINK = 1, WHITE = 2, GRASS = 3;
  const boxTint = () => { const k = .8 + R() * .35; return [k * (.92 + R() * .1), k, k * (.9 + R() * .1), 0]; };
  {
    // 1) clipped hedges: superellipse cross-section (squarish, softly rounded), cards facing out of the surface
    const hw = .23, hh = .38;
    for (const zc of [mz0 + .25, mz1 - .25]) {
      let x = -ME;
      while (x < ME) {
        const segLen = 7 + R() * 5, x1 = Math.min(ME, x + segLen);
        const per = Math.round(60 * dens(x));
        const n = Math.round((x1 - x) * per);
        for (let i = 0; i < n; i++) {
          const px = x + .08 + R() * (x1 - x - .16);
          const th = R() * Math.PI;                                  // 0 → outer side, π/2 → top, π → inner side
          const c = Math.cos(th), sn = Math.sin(th);
          const e = .5;                                              // 2/n with n = 4
          const lz = Math.sign(c) * Math.pow(Math.abs(c), e) * hw, ly = Math.pow(sn, e) * hh;
          const nz = Math.sign(lz) * Math.pow(Math.abs(lz / hw), 3) / hw, ny = Math.pow(ly / hh, 3) / hh;
          const nrm = V3(0, ny, nz).normalize();
          // gentle undulation along the hedge, so it doesn't read as an extrusion
          const bump = .015 * Math.sin(px * 3.1 + zc) + .01 * Math.sin(px * 7.7);
          const pnt = V3(px, SOIL + ly + bump, zc + lz).addScaledVector(nrm, -R() * .04);
          pushFacing(pnt, nrm, .2 + R() * .1, boxTint(), BOX, R() * .15, .55);
        }
        // a few inner fill cards so the hedge never looks hollow
        for (let i = 0; i < n * .15; i++) {
          const px = x + R() * (x1 - x);
          pushCard(px, SOIL + R() * hh * .8, zc + (R() - .5) * hw, .22, V3(px, SOIL + hh * .4, zc), boxTint().map((v, k) => k < 3 ? v * .55 : 0), BOX, .8, false, mcards);
        }
        x = x1 + .35 + R() * .3;                                    // small gap between hedge sections
      }
    }
    // 2) centre band: rose shrubs in colour groups, punctuated by boxwood balls
    let x = -ME;
    while (x < ME) {
      const groupLen = 3.5 + R() * 3.5, kind = R() < .55 ? PINK : WHITE;
      const x1 = Math.min(ME, x + groupLen);
      for (let rx = x + .45; rx < x1 - .3; rx += .55 + R() * .2) {
        if (Math.abs(rx - 28) < 1.1) continue;                       // clearance around the ANPR pole footing
        const rz = mzc + (R() - .5) * .22, r = .38 + R() * .12, h = .5 + R() * .2;
        const cen = V3(rx, SOIL, rz);
        const nn = Math.round(56 * dens(rx));
        for (let i = 0; i < nn; i++) {
          const u = Math.pow(R(), .8), th = R() * Math.PI * 2;      // biased to the upper dome
          const sxy = Math.sqrt(1 - u * u);
          const nrm = V3(Math.cos(th) * sxy / r, u / h, Math.sin(th) * sxy / r).normalize();
          // irregular, open shrub silhouette rather than a clipped dome
          const lobe = 1 + .22 * Math.sin(th * 3 + rx * 5) + .12 * (R() - .5);
          const pnt = V3(rx + Math.cos(th) * sxy * r * lobe, SOIL + u * h * (.9 + R() * .2), rz + Math.sin(th) * sxy * r * lobe).addScaledVector(nrm, -R() * .1);
          // leafy shrub with blooms scattered over the top: ~40 % flower cards, the rest rose foliage
          const bloom = u > .35 && R() < .55;
          const k = .85 + R() * .25;
          if (bloom) pushFacing(pnt, nrm, .16 + R() * .09, [k, k, k, .03], kind, 0, .7);
          else pushFacing(pnt, nrm, .2 + R() * .08, [k * .55, k * .66, k * .5, 0], BOX, R() * .3, .8);
        }
        // woody leafy core
        for (let i = 0; i < nn * .25; i++) pushCard(rx + (R() - .5) * r, SOIL + R() * h * .7, rz + (R() - .5) * r, .26, cen, [.4, .48, .36, 0], BOX, .8, false, mcards);
      }
      // boxwood ball between groups
      const bx = x1 + .45;
      if (bx < ME && Math.abs(bx - 28) > 1.1) {
        const br = .27 + R() * .06, bc = V3(bx, SOIL + br * .95, mzc);
        const nn = Math.round(70 * dens(bx));
        for (let i = 0; i < nn; i++) {
          const u = R() * 1.7 - .7, th = R() * Math.PI * 2, sxy = Math.sqrt(Math.max(0, 1 - u * u));
          const nrm = V3(Math.cos(th) * sxy, u, Math.sin(th) * sxy);
          pushFacing(bc.clone().addScaledVector(nrm, br * (.92 + R() * .08)), nrm, .17 + R() * .07, boxTint(), BOX, 0, .5);
        }
      }
      x = bx + .5;
    }
    // 3) low ground cover (creeping boxwood / ivy) so the mulch only shows in small patches
    for (let i = 0, n = Math.round(ME * 2 * 22 * (isLow ? .5 : 1)); i < n; i++) {
      const gx = (R() * 2 - 1) * ME; if (Math.abs(gx - 28) < .55) continue;
      const gz = mzc + (R() - .5) * (mw - .5);
      const k = .5 + R() * .3;
      pushFacing(V3(gx, SOIL + .03 + R() * .06, gz), V3(0, 1, 0), .22 + R() * .1, [k * .8, k, k * .75, 0], BOX, .4, 1.1);
    }
    // 4) ornamental grass tufts in the gaps and along the hedge feet
    const ng = Math.round((isLow ? 500 : 2200));
    for (let i = 0; i < ng; i++) {
      const gx = (R() * 2 - 1) * ME; if (Math.abs(gx - 28) < .7) continue;
      const gz = mzc + (R() - .5) * (mw - .9);
      const s = .22 + R() * .14;
      pushCard(gx, SOIL + s * .45, gz, s, V3(gx, -.3, gz), [.75 + R() * .2, .8 + R() * .2, .65, 0], GRASS, .1, true, mcards);
    }
    // tree pits: low grass ground cover
    for (const [tx, tz] of treePits) for (let i = 0; i < (isLow ? 6 : 14); i++) {
      const gx = tx + (R() - .5) * 1.3, gz = tz + (R() - .5) * 1.3, s = .22 + R() * .1;
      pushCard(gx, SIDEWALK_H + .02 + s * .4, gz, s, V3(gx, -.4, gz), [.7, .78, .6, 0], GRASS, .2, true, mcards);
    }
  }

  // instanced card meshes
  function cardMesh(list, material) {
    const n = list.length;
    const geo = new THREE.PlaneGeometry(1, 1);
    const aCenter = new Float32Array(n * 3), aTint = new Float32Array(n * 4), aTile = new Float32Array(n), aDepth = new Float32Array(n);
    const mesh = new THREE.InstancedMesh(geo, material, n);
    list.forEach((c, i) => {
      tmpS.setScalar(c.s); tmpP.set(c.x, c.y, c.z);
      tmpM.compose(tmpP, c.q, tmpS); mesh.setMatrixAt(i, tmpM);
      aCenter.set([c.c.x, c.c.y, c.c.z], i * 3); aTint.set(c.tint, i * 4); aTile[i] = c.tile; aDepth[i] = c.depth;
    });
    geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(aCenter, 3));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 4));
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(aTile, 1));
    geo.setAttribute('aDepth', new THREE.InstancedBufferAttribute(aDepth, 1));
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }
  cardMesh(cards, vegMat);
  // the planting uses the same shader with the photographic atlas, more ambient (it sits between the lamp rows)
  const medianMat = vegMat.clone();
  medianMat.uniforms = { ...vegU, tAtlas: { value: medianTex }, uAmb: { value: 9 }, uSway: { value: .35 }, uLampI: { value: 30 } };
  cardMesh(mcards, medianMat);

  /* --- trunks --- */
  {
    const bark = makeBarkTexture();
    const barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: .92, color: 0xb8b0a0 });
    const tm = new THREE.Mesh(mergeGeometries(trunkGeos.map(g => g.toNonIndexed())), barkMat);
    group.add(tm);
  }

  /* --- median soil bed + tree-pit frames --- */
  {
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 1 });
    soilMat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\n' + NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= vec3(.62, .66, .7);
          float m = fbm(vWp.xz * 9.); float bark = smoothstep(.55, .75, fbm(vWp.xz * 26. + 3.));
          diffuseColor.rgb *= .6 + m * .7; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.33, .24, .16), bark * .6);
          float moss = smoothstep(.45, .7, fbm(vWp.xz * 2.3));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.12, .17, .07), moss * .55);`);
    };
    const bed = new THREE.Mesh(new THREE.BoxGeometry(CITY.extent * 2, .12, mw + .2), soilMat); bed.position.set(0, .06, mzc); group.add(bed);
    // tree pits: granite frames + soil
    const frames = [], soils = [];
    for (const [tx, tz] of treePits) {
      for (const [dx, dz, w, d] of [[0, -.8, 1.7, .1], [0, .8, 1.7, .1], [-.8, 0, .1, 1.5], [.8, 0, .1, 1.5]]) {
        const b = new THREE.BoxGeometry(w, .08, d); b.translate(tx + dx, SIDEWALK_H + .02, tz + dz); frames.push(b);
      }
      const s = new THREE.BoxGeometry(1.5, .02, 1.5); s.translate(tx, SIDEWALK_H + .005, tz); soils.push(s);
    }
    group.add(new THREE.Mesh(mergeGeometries(frames), granite));
    group.add(new THREE.Mesh(mergeGeometries(soils), soilMat));
  }

  /* ---------- buildings ---------- */
  const palette = [[.86, .78, .63], [.80, .62, .40], [.72, .45, .33], [.75, .73, .69], [.87, .80, .58], [.79, .56, .45], [.83, .76, .70], [.66, .62, .55]]
    .map(c => c.map(v => Math.pow(v, 2.2)));
  const facadeU = {
    uTime: timeU, uLamps: lampUniform, uLampI: lampI,
    uSky: { value: new THREE.Color(sky.top) }, uGround: { value: new THREE.Color(sky.ground) },
    ...fogU,
  };
  const facadeMat = new THREE.ShaderMaterial({
    uniforms: facadeU, fog: true,
    vertexShader: /* glsl */`
      attribute vec2 aF; attribute vec3 aCol; attribute vec4 aB; // bay, floorH, seed, height
      varying vec3 vW; varying vec3 vN; varying vec2 vF; varying vec3 vCol; varying vec4 vB;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vF = aF; vCol = aCol; vB = aB;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSky, uGround; uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying vec2 vF; varying vec3 vCol; varying vec4 vB;
      ${NOISE}
      ${LAMP_GLSL(NL)}
      #include <fog_pars_fragment>
      float box(vec2 p, vec2 a, vec2 b){ vec2 s = step(a, p) * step(p, b); return s.x * s.y; }
      float sbox(vec2 p, vec2 a, vec2 b, float e){ vec2 s = smoothstep(a - e, a + e, p) * smoothstep(b + e, b - e, p); return s.x * s.y; }
      void main(){
        float bay = vB.x, fh = vB.y, seed = vB.z, H = vB.w;
        float u = vF.x, v = vF.y;
        float gf = 4.4;
        vec3 N = normalize(vN);
        // plaster: blotches, streaks under sills, grime at the base
        float n1 = fbm(vec2(u, v) * .35 + seed * 7.), n2 = fbm(vec2(u, v) * 3.1);
        vec3 alb = vCol * (.82 + n1 * .32) * (.93 + n2 * .1);
        alb *= mix(.62, 1., smoothstep(0., 1.6, v));
        vec3 emit = vec3(0.);
        float spec = 0.;
        float bi = floor(u / bay); float bu = fract(u / bay);
        // ground floor: rusticated base + shop fronts
        if (v < gf) {
          alb *= .78;
          float course = smoothstep(.04, .0, abs(fract(v / .55) - .5) - .46);
          alb *= 1. - course * .35;
          float hs = h12(vec2(bi, seed * 13.));
          vec2 p = vec2(bu, v);
          float open = sbox(p, vec2(.14, .25), vec2(.86, 3.15), .006);
          if (open > 0.) {
            vec3 inside;
            if (hs > .55) {
              // lit shop window: warm interior, darker floor, shelving silhouettes
              float g = smoothstep(.25, 3.1, v);
              inside = mix(vec3(.9, .55, .28), vec3(1.5, 1.05, .62), g) * (.5 + .5 * h12(vec2(bi, 3.)));
              // shelving / counters and a few silhouettes inside
              float shelf = smoothstep(.02, .0, abs(fract(v * 1.6 + h12(vec2(bi, 4.))) - .5) - .44);
              inside *= 1. - shelf * .55;
              inside *= mix(.45, 1., smoothstep(.2, .9, fbm(vec2(bu * 6. + bi, v * 1.3))));
              inside *= hs > .86 ? vec3(.75, .9, 1.2) : vec3(1.);
              // glazing frame + reflection
              float mull = smoothstep(.006, .0, abs(bu - .5) - .004) + smoothstep(.02, .0, abs(v - 2.45));
              emit += inside * open * .6 * (1. - mull);
              alb = mix(alb, vec3(.03) + mull * .08, open); spec = .3 * open;
            } else if (hs > .25) {
              // roller shutter
              float rib = .55 + .45 * smoothstep(.0, .5, abs(fract(v * 9.) - .5));
              alb = mix(alb, vec3(.22, .23, .24) * rib, open); spec = .15 * open;
            } else {
              // main door: dark wood
              float pan = .7 + .3 * step(.08, abs(fract(bu * 3.) - .5));
              alb = mix(alb, vec3(.07, .045, .03) * pan, open);
            }
          }
          // band above the shops
          alb *= 1. - smoothstep(.06, .0, abs(v - gf + .12)) * .4;
        } else if (v < H - .7) {
          float fv = mod(v - gf, fh); float fi = floor((v - gf) / fh);
          vec2 p = vec2(bu, fv);
          float wx0 = .5 - .2, wx1 = .5 + .2, wy0 = .95, wy1 = .95 + 1.75;
          float hw = h12(vec2(bi * 1.7 + seed, fi * 3.1 + seed * 5.));
          // string course at each floor
          alb *= 1. + smoothstep(.1, .0, abs(fv - .08)) * .18;
          float frame = sbox(p, vec2(wx0 - .025, wy0 - .06), vec2(wx1 + .025, wy1 + .06), .004);
          float glass = sbox(p, vec2(wx0, wy0), vec2(wx1, wy1), .004);
          // stone surround + sill
          alb = mix(alb, vec3(.62, .6, .55) * (.8 + n2 * .3), frame - glass);
          float sill = sbox(p, vec2(wx0 - .05, wy0 - .14), vec2(wx1 + .05, wy0 - .05), .004);
          alb = mix(alb, vec3(.7, .68, .63), sill);
          // dirt streak under the sill
          alb *= 1. - .18 * sbox(p, vec2(wx0, wy0 - 1.1), vec2(wx1, wy0 - .14), .03) * (1. - smoothstep(wy0 - 1.1, wy0 - .14, fv));
          // shutters (persiane): open beside the window or closed over it
          vec3 shutterCol = mix(vec3(.11, .2, .13), vec3(.25, .16, .09), step(.5, fract(seed * 3.7)));
          float slat = .6 + .4 * smoothstep(.0, .45, abs(fract(fv * 14.) - .5));
          float closed = step(hw, .22);
          float openL = sbox(p, vec2(wx0 - .2, wy0), vec2(wx0 - .03, wy1), .004) * (1. - closed) * step(.4, h12(vec2(seed, bi)));
          float openR = sbox(p, vec2(wx1 + .03, wy0), vec2(wx1 + .2, wy1), .004) * (1. - closed) * step(.4, h12(vec2(seed, bi)));
          alb = mix(alb, shutterCol * slat, openL + openR);
          if (glass > 0.) {
            if (closed > .5) {
              alb = mix(alb, shutterCol * slat * .9, glass);
              // light leaking through the slats
              emit += vec3(1.8, 1.2, .6) * glass * step(.82, h12(vec2(bi, fi + 40.))) * step(.75, fract(fv * 14.)) * .5;
            } else {
              float lit = step(.7, hw);
              float mull = 1. - .85 * (smoothstep(.012, .0, abs(bu - .5)) + smoothstep(.012, .0, abs(fv - (wy0 + 1.25))));
              if (lit > .5) {
                float warm = h12(vec2(hw, 2.));
                vec3 L = mix(vec3(1.5, .92, .45), vec3(1.25, 1.12, .95), step(.82, warm));
                float curtain = .55 + .45 * smoothstep(.3, .7, fbm(vec2(bu * 9., fv * 2.) + hw * 10.));
                float grad = mix(.55, 1.15, smoothstep(wy0, wy1, fv));
                // ceiling light pool + darker sill zone: reads as a room behind the glass
                float room = mix(.35, 1., smoothstep(wy0, wy0 + .9, fv)) * (1. - .45 * smoothstep(.25, .0, abs(bu - .5) - .1));
                emit += L * curtain * grad * room * mull * glass * (.45 + .6 * h12(vec2(fi, bi + seed)));
                alb = mix(alb, vec3(.01), glass);
              } else {
                // dark glass reflecting the blue-hour sky
                vec3 refl = mix(uGround, uSky * 1.6, smoothstep(wy0, wy1, fv)) * (.35 + .25 * fbm(vec2(u * .3, v * .2)));
                alb = mix(alb, vec3(.0), glass);
                emit += refl * glass * mull;
                spec = .6 * glass;
              }
            }
          }
        } else {
          // cornice
          float cc = smoothstep(.0, .06, abs(fract((v - H + .7) / .7 * 3.) - .5));
          alb = vec3(.62, .58, .52) * (.7 + .3 * cc) * (.85 + n2 * .2);
          alb *= 1. - smoothstep(H - .7, H - .55, v) * .45 * (1. - smoothstep(H - .55, H - .45, v));
        }
        // lighting: blue-hour sky, ground bounce, street lamps
        vec3 amb = mix(uGround * .9, uSky, N.y * .5 + .5) * .55 * (.75 + .25 * smoothstep(0., 22., v));
        vec3 lamp = lampLight(vW, N, .15);
        vec3 col = alb * (amb + lamp) + emit;
        gl_FragColor = vec4(col, 1.);
        #include <fog_fragment>
      }`,
  });

  const walls = [], roofs = [];
  function addBuilding(x0, x1, zFront, zBack, height, colIdx, bay, fh, seed) {
    const col = palette[colIdx % palette.length];
    const z0 = Math.min(zFront, zBack), z1 = Math.max(zFront, zBack);
    const quad = (ax, az, bx, bz, nx, nz, u0) => {
      const len = Math.hypot(bx - ax, bz - az);
      const pos = [ax, 0, az, bx, 0, bz, bx, height, bz, ax, height, az];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
      g.setAttribute('aF', new THREE.Float32BufferAttribute([u0, 0, u0 + len, 0, u0 + len, height, u0, height], 2));
      g.setAttribute('aCol', new THREE.Float32BufferAttribute([...col, ...col, ...col, ...col], 3));
      const b = [bay, fh, seed, height]; g.setAttribute('aB', new THREE.Float32BufferAttribute([...b, ...b, ...b, ...b], 4));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      walls.push(g);
    };
    // CCW from outside
    quad(x0, z1, x1, z1, 0, 1, 0);      // +z face
    quad(x1, z0, x0, z0, 0, -1, 0);     // −z face
    quad(x0, z0, x0, z1, -1, 0, 0);     // −x face
    quad(x1, z1, x1, z0, 1, 0, 0);      // +x face
    // roof (photo) slightly larger than the walls, sitting on a projecting cornice
    const roof = new THREE.PlaneGeometry(x1 - x0 + .7, z1 - z0 + .7); roof.rotateX(-Math.PI / 2); roof.translate((x0 + x1) / 2, height + .36, (z0 + z1) / 2); roofs.push(roof);
    const cor = new THREE.BoxGeometry(x1 - x0 + .7, .32, z1 - z0 + .7); cor.translate((x0 + x1) / 2, height + .16, (z0 + z1) / 2); cornices.push(cor);
    const cor2 = new THREE.BoxGeometry(x1 - x0 + .36, .16, z1 - z0 + .36); cor2.translate((x0 + x1) / 2, height - .08, (z0 + z1) / 2); cornices.push(cor2);
    // ground-floor string course
    const sc = new THREE.BoxGeometry(x1 - x0 + .16, .14, z1 - z0 + .16); sc.translate((x0 + x1) / 2, 4.38, (z0 + z1) / 2); cornices.push(sc);
  }
  const cornices = [];
  const balconies = []; // [x, y, z, width, facing(+1/−1)]
  for (const side of [0, 1]) {
    const gaps = side === 0 ? CITY.gapsN : CITY.gapsS;
    const zf = side === 0 ? CITY.facadeN : CITY.facadeS;
    const zb = side === 0 ? zf - CITY.depth : zf + CITY.depth;
    const E = isLow ? GW / 2 + 10 : CITY.extent;
    for (const [a, b] of spans(-E, E, gaps)) {
      let x = a;
      while (x < b - 2) {
        const w = Math.min(b - x, 14 + R() * 14);
        const xe = (b - (x + w) < 6) ? b : x + w;
        const height = 17 + R() * 7.5;
        const bay = 2.9 + R() * .6, fh = 3.25 + R() * .3;
        // setback variety of a few decimetres keeps the street wall from looking extruded
        const sb = (R() - .5) * .5 * (side === 0 ? -1 : 1);
        const zFront = zf + sb;
        addBuilding(x, xe, zFront, zb, height, (R() * 8) | 0, bay, fh, R() * 10 + 1);
        // balconies on the street facade (windows are centred in each bay, see facade shader)
        if (R() < .55) {
          const floors = Math.floor((height - .7 - 4.4) / fh);
          const every = R() < .5 ? 1 : 2;
          const nb = Math.floor((xe - x) / bay);
          for (let fi = 0; fi < floors; fi++) {
            if (fi === floors - 1 && R() < .5) continue;
            for (let i = 0; i < nb; i++) {
              if (i % every) continue;
              const u = (i + .5) * bay;
              const bx = side === 0 ? x + u : xe - u;
              balconies.push([bx, 4.4 + fi * fh + .82, zFront, bay * .62, side === 0 ? 1 : -1]);
            }
          }
        }
        x = xe;
      }
    }
  }
  const wallMesh = new THREE.Mesh(mergeGeometries(walls), facadeMat); group.add(wallMesh);
  const roofMesh = new THREE.Mesh(mergeGeometries(roofs), groundMat); group.add(roofMesh);
  const stone = new THREE.MeshStandardMaterial({ color: 0x9b958a, roughness: .85 });
  group.add(new THREE.Mesh(mergeGeometries(cornices), stone));

  /* --- balconies: stone slab + wrought-iron railing --- */
  if (balconies.length) {
    const n = balconies.length;
    const slabGeo = new THREE.BoxGeometry(1, .14, .85); slabGeo.translate(0, 0, .425);
    const slab = new THREE.InstancedMesh(slabGeo, stone, n);
    const railC = document.createElement('canvas'); railC.width = 256; railC.height = 128;
    {
      const g = railC.getContext('2d'); g.fillStyle = '#fff';
      g.fillRect(0, 0, 256, 10); g.fillRect(0, 118, 256, 10); g.fillRect(0, 96, 256, 5);
      for (let x = 4; x < 256; x += 16) g.fillRect(x, 0, 4, 128);
      for (let x = 12; x < 256; x += 32) { g.beginPath(); g.ellipse(x, 104, 9, 6, 0, 0, 7); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); }
    }
    const railTex = new THREE.CanvasTexture(railC);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: .6, roughness: .5, alphaMap: railTex, alphaTest: .5, side: THREE.DoubleSide });
    const railGeo = mergeGeometries([
      new THREE.PlaneGeometry(1, .95).translate(0, .55, .85),
      new THREE.PlaneGeometry(.85, .95).rotateY(Math.PI / 2).translate(-.5, .55, .425),
      new THREE.PlaneGeometry(.85, .95).rotateY(Math.PI / 2).translate(.5, .55, .425),
    ]);
    const rail = new THREE.InstancedMesh(railGeo, railMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
    balconies.forEach(([x, y, z, w, f], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f > 0 ? 0 : Math.PI);
      sc.set(w, 1, 1); pp.set(x, y, z);
      m.compose(pp, q, sc); slab.setMatrixAt(i, m); rail.setMatrixAt(i, m);
    });
    group.add(slab, rail);
  }

  /* ---------- reveal: the aerial shots stay pure photo; the 3D city dissolves in on the descent ---------- */
  const revealU = { value: 1 };
  const DITHER_U = 'uniform float uReveal;';
  const DITHER = 'if (uReveal < .999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) > uReveal) discard;';
  const patched = new Set();
  group.traverse(o => {
    const m = o.material; if (!m || m === groundMat || patched.has(m)) return; patched.add(m);
    if (m.isShaderMaterial) {
      m.uniforms.uReveal = revealU;
      m.fragmentShader = m.fragmentShader.replace('void main(){', `${DITHER_U}\nvoid main(){\n${DITHER}`);
    } else {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r);
        sh.uniforms.uReveal = revealU;
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${DITHER_U}\nvoid main() {\n${DITHER}`);
      };
      m.customProgramCacheKey = () => m.uuid;
    }
  });

  return {
    group,
    update(t) { timeU.value = t; },
    setReveal(r) {
      revealU.value = r;
      group.visible = r > .001;
      topMesh.visible = roofMesh.visible = r > .5;
    },
    lampIntensity: lampI,
  };
}
