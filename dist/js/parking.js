// HYPNOS — "La sosta, chiavi in mano".
// Scroll story: Fornitura (photo of the meter) → dissolve to the street from above → Installazione (a van
// arrives and the technician mounts the meter) → Segnaletica (stalls painted) → Manutenzione → Gestione (live street).
// Street: a real top-down photograph (assets/img/parking-street.webp); stalls, meter, cars and van are drawn on top.

const W = 40, H = 40 * 1024 / 1536;          // world, metres (photo is 1536×1024 at 38.4 px/m)
const CURB_N = 8.83, CURB_S = 20.68, DASH_Y = 16.98;
const STALL_D = 4.4, EDGE_Y = CURB_N + STALL_D; // angled (45°) stalls between the north kerb and EDGE_Y
const LANE_A = (EDGE_Y + DASH_Y) / 2, LANE_B = (DASH_Y + CURB_S) / 2;
const SPAN = 2.5 / Math.SQRT1_2;               // stall spacing along the kerb for 2.5 m wide stalls at 45°
const METER = { x: 20.6, y: 7.75 };
const ANG = -Math.PI / 4;                       // parked heading: nose towards the kerb, pointing north-east
const DIR = { x: Math.cos(ANG), y: Math.sin(ANG) };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const range = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
const bezD = (a, b, c, d, t) => { const u = 1 - t; return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c); };
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const euro = v => '€ ' + v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function initParking({ gsap, ScrollTrigger, reduced }) {
  const root = document.getElementById('sosta');
  if (!root) return;
  const canvas = root.querySelector('#pk-canvas');
  const ctx = canvas.getContext('2d');
  const steps = [...root.querySelectorAll('.pk-steps li')];
  const ui = {
    occ: root.querySelector('#pk-occ'), occBar: root.querySelector('#pk-occbar'), rev: root.querySelector('#pk-rev'),
    free: root.querySelector('#pk-free'), toasts: root.querySelector('#pk-toasts'), phase: root.querySelector('#pk-phase'),
    front: root.querySelector('#pk-front'), hud: root.querySelector('.pk-hud'), install: root.querySelector('#pk-install'),
    note: root.querySelector('.pk-note'),
    cap: root.querySelector('#pk-cap'), capN: root.querySelector('#pk-cap-n'), capT: root.querySelector('#pk-cap-t'), capD: root.querySelector('#pk-cap-d'),
  };

  // pin first (synchronously), so every ScrollTrigger below this section is measured with the pin spacer
  let P = 0, PT = 0;                 // P = smoothed progress the scene renders, PT = scroll target
  // pinned on every screen: the five phases follow the scroll, on phones and tablets too
  ScrollTrigger.create({ trigger: '.parking__pin', pin: true, start: 'top top', end: '+=420%', scrub: true, onUpdate: s => { PT = s.progress * 1.02; } });

  const CAR_MODELS = 18;
  const [street, van, meterTop, ...carLoad] = await Promise.all([
    loadImg('assets/img/parking-street.webp'), loadImg('assets/img/van-top.webp'), loadImg('assets/img/meter-top.webp'),
    ...Array.from({ length: CAR_MODELS }, (_, i) => loadImg(`assets/img/cars/car-${i + 1}.webp`)),
  ]);
  // real-world lengths per model (m), so a city car stays shorter than an SUV
  const CAR_LEN = [4.0, 4.5, 4.3, 4.5, 4.1, 4.4, 3.5, 4.1, 4.2, 4.3, 4.3, 3.95, 3.85, 4.6, 4.4, 4.5, 4.55, 3.8];
  const carImgs = carLoad.map((img, i) => img && { img, len: CAR_LEN[i] || 4.2 }).filter(Boolean);

  /* ---------- sizing ---------- */
  // the street covers the canvas box (3:2 on large screens, taller on phones, cropped at the sides)
  let S = 20, dpr = 1, OX = 0, OY = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.max(320, r.width), ch = r.height > 0 ? r.height * cw / Math.max(1, r.width) : cw * H / W;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    S = Math.max(cw / W, ch / H);
    OX = (cw - W * S) / 2; OY = (ch - H * S) / 2;
  }

  /* ---------- stalls (45°, nose to the kerb) ---------- */
  const STALLS = [];
  for (let i = 0; ; i++) {
    const x0 = .9 + i * SPAN;                       // where the stall's left line meets the lane edge
    const cx = x0 + SPAN / 2 + STALL_D / 2, cy = (CURB_N + EDGE_Y) / 2;
    if (x0 + SPAN + STALL_D > W - .3) break;
    STALLS.push({ i, x0, cx, cy, car: null, reserved: false });
  }
  const NS = STALLS.length;

  /* ---------- actors ---------- */
  const cars = [];
  let sim = 0, revenue = 0, lastA = -9, lastB = -9, populated = false;
  let bag = [];
  const pick = () => { if (!bag.length) bag = carImgs.slice().sort(() => Math.random() - .5); return bag.pop(); };
  function mk(o) { const m = pick(); return Object.assign({ img: m.img, len: m.len * (.98 + Math.random() * .04), x: 0, y: 0, h: 0, v: 0, t: 0, brake: 0, rev: 0 }, o); }

  function toast(html) {
    const el = document.createElement('div'); el.className = 'pk-toast'; el.innerHTML = html;
    ui.toasts.prepend(el);
    gsap.fromTo(el, { y: -14, opacity: 0, scale: .96 }, { y: 0, opacity: 1, scale: 1, duration: .5, ease: 'power3.out' });
    gsap.to(el, { opacity: 0, y: 8, duration: .5, delay: 3.2, ease: 'power2.in', onComplete: () => el.remove() });
    while (ui.toasts.children.length > 3) ui.toasts.lastChild.remove();
  }
  function hud() {
    const occ = STALLS.filter(s => s.car && s.car.state === 'parked').length;
    ui.occ.textContent = Math.round(occ / NS * 100) + '%';
    ui.occBar.style.transform = `scaleX(${occ / NS})`;
    ui.free.textContent = String(NS - occ);
    ui.rev.textContent = euro(revenue);
  }
  function populate() {
    if (populated) return; populated = true;
    [1, 3, 4, 7, 9].forEach(i => {
      const s = STALLS[i]; if (!s) return;
      const c = mk({ state: 'parked', stall: s, x: s.cx, y: s.cy, h: ANG, stay: 3 + Math.random() * 10 });
      s.car = c; cars.push(c);
    });
    hud();
  }

  // a car occupies lane A if its body reaches into it
  const inLaneA = o => (o.state === 'approach' || o.state === 'pass' || o.state === 'exit') || ((o.state === 'in' || o.state === 'out') && o.y > EDGE_Y - .6);
  // distance to the nearest obstacle ahead on lane A (eastbound) for car c
  function gapAheadA(c) {
    let g = 99;
    for (const o of cars) {
      if (o === c) continue;
      let ox = null;
      if (inLaneA(o)) ox = o.x;
      if (o.state === 'out') ox = Math.min(o.x, o.stall.cx - 5.6);   // a reversing car claims its exit spot
      if (ox === null || ox <= c.x) continue;
      g = Math.min(g, ox - c.x - (c.len + o.len) / 2 - 1.4);
    }
    return g;
  }
  function gapAheadB(c) {
    let g = 99;
    for (const o of cars) if (o !== c && o.state === 'through' && o.x < c.x) g = Math.min(g, c.x - o.x - (c.len + o.len) / 2 - 1.6);
    return g;
  }
  const follow = (c, vmax, gap, dt, accel = 4) => {
    const vt = Math.max(0, Math.min(vmax, gap * 1.4));
    c.brake = vt < c.v - .3 ? 1 : 0;
    c.v = vt < c.v ? Math.max(vt, c.v - 9 * dt) : Math.min(vt, c.v + accel * dt);
    return c.v;
  };

  function step(dt, live) {
    // spawns: lane A parkers / passers when the entrance is clear, lane B through traffic
    // lane A entrance must be free — including the spot a reversing car is about to back into
    const clearEntryA = !cars.some(o => (inLaneA(o) && o.x < 6) || (o.state === 'out' && o.stall.cx - 5.6 < 8));
    if (live) {
      populate();
      if (sim - lastA > 2.2 + Math.random() * 1.6 && clearEntryA) {
        lastA = sim;
        const free = STALLS.filter(s => !s.car && !s.reserved);
        if (free.length && Math.random() < .8) {
          const s = free[(Math.random() * free.length) | 0]; s.reserved = true;
          cars.push(mk({ state: 'approach', stall: s, x: -5, y: LANE_A, h: 0, v: 8 }));
        } else cars.push(mk({ state: 'pass', x: -5, y: LANE_A, h: 0, v: 9 }));
      }
    }
    if (sim - lastB > 2.6 + Math.random() * 2.6 && !cars.some(o => o.state === 'through' && o.x > W - 3)) {
      lastB = sim; cars.push(mk({ state: 'through', x: W + 5, y: LANE_B, h: Math.PI, v: 9 + Math.random() * 2 }));
    }

    for (let k = cars.length - 1; k >= 0; k--) {
      const c = cars[k]; const s = c.stall;
      c.t += dt;
      switch (c.state) {
        case 'through': {
          follow(c, 10, gapAheadB(c), dt); c.x -= c.v * dt;
          if (c.x < -7) cars.splice(k, 1);
          break;
        }
        case 'pass': case 'exit': {
          follow(c, c.state === 'exit' ? 8.5 : 9.5, gapAheadA(c), dt, c.state === 'exit' ? 3 : 4);
          c.x += c.v * dt; c.h = 0; c.rev = 0;
          if (c.x > W + 7) cars.splice(k, 1);
          break;
        }
        case 'approach': {
          const ex = s.cx - 6.2;                                   // turn-in point
          const g = Math.min(gapAheadA(c), ex - c.x + .01);
          follow(c, 8, g, dt);
          c.x = Math.min(ex, c.x + c.v * dt);
          if (ex - c.x < 7) c.brake = 1;
          // start turning only if nobody is reversing out right next to the stall
          if (c.x >= ex - .02 && !cars.some(o => o !== c && (o.state === 'out' || o.state === 'in') && Math.abs(o.stall.cx - s.cx) < SPAN * 1.6)) { c.state = 'in'; c.t = 0; }
          break;
        }
        case 'in': {
          const T = 2.6, u = easeIO(clamp(c.t / T));
          const P0x = s.cx - 6.2, P1x = s.cx - 3.2, P2x = s.cx - DIR.x * 2.6, P3x = s.cx;
          const P0y = LANE_A, P1y = LANE_A, P2y = s.cy - DIR.y * 2.6, P3y = s.cy;
          c.x = bez(P0x, P1x, P2x, P3x, u); c.y = bez(P0y, P1y, P2y, P3y, u);
          const uu = Math.max(u, .002);
          c.h = Math.atan2(bezD(P0y, P1y, P2y, P3y, uu), bezD(P0x, P1x, P2x, P3x, uu));
          c.brake = u > .65 ? 1 : .4;
          if (c.t >= T) {
            c.state = 'parked'; c.t = 0; c.stay = 5 + Math.random() * 9; c.brake = 0; c.h = ANG; s.car = c; s.reserved = false;
            const mins = [30, 45, 60, 90, 120][(Math.random() * 5) | 0];
            revenue += mins / 60 * 1.5;
            toast(`<i></i><b>Stallo ${String(s.i + 1).padStart(2, '0')}</b><span>Sosta pagata al parcometro · ${mins >= 60 ? (mins / 60).toString().replace('.', ',') + ' h' : mins + ' min'}</span>`);
            hud();
          }
          break;
        }
        case 'parked': {
          c.x = s.cx; c.y = s.cy; c.h = ANG; c.brake = 0;
          // leave only with a clear lane behind and no manoeuvre next door
          if (live && c.t > c.stay) {
            const busy = cars.some(o => o !== c && (
              (inLaneA(o) && o.x > s.cx - 16 && o.x < s.cx + 1.5) ||
              ((o.state === 'in' || o.state === 'out') && Math.abs(o.stall.cx - s.cx) < SPAN * 2.2)));
            if (!busy) { c.state = 'out'; c.t = 0; hud(); }
          }
          break;
        }
        case 'out': {
          // reverse out (backwards, down-left) onto lane A facing east, then drive away
          const T = 2.8, u = easeIO(clamp(c.t / T));
          const P0x = s.cx, P1x = s.cx - DIR.x * 2.4, P2x = s.cx - 3.6, P3x = s.cx - 5.6;
          const P0y = s.cy, P1y = s.cy - DIR.y * 2.4, P2y = LANE_A, P3y = LANE_A;
          c.x = bez(P0x, P1x, P2x, P3x, u); c.y = bez(P0y, P1y, P2y, P3y, u);
          const uu = Math.max(u, .002);
          c.h = Math.atan2(-bezD(P0y, P1y, P2y, P3y, uu), -bezD(P0x, P1x, P2x, P3x, uu));
          c.rev = 1; c.brake = u > .82 ? 1 : 0;
          if (u > .35 && s.car === c) { s.car = null; }
          if (c.t >= T) { c.state = 'exit'; c.t = 0; c.v = 0; c.rev = 0; hud(); }
          break;
        }
      }
    }
  }

  /* ---------- drawing ---------- */
  function drawCar(g, c, k) {
    if (!c.img) return;
    const len = c.len, wid = len * c.img.width / c.img.height;
    g.save();
    g.translate(c.x * k, c.y * k); g.rotate(c.h + Math.PI / 2);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = .5 * k; g.shadowOffsetX = .3 * k; g.shadowOffsetY = .35 * k;
    g.drawImage(c.img, -wid / 2 * k, -len / 2 * k, wid * k, len * k);
    g.shadowColor = 'transparent';
    const glow = Math.max(c.brake, c.rev);
    if (glow) {
      g.globalCompositeOperation = 'lighter';
      for (const sx of [-.32, .32]) {
        const gx = sx * wid * k, gy = len / 2 * k * .96;
        const rg = g.createRadialGradient(gx, gy, 0, gx, gy, .7 * k);
        const col = c.rev ? '255,255,240' : '255,40,30';
        rg.addColorStop(0, `rgba(${col},${.5 * glow})`); rg.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = rg; g.fillRect(gx - .7 * k, gy - .7 * k, 1.4 * k, 1.4 * k);
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
  function drawVan(g, x, y, k, beacon) {
    if (!van) return;
    const L = 5.4, Wd = L * van.width / van.height;
    g.save(); g.translate(x * k, y * k); g.rotate(Math.PI / 2);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = .6 * k; g.shadowOffsetX = .35 * k; g.shadowOffsetY = -.3 * k;
    g.drawImage(van, -Wd / 2 * k, -L / 2 * k, Wd * k, L * k);
    g.shadowColor = 'transparent';
    if (beacon) {
      g.globalCompositeOperation = 'lighter';
      const by = -L * .2 * k;
      const rg = g.createRadialGradient(0, by, 0, 0, by, 2.4 * k); rg.addColorStop(0, 'rgba(255,160,20,.55)'); rg.addColorStop(1, 'rgba(255,160,20,0)');
      g.fillStyle = rg; g.fillRect(-2.4 * k, by - 2.4 * k, 4.8 * k, 4.8 * k);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
  function drawMeter(g, k, on, t, sc = 1) {
    if (meterTop) {
      const mw = .78, mh = mw * meterTop.height / meterTop.width;
      g.save(); g.translate(METER.x * k, METER.y * k); g.scale(sc, sc);
      g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = .25 * k; g.shadowOffsetX = .35 * k; g.shadowOffsetY = .3 * k;
      g.drawImage(meterTop, -mw / 2 * k, -mh / 2 * k, mw * k, mh * k);
      g.restore();
      if (on) {
        const ph = (t % 1.8) / 1.8;
        g.strokeStyle = `rgba(226,88,97,${(1 - ph) * .85})`; g.lineWidth = .07 * k;
        g.beginPath(); g.arc(METER.x * k, METER.y * k, (.5 + ph * 1.6) * k, 0, 7); g.stroke();
      }
      return;
    }
    g.save(); g.translate(METER.x * k, METER.y * k);
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = .25 * k; g.shadowOffsetX = .35 * k; g.shadowOffsetY = .3 * k;
    g.fillStyle = '#25292f'; roundRect(g, -.3 * k, -.2 * k, .6 * k, .4 * k, .06 * k); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#34506e'; roundRect(g, -.27 * k, -.18 * k, .54 * k, .19 * k, .03 * k); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = .015 * k;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo((-.27 + i * .135) * k, -.18 * k); g.lineTo((-.27 + i * .135) * k, .01 * k); g.stroke(); }
    g.fillStyle = on ? '#8fe3b0' : '#0f1114'; g.fillRect(-.11 * k, .05 * k, .22 * k, .08 * k);
    g.restore();
    if (on) {
      const ph = (t % 1.8) / 1.8;
      g.strokeStyle = `rgba(226,88,97,${(1 - ph) * .85})`; g.lineWidth = .07 * k;
      g.beginPath(); g.arc(METER.x * k, METER.y * k, (.45 + ph * 1.6) * k, 0, 7); g.stroke();
    }
  }
  function drawStalls(g, k, paint) {
    if (paint <= 0) return;
    g.save();
    g.strokeStyle = '#2b66d9'; g.lineWidth = .12 * k; g.lineCap = 'round';
    const n = NS + 1;
    for (let i = 0; i < n; i++) {
      const pi = clamp(paint * (n + 4) - i);
      if (pi <= 0) continue;
      const x0 = .9 + i * SPAN;
      g.beginPath(); g.moveTo(x0 * k, (EDGE_Y - .05) * k); g.lineTo((x0 + (STALL_D - .2) * pi) * k, (EDGE_Y - .05 - (STALL_D - .2) * pi) * k); g.stroke();
    }
    const pl = clamp(paint * 1.25 - .15);
    g.beginPath(); g.moveTo(.9 * k, EDGE_Y * k); g.lineTo((.9 + (NS * SPAN) * pl) * k, EDGE_Y * k); g.stroke();
    // stall numbers painted near the lane edge
    g.globalAlpha = .7 * clamp(paint * 2 - 1); g.fillStyle = '#2b66d9';
    g.font = `600 ${.5 * k}px "JetBrains Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of STALLS) g.fillText(String(s.i + 1).padStart(2, '0'), (s.x0 + SPAN / 2 + .35) * k, (EDGE_Y - .45) * k);
    g.globalAlpha = 1;
    g.restore();
    // vertical sign: blue P on a pole at the kerb
    const sp = clamp(paint * 2.2 - 1.2);
    if (sp > 0) {
      g.save(); g.translate(10.6 * k, (CURB_N - .55) * k); g.scale(.4 + .6 * easeOut(sp), .4 + .6 * easeOut(sp)); g.globalAlpha = sp;
      g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = .3 * k; g.shadowOffsetX = .4 * k; g.shadowOffsetY = .35 * k;
      g.fillStyle = '#1d5bd6'; roundRect(g, -.42 * k, -.42 * k, .84 * k, .84 * k, .08 * k); g.fill();
      g.shadowColor = 'transparent';
      g.fillStyle = '#fff'; g.font = `700 ${.62 * k}px "Inter Tight", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 0, .03 * k);
      g.restore();
    }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------- phases ---------- */
  const PHASES = ['Fornitura', 'Installazione', 'Segnaletica', 'Manutenzione', 'Gestione'];
  const TOASTS = ['Fornitura dei parcometri', 'Installazione del parcometro su strada', 'Segnaletica orizzontale e verticale', 'Manutenzione dei parcometri', 'Gestione con personale altamente qualificato'];
  let phaseIdx = -1;
  function setPhase(i) {
    if (i === phaseIdx) return; phaseIdx = i;
    steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('done', k < i); });
    ui.phase.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> ${PHASES[i]}`;
    root.dataset.phase = String(i);
    // phone: one caption under the dots instead of five crowded labels
    ui.capN.textContent = `0${i + 1} / 05`;
    ui.capT.textContent = PHASES[i];
    ui.capD.textContent = steps[i].querySelector('span').textContent;
    ui.cap.classList.remove('swap'); void ui.cap.offsetWidth; ui.cap.classList.add('swap');
    if (i > 0) toast(`<i></i><b>${PHASES[i]}</b><span>${TOASTS[i]}</span>`);
  }

  function render(dt) {
    const g = ctx, k = S * dpr;
    // the scene never jumps with the wheel: it glides towards the scroll position
    P += (PT - P) * Math.min(1, dt * 3.2);
    if (Math.abs(PT - P) < 1e-4) P = PT;
    // Fornitura = the photo only; then a plain dissolve to the street seen from above
    const fade = ease(range(P, .14, .2));
    const pInst = range(P, .22, .43), pPaint = range(P, .46, .62), pMaint = range(P, .65, .81), live = P >= .82;
    setPhase(P < .2 ? 0 : P < .45 ? 1 : P < .64 ? 2 : P < .82 ? 3 : 4);

    g.setTransform(1, 0, 0, 1, OX * dpr, OY * dpr);
    if (street) g.drawImage(street, 0, 0, W * k, H * k);
    else { g.fillStyle = '#5b5e62'; g.fillRect(0, 0, W * k, H * k); }

    const f = ui.front;
    f.style.opacity = String(1 - fade);
    f.style.visibility = fade >= .999 ? 'hidden' : 'visible';

    drawStalls(g, k, pPaint);
    // installation progress while the technician mounts the meter
    const mount = range(pInst, .38, .62);
    ui.install.style.opacity = String(mount > 0 && mount < 1 ? 1 : 0);
    ui.install.querySelector('i').style.transform = `scaleX(${mount})`;
    ui.hud.classList.toggle('on', live);

    step(dt, live);
    for (const c of cars) if (live || c.state === 'through') drawCar(g, c, k);

    // service visits: the van arrives on lane A, stops by the meter with the beacon on, the technician
    // walks to the kerb and back, the van leaves — once to install the meter, once for maintenance
    const visit = t => {
      const a = easeOut(range(t, 0, .3)), b = easeIO(range(t, .76, 1));
      const vx = lerp(lerp(-5, METER.x - .5, a), W + 7, b);
      drawVan(g, vx, LANE_A, k, t > .28 && t < .78 && (sim % .7) < .38);
      if (t > .3 && t < .74) {
        const tw = ease(range(t, .3, .4)) * (1 - ease(range(t, .64, .74)));
        const tx = METER.x + .75, ty = lerp(LANE_A - 1.6, METER.y + .5, tw);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse((tx + .12) * k, (ty + .12) * k, .3 * k, .22 * k, 0, 0, 7); g.fill();
        g.fillStyle = '#f2a516'; g.beginPath(); g.ellipse(tx * k, ty * k, .3 * k, .22 * k, 0, 0, 7); g.fill();
        g.fillStyle = '#2b2f36'; g.beginPath(); g.arc(tx * k, ty * k, .12 * k, 0, 7); g.fill();
      }
    };
    if (pInst > 0 && pInst < 1) visit(pInst);
    if (pMaint > 0 && pMaint < 1) visit(pMaint);

    // the meter appears when the technician has mounted it
    const appear = P >= .43 ? 1 : easeOut(range(pInst, .5, .62));
    if (appear > 0) {
      drawMeter(g, k, appear >= 1, sim, .6 + .4 * appear);
      if (appear < 1) {
        g.strokeStyle = `rgba(226,88,97,${.8 * (1 - appear)})`; g.lineWidth = .08 * k;
        g.beginPath(); g.arc(METER.x * k, METER.y * k, (.4 + appear * 1.4) * k, 0, 7); g.stroke();
      }
    }
  }

  /* ---------- loop ---------- */
  let running = false, last = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; sim += dt;
    render(dt);
    requestAnimationFrame(frame);
  }
  const start = () => { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); };
  const stop = () => { running = false; };
  resize(); hud(); setPhase(0); render(0);
  addEventListener('resize', () => { resize(); render(0); });
  ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: s => (s.isActive ? start() : stop()) });
  if (reduced) P = PT = 1.02;
}
