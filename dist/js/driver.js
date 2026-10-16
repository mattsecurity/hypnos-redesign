// HYPNOS — seated driver: rigged human (Ready Player Me avatar, MIT/CC sample from three.js examples),
// re-dressed in a dark business suit, short hair added as a skinned shell, posed with analytic IK on the wheel.
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

/* ---------- wardrobe: repaint the outfit textures into a charcoal suit + white shirt ---------- */
function recolor(tex, fn) {
  const img = tex.image;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const r = a[i] / 255, gg = a[i + 1] / 255, b = a[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    const o = fn(r, gg, b, l, s);
    a[i] = o[0] * 255; a[i + 1] = o[1] * 255; a[i + 2] = o[2] * 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.channel = tex.channel;
  return t;
}
const SUIT = [.085, .095, .12];
const suitFn = (r, g, b, l, s) => {
  // shirt: the pale lavender cotton (incl. its shadows) becomes a crisp white shirt
  if ((l > .55 && b >= r * .93 && s < .5) || (l > .82 && s < .15) || (l > .38 && b >= r && s < .32)) { const w = Math.min(1, .25 + l * .95); return [w * .97, w * .98, w]; }
  const k = .55 + l * .9;                                               // keep the fabric/fold shading
  return [SUIT[0] * k, SUIT[1] * k, SUIT[2] * k];
};

/* ---------- short haircut: skinned shell over the scalp ---------- */
function addHair(headMesh) {
  const src = headMesh.geometry;
  const geo = src.clone();
  geo.computeBoundingBox();
  const bb = geo.boundingBox; const size = bb.getSize(V()), c = bb.getCenter(V());
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const mask = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    _a.fromBufferAttribute(pos, i); _b.fromBufferAttribute(nor, i);
    const y = (_a.y - bb.min.y) / size.y;                 // 0 neck … 1 crown
    const phi = Math.abs(Math.atan2(_a.x - c.x, _a.z - c.z)); // 0 = face, π = nape
    // hairline: forehead → temples → above the ears → nape
    const line = phi < .55 ? .80 + .03 * (phi / .55)
      : phi < 1.35 ? THREE.MathUtils.lerp(.835, .74, (phi - .55) / .8)
      : phi < 2.1 ? THREE.MathUtils.lerp(.74, .62, (phi - 1.35) / .75) : .6;
    const m = THREE.MathUtils.smoothstep(y, line - .012, line + .02) * (_b.y > -.75 ? 1 : 0);
    mask[i] = m;
    const off = (.004 + .007 * THREE.MathUtils.clamp((y - line) / .15, 0, 1)) * m + .0008;
    pos.setXYZ(i, _a.x + _b.x * off, _a.y + _b.y * off, _a.z + _b.z * off);
  }
  geo.setAttribute('aHair', new THREE.BufferAttribute(mask, 1));
  const mat = new THREE.MeshStandardMaterial({ color: 0x1d1510, roughness: .62, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHair; varying float vHair; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHair = aHair; vObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vHair; varying vec3 vObj;
      float hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float strand = hh(floor(vObj * vec3(1400., 420., 1400.)));
        if (vHair + (strand - .5) * .16 < .5) discard;
        diffuseColor.rgb *= .7 + strand * .55;`);
  };
  const hair = new THREE.SkinnedMesh(geo, mat);
  hair.name = 'Hair';
  hair.bind(headMesh.skeleton, headMesh.bindMatrix);
  headMesh.parent.add(hair);
  return hair;
}

/* ---------- IK helpers (bones point +Y towards their child) ---------- */
function aim(bone, child, dir) {
  bone.updateWorldMatrix(true, true);
  const p = bone.getWorldPosition(_a), cp = child.getWorldPosition(_b);
  const cur = cp.sub(p).normalize();
  _q.setFromUnitVectors(cur, dir.clone().normalize());
  bone.getWorldQuaternion(_q2);
  const nw = _q.multiply(_q2);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(nw));
  bone.updateWorldMatrix(false, true);
}
function twoBone(upper, lower, end, target, pole) {
  upper.updateWorldMatrix(true, true);
  const A = upper.getWorldPosition(V()), B = lower.getWorldPosition(V()), C = end.getWorldPosition(V());
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const d = Math.min(A.distanceTo(target), (l1 + l2) * .999);
  const dir = target.clone().sub(A).normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const knee = A.clone().addScaledVector(dir, a).addScaledVector(pd, h);
  aim(upper, lower, knee.clone().sub(A));
  aim(lower, end, target.clone().sub(knee));
}
function curlFingers(skel, side, amt) {
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) {
    const b = skel.getBoneByName(`${side}Hand${f}${k}`); if (!b) continue;
    b.rotation.x += amt * (k === 1 ? .9 : 1.1);
  }
  const t = skel.getBoneByName(`${side}HandThumb2`); if (t) t.rotation.z += (side === 'Left' ? -1 : 1) * .35;
}

/* ------------------------------------------------------------------ */
export async function loadDriver(gltfLoader) {
  const gltf = await gltfLoader.loadAsync('assets/3d/driver.glb');
  const root = gltf.scene;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material;
    if (/Outfit_(Top|Bottom)/.test(o.name) && m.map) {
      m.map = recolor(m.map, suitFn); m.roughness = .82; m.metalness = 0; m.metalnessMap = m.roughnessMap = null;
    }
    if (o.name === 'Wolf3D_Head' || o.name === 'Wolf3D_Body') {
      m.roughness = .52;
      // a hint of subsurface warmth so the face does not read as plastic under sodium light
      m.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * vec3(.10, .035, .02);`);
      };
    }
    if (/Footwear/.test(o.name)) { m.color.setScalar(.35); }
  });
  const head = root.getObjectByName('Wolf3D_Head');
  if (head) addHair(head);
  return root;
}

/**
 * Seat a clone of the driver in a car.
 * @param template  loaded avatar
 * @param car       the car model group (front towards −Z, y up, metres)
 * @param wheelC    steering-wheel centre in car space
 */
export function seatDriver(template, car, wheelC) {
  const d = skeletonClone(template);
  d.scale.setScalar(.92);
  d.rotation.y = Math.PI;               // avatar faces +Z, car front is −Z
  car.add(d);
  car.updateWorldMatrix(true, true);
  const skel = (() => { let s = null; d.traverse(o => { if (o.isSkinnedMesh && !s) s = o.skeleton; }); return s; })();
  const B = n => skel.getBoneByName(n);
  const toWorld = p => car.localToWorld(p.clone());
  const toCarDir = v => v.clone().transformDirection(car.matrixWorld);

  // place the pelvis on the seat
  const hips = B('Hips');
  const seat = V(wheelC.x, wheelC.y - .38, wheelC.z + .45);
  d.updateWorldMatrix(true, true);
  const hw = hips.getWorldPosition(V());
  const target = toWorld(seat);
  const delta = target.sub(hw);
  d.position.add(car.worldToLocal(d.getWorldPosition(V()).add(delta)).sub(d.position));
  d.updateWorldMatrix(true, true);

  // torso reclined ~18°, head level, looking down the road
  const back = .15;
  aim(B('Spine'), B('Spine1'), toCarDir(V(0, Math.cos(back), Math.sin(back))));
  aim(B('Spine1'), B('Spine2'), toCarDir(V(0, Math.cos(back * .9), Math.sin(back * .9))));
  aim(B('Spine2'), B('Neck'), toCarDir(V(0, Math.cos(back * .6), Math.sin(back * .6))));
  aim(B('Neck'), B('Head'), toCarDir(V(0, 1, -.08)));
  aim(B('Head'), B('HeadTop_End'), toCarDir(V(0, 1, -.06)));

  // legs: thighs forward, shins down to the pedals
  for (const [s, sx] of [['Left', -1], ['Right', 1]]) {
    const up = B(`${s}UpLeg`), lo = B(`${s}Leg`), ft = B(`${s}Foot`), toe = B(`${s}ToeBase`);
    up.updateWorldMatrix(true, false);
    const hp = car.worldToLocal(up.getWorldPosition(V()));
    const ankle = toWorld(V(hp.x + sx * .07, wheelC.y - .6, seat.z - .74));
    twoBone(up, lo, ft, ankle, toCarDir(V(sx * .15, 1, -.2)));
    aim(ft, toe, toCarDir(V(0, -.35, -1)));
  }
  // arms: hands at "ten to two" on the rim (wheel plane tilts towards the driver), elbows dropped
  const rimR = .17, rimUp = V(0, .89, .46);
  for (const [s, sx] of [['Left', -1], ['Right', 1]]) {
    const sh = B(`${s}Shoulder`), ar = B(`${s}Arm`), fa = B(`${s}ForeArm`), hd = B(`${s}Hand`), mid = B(`${s}HandMiddle1`);
    aim(sh, ar, toCarDir(V(sx, .1, -.12)));
    const grip = toWorld(V(wheelC.x + sx * rimR * .87, wheelC.y, wheelC.z).addScaledVector(rimUp, rimR * .5).add(V(0, .015, .03)));
    twoBone(ar, fa, hd, grip, toCarDir(V(sx * .7, -1, .25)));
    // palm wraps the rim: hand points along the rim, slightly forward
    aim(hd, mid, toCarDir(V(sx * .25, .55, -.8)));
    hd.rotateY(sx * -1.15);
    hd.updateWorldMatrix(false, true);
    curlFingers(skel, s, 1.05);
  }
  d.updateWorldMatrix(true, true);
  const neck = B('Neck'), headB = B('Head');
  const base = { neck: neck.quaternion.clone(), head: headB.quaternion.clone() };
  return {
    object: d,
    // tiny life: breathing, micro head movement, the odd glance
    update(t) {
      const glance = Math.max(0, Math.sin(t * .23)) ** 6 * .22;
      headB.quaternion.copy(base.head);
      headB.rotateY(Math.sin(t * .41) * .03 + glance);
      headB.rotateX(Math.sin(t * .67) * .015);
      neck.quaternion.copy(base.neck);
      neck.rotateX(Math.sin(t * 1.6) * .006);
    },
  };
}
