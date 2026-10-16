// HYPNOS — "La sosta, chiavi in mano": a living top-down street drawn on canvas.
// Scroll drives the five phases (supply → install → road markings → maintenance → management);
// once the service is "live" cars keep arriving, parking, reversing out and driving away.

const W = 40, H = 25;                       // world, metres (16:10)
const STALLS = 16, STALL_W = 2.5;
const CURB_N = 8.5, STALL_Y = 11.0, LANE_A = 15.25, LANE_B = 18.75, CURB_S = 20.5;
const METER = { x: 20.0, y: 7.55 };
const CAR_L = 4.3;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const range = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
const bezD = (a, b, c, d, t) => { const u = 1 - t; return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c); };
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const euro = v => '€ ' + v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function initParking({ gsap, ScrollTrigger, isMobile, reduced }) {
  const root = document.getElementById('sosta');
  if (!root) return;
  const canvas = root.querySelector('#pk-canvas');
  const ctx = canvas.getContext('2d');
  const steps = [...root.querySelectorAll('.pk-steps li')];
  const ui = {
    occ: root.querySelector('#pk-occ'), occBar: root.querySelector('#pk-occbar'), rev: root.querySelector('#pk-rev'),
    free: root.querySelector('#pk-free'), toasts: root.querySelector('#pk-toasts'), phase: root.querySelector('#pk-phase'),
    photo: root.querySelector('#pk-photo'), hud: root.querySelector('.pk-hud'), install: root.querySelector('#pk-install'),
  };

  // pin first (synchronously), so every ScrollTrigger below this section is measured with the pin spacer
  let P = 0;
  const mm = gsap.matchMedia();
  mm.add('(min-width: 961px)', () => {
    const st = ScrollTrigger.create({
      trigger: '.parking__pin', pin: true, start: 'top top', end: '+=260%', scrub: true,
      onUpdate: s => { P = s.progress * 1.02; },
    });
    return () => st.kill();
  });
  mm.add('(max-width: 960px)', () => {
    // no pin on small screens: the phases play by themselves once the stage is in view
    let t0 = null;
    const st = ScrollTrigger.create({ trigger: '.pk-view', start: 'top 75%', onEnter: () => { t0 = performance.now(); } });
    const tick = () => { if (t0 !== null) P = Math.min(1.02, (performance.now() - t0) / 14000); };
    gsap.ticker.add(tick);
    return () => { st.kill(); gsap.ticker.remove(tick); };
  });
  const [asphalt, paving, veg, aerial, ...carImgs] = await Promise.all([
    loadImg('assets/tex/asphalt_diff.jpg'), loadImg('assets/tex/pavement_diff.jpg'), loadImg('assets/tex/median-veg.webp'), loadImg('assets/img/aerial.webp'),
    ...[1, 2, 3, 4, 5, 6].map(i => loadImg(`assets/img/cars/car-${i}.webp`)),
  ]);

  /* ---------- sizing ---------- */
  let S = 20, dpr = 1, cw = 0, chh = 0;
  const bg = document.createElement('canvas'); const bgx = bg.getContext('2d');
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    cw = Math.max(320, r.width); chh = cw * H / W;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
    S = cw / W;
    bg.width = canvas.width; bg.height = canvas.height;
    paintStatic();
  }

  /* ---------- static street (cached) ---------- */
  const trees = [3.2, 11.4, 28.6, 36.8].map((x, i) => ({ x, y: 5.6, r: 2.9 + (i % 2) * .4, rot: i * 1.7 }))
    .concat([6.5, 16.5, 26.5, 35].map((x, i) => ({ x, y: 22.6, r: 2.7 + (i % 2) * .35, rot: i * 2.3 + 1 })));
  function pattern(img, metres, tint) {
    if (!img) return tint;
    const p = bgx.createPattern(img, 'repeat');
    const k = metres * S * dpr / img.width;
    p.setTransform(new DOMMatrix().scale(k, k));
    return p;
  }
  function paintStatic() {
    const g = bgx; const k = S * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // buildings: real roofs from the aerial photo (north strip) with an eave shadow
    if (aerial) {
      g.drawImage(aerial, 380, 0, 1000, 140, 0, 0, W * k, 4 * k);
      g.drawImage(aerial, 380, 880, 1000, 144, 0, 23 * k, W * k, 2 * k);
    } else { g.fillStyle = '#8a5a44'; g.fillRect(0, 0, W * k, 4 * k); g.fillRect(0, 23 * k, W * k, 2 * k); }
    // pavements
    g.fillStyle = pattern(paving, 1.8, '#b9b2a6'); g.fillRect(0, 4 * k, W * k, (CURB_N - 4) * k); g.fillRect(0, CURB_S * k, W * k, (23 - CURB_S) * k);
    g.fillStyle = 'rgba(255,240,215,.08)'; g.fillRect(0, 4 * k, W * k, (CURB_N - 4) * k);
    let gr = g.createLinearGradient(0, 4 * k, 0, 4.9 * k); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 4 * k, W * k, .9 * k);
    gr = g.createLinearGradient(0, 23 * k, 0, 22.2 * k); gr.addColorStop(0, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 22.2 * k, W * k, .8 * k);
    // asphalt (parking strip + lanes)
    g.fillStyle = pattern(asphalt, 3.2, '#55575b'); g.fillRect(0, CURB_N * k, W * k, (CURB_S - CURB_N) * k);
    g.fillStyle = 'rgba(30,32,38,.45)'; g.fillRect(0, CURB_N * k, W * k, (CURB_S - CURB_N) * k);
    // tyre polish along the lanes
    for (const y of [LANE_A - .8, LANE_A + .8, LANE_B - .8, LANE_B + .8]) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, (y - .3) * k, W * k, .6 * k); }
    // granite kerbs
    for (const y of [CURB_N, CURB_S]) {
      g.fillStyle = '#d9d6cf'; g.fillRect(0, (y - .15) * k, W * k, .3 * k);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, (y + (y === CURB_N ? .15 : -.21)) * k, W * k, .06 * k);
      for (let x = 0; x < W; x += 1) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x * k, (y - .15) * k, .03 * k, .3 * k); }
    }
    // lane markings
    g.fillStyle = 'rgba(245,245,240,.9)';
    for (let x = .5; x < W; x += 4.5) g.fillRect(x * k, (17 - .06) * k, 3 * k, .12 * k);
    // tree pits + canopies (boxwood photo tile as a dense canopy, with a soft drop shadow)
    for (const t of trees) {
      g.fillStyle = 'rgba(60,45,35,.9)'; g.fillRect((t.x - .7) * k, (t.y - .7) * k, 1.4 * k, 1.4 * k);
    }
    for (const t of trees) {
      g.save(); g.translate(t.x * k, t.y * k); g.rotate(t.rot);
      g.shadowColor = 'rgba(10,20,10,.45)'; g.shadowBlur = 1.2 * k; g.shadowOffsetX = .6 * k; g.shadowOffsetY = .7 * k;
      // plane-tree canopy: the leaf cut-out darkened to a mature summer green, with a lit crown
      g.filter = 'brightness(.62) saturate(.8) contrast(1.1)';
      if (veg) g.drawImage(veg, 0, 0, 1024, 1024, -t.r * k, -t.r * k, 2 * t.r * k, 2 * t.r * k);
      g.filter = 'none'; g.shadowColor = 'transparent';
      if (veg) { g.globalAlpha = .55; g.rotate(1.3); g.drawImage(veg, 0, 0, 1024, 1024, -t.r * .62 * k, -t.r * .7 * k, 1.25 * t.r * k, 1.25 * t.r * k); g.globalAlpha = 1; }
      else { g.fillStyle = '#3d6b35'; g.beginPath(); g.arc(0, 0, t.r * k, 0, 7); g.fill(); }
      g.restore();
    }
  }

  /* ---------- dynamic actors ---------- */
  const stallX = i => STALL_W * (i + .5);
  const stalls = Array.from({ length: STALLS }, (_, i) => ({ i, x: stallX(i), car: null, reserved: false }));
  const carsLive = [];       // management-phase cars (park / leave)
  const through = [];        // through traffic on lane B
  let sim = 0, revenue = 0, lastSpawn = 0, lastThrough = 0, populated = false;

  function newCar(img) { const im = img || carImgs[(Math.random() * carImgs.length) | 0]; return { img: im, len: CAR_L * (.92 + Math.random() * .14), x: -6, y: LANE_A, h: 0, brake: 0, rev: 0, state: 'approach', t: 0 }; }
  function toast(html) {
    const el = document.createElement('div'); el.className = 'pk-toast'; el.innerHTML = html;
    ui.toasts.prepend(el);
    gsap.fromTo(el, { y: -14, opacity: 0, scale: .96 }, { y: 0, opacity: 1, scale: 1, duration: .5, ease: 'power3.out' });
    gsap.to(el, { opacity: 0, y: 8, duration: .5, delay: 3.2, ease: 'power2.in', onComplete: () => el.remove() });
    while (ui.toasts.children.length > 3) ui.toasts.lastChild.remove();
  }
  function parkTarget() {
    const free = stalls.filter(s => !s.car && !s.reserved);
    if (!free.length) return null;
    return free[(Math.random() * free.length) | 0];
  }
  function spawnParker() {
    if (carsLive.some(c => c.state === 'approach' || c.state === 'in')) return;  // one manoeuvre at a time on lane A
    const s = parkTarget(); if (!s) return;
    const c = newCar(); c.stall = s; s.reserved = true; carsLive.push(c);
  }
  function populate() {
    if (populated) return; populated = true;
    [1, 2, 4, 6, 7, 10, 12, 13].forEach(i => {
      const c = newCar(); const s = stalls[i];
      Object.assign(c, { x: s.x, y: STALL_Y, h: -Math.PI / 2, state: 'parked', stall: s, stay: 2 + Math.random() * 10 });
      s.car = c; carsLive.push(c);
    });
  }
  function hudUpdate() {
    const occ = stalls.filter(s => s.car && s.car.state === 'parked').length;
    ui.occ.textContent = Math.round(occ / STALLS * 100) + '%';
    ui.occBar.style.transform = `scaleX(${occ / STALLS})`;
    ui.free.textContent = String(STALLS - occ);
    ui.rev.textContent = euro(revenue);
  }

  function stepCars(dt, live) {
    // management phase: arrivals & departures
    if (live) {
      populate();
      if (sim - lastSpawn > 2.4 + Math.random() * 2) { lastSpawn = sim; spawnParker(); }
    }
    for (let k = carsLive.length - 1; k >= 0; k--) {
      const c = carsLive[k]; const s = c.stall;
      c.t += dt;
      if (c.state === 'approach') {
        const ex = s.x - 5.6;
        const v = 8 * clamp((ex - c.x) / 6, .3, 1);
        c.x = Math.min(ex, c.x + v * dt); c.y = LANE_A; c.h = 0; c.brake = (ex - c.x) < 6 ? 1 : 0;
        if (c.x >= ex - 1e-3) { c.state = 'in'; c.t = 0; }
      } else if (c.state === 'in') {
        const T = 2.4, u = easeIO(clamp(c.t / T));
        const P0x = s.x - 5.6, P1x = s.x - 2.6, P2x = s.x, P3x = s.x, P0y = LANE_A, P1y = LANE_A, P2y = STALL_Y + 2.8, P3y = STALL_Y;
        c.x = bez(P0x, P1x, P2x, P3x, u); c.y = bez(P0y, P1y, P2y, P3y, u);
        c.h = Math.atan2(bezD(P0y, P1y, P2y, P3y, Math.max(u, .001)), bezD(P0x, P1x, P2x, P3x, Math.max(u, .001)));
        c.brake = u > .7 ? 1 : .3;
        if (c.t >= T) {
          c.state = 'parked'; c.t = 0; c.stay = 5 + Math.random() * 9; c.brake = 0; s.car = c; s.reserved = false;
          const mins = [30, 45, 60, 90, 120][(Math.random() * 5) | 0], eur = mins / 60 * 1.6;
          revenue += eur;
          toast(`<i></i><b>Stallo ${String(s.i + 1).padStart(2, '0')}</b><span>Sosta pagata al parcometro · ${mins >= 60 ? (mins / 60).toString().replace('.', ',') + ' h' : mins + ' min'}</span>`);
          hudUpdate();
        }
      } else if (c.state === 'parked') {
        c.h = -Math.PI / 2; c.x = s.x; c.y = STALL_Y;
        if (live && c.t > c.stay && !carsLive.some(o => o !== c && (o.state === 'out' || (o.state === 'in' && Math.abs(o.stall.x - s.x) < 7)))) { c.state = 'out'; c.t = 0; hudUpdate(); }
      } else if (c.state === 'out') {
        // reverse out to the left, then pull away eastwards
        const T = 2.6, u = easeIO(clamp(c.t / T));
        const P0x = s.x, P1x = s.x, P2x = s.x - 2.0, P3x = s.x - 4.4, P0y = STALL_Y, P1y = STALL_Y + 2.4, P2y = LANE_A, P3y = LANE_A;
        c.x = bez(P0x, P1x, P2x, P3x, u); c.y = bez(P0y, P1y, P2y, P3y, u);
        const dx = bezD(P0x, P1x, P2x, P3x, Math.max(u, .001)), dy = bezD(P0y, P1y, P2y, P3y, Math.max(u, .001));
        c.h = Math.atan2(-dy, -dx); c.rev = 1; c.brake = u > .85 ? 1 : 0;
        if (c.t >= T) { c.state = 'exit'; c.t = 0; c.rev = 0; s.car = null; c.vx = 0; hudUpdate(); }
      } else if (c.state === 'exit') {
        c.vx = Math.min(9, (c.vx || 0) + 4 * dt); c.x += c.vx * dt; c.h = 0; c.brake = 0;
        if (c.x > W + 6) carsLive.splice(k, 1);
      }
    }
    // through traffic, westbound
    if (sim - lastThrough > 3 + Math.random() * 3.5) { lastThrough = sim; through.push({ ...newCar(), x: W + 6, y: LANE_B, h: Math.PI, v: 9 + Math.random() * 3 }); }
    for (let k = through.length - 1; k >= 0; k--) { const c = through[k]; c.x -= c.v * dt; if (c.x < -7) through.splice(k, 1); }
  }

  /* ---------- drawing ---------- */
  function drawCar(g, c, k, alpha = 1) {
    if (!c.img) return;
    const len = c.len, wid = len * c.img.width / c.img.height;
    g.save(); g.globalAlpha = alpha;
    g.translate(c.x * k, c.y * k); g.rotate(c.h + Math.PI / 2);
    g.shadowColor = 'rgba(0,0,0,.42)'; g.shadowBlur = .55 * k; g.shadowOffsetX = .25 * k; g.shadowOffsetY = .35 * k;
    g.drawImage(c.img, -wid / 2 * k, -len / 2 * k, wid * k, len * k);
    g.shadowColor = 'transparent';
    // brake / reverse lights
    if (c.brake || c.rev) {
      g.globalCompositeOperation = 'lighter';
      for (const sx of [-.32, .32]) {
        const gx = sx * wid * k, gy = len / 2 * k * .96;
        const rg = g.createRadialGradient(gx, gy, 0, gx, gy, .7 * k);
        const col = c.rev ? '255,255,240' : '255,40,30';
        rg.addColorStop(0, `rgba(${col},${.55 * Math.max(c.brake, c.rev)})`); rg.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = rg; g.fillRect(gx - .7 * k, gy - .7 * k, 1.4 * k, 1.4 * k);
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
  function drawVan(g, x, y, k, hazard) {
    const L = 5.2, Wd = 2.1;
    g.save(); g.translate(x * k, y * k);
    g.shadowColor = 'rgba(0,0,0,.42)'; g.shadowBlur = .6 * k; g.shadowOffsetX = .25 * k; g.shadowOffsetY = .35 * k;
    g.fillStyle = '#f4f5f7'; roundRect(g, -L / 2 * k, -Wd / 2 * k, L * k, Wd * k, .35 * k); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#20252c'; roundRect(g, (L / 2 - 1.35) * k, -Wd / 2 * .86 * k, .55 * k, Wd * .86 * k, .12 * k); g.fill();   // windscreen
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = .04 * k;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo((-L / 2 + .5 + i * .8) * k, -Wd / 2 * .7 * k); g.lineTo((-L / 2 + .5 + i * .8) * k, Wd / 2 * .7 * k); g.stroke(); }
    g.fillStyle = '#e25861'; g.fillRect(-L / 2 * k, -.12 * k, (L - 1.5) * k, .24 * k);                                        // livery stripe
    g.fillStyle = hazard ? '#ffb020' : '#a36a10'; g.beginPath(); g.arc((L / 2 - 1.75) * k, 0, .16 * k, 0, 7); g.fill();          // beacon
    if (hazard) { g.globalCompositeOperation = 'lighter'; const rg = g.createRadialGradient((L / 2 - 1.75) * k, 0, 0, (L / 2 - 1.75) * k, 0, 1.6 * k); rg.addColorStop(0, 'rgba(255,170,30,.6)'); rg.addColorStop(1, 'rgba(255,170,30,0)'); g.fillStyle = rg; g.fillRect((L / 2 - 3.4) * k, -1.6 * k, 3.2 * k, 3.2 * k); g.globalCompositeOperation = 'source-over'; }
    g.restore();
  }
  function drawMeter(g, k, appear, active, t) {
    if (appear <= 0) return;
    const drop = (1 - easeOut(appear)) * 3;
    const sc = .6 + .4 * easeOut(appear);
    g.save(); g.translate(METER.x * k, (METER.y - drop) * k); g.scale(sc, sc);
    g.shadowColor = `rgba(0,0,0,${.45 * appear})`; g.shadowBlur = (.3 + drop * .4) * k; g.shadowOffsetX = (.2 + drop * .5) * k; g.shadowOffsetY = (.25 + drop * .6) * k;
    g.fillStyle = '#2a2f36'; roundRect(g, -.32 * k, -.22 * k, .64 * k, .44 * k, .08 * k); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#3d5a7a'; roundRect(g, -.28 * k, -.2 * k, .56 * k, .2 * k, .04 * k); g.fill();                              // solar panel
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = .02 * k; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo((-.28 + i * .14) * k, -.2 * k); g.lineTo((-.28 + i * .14) * k, 0); g.stroke(); }
    g.fillStyle = active ? '#8fe3b0' : '#111'; g.fillRect(-.12 * k, .05 * k, .24 * k, .09 * k);                                // display
    g.restore();
    if (active) {
      const ph = (t % 1.6) / 1.6;
      g.strokeStyle = `rgba(226,88,97,${(1 - ph) * .8})`; g.lineWidth = .08 * k;
      g.beginPath(); g.arc(METER.x * k, METER.y * k, (.5 + ph * 1.8) * k, 0, 7); g.stroke();
    }
  }
  function drawStallLines(g, k, paint) {
    if (paint <= 0) return;
    g.strokeStyle = '#2f6fe0'; g.lineWidth = .13 * k; g.lineCap = 'butt';
    const n = STALLS + 1;
    for (let i = 0; i < n; i++) {
      const pi = clamp(paint * (n + 3) - i * 1.0, 0, 1);
      if (pi <= 0) continue;
      const x = i * STALL_W;
      g.globalAlpha = .92;
      g.beginPath(); g.moveTo(x * k, (CURB_N + .25) * k); g.lineTo(x * k, (CURB_N + .25 + 4.85 * pi) * k); g.stroke();
    }
    const pl = clamp(paint * 1.2 - .1);
    g.beginPath(); g.moveTo(0, (CURB_N + 5.1) * k); g.lineTo(W * pl * k, (CURB_N + 5.1) * k); g.stroke();
    // stall numbers + "P" pavement symbol
    g.globalAlpha = .55 * clamp(paint * 2 - 1); g.fillStyle = '#2f6fe0'; g.font = `600 ${.55 * k}px "JetBrains Mono", monospace`; g.textAlign = 'center';
    for (let i = 0; i < STALLS; i++) g.fillText(String(i + 1).padStart(2, '0'), stallX(i) * k, (CURB_N + 4.7) * k);
    g.globalAlpha = 1;
    // P sign on the pavement edge
    const sp = clamp(paint * 2.2 - 1.2);
    if (sp > 0) {
      g.save(); g.translate(13 * k, 7.9 * k); g.scale(sp, sp);
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = .3 * k; g.shadowOffsetX = .15 * k; g.shadowOffsetY = .2 * k;
      g.fillStyle = '#1d5bd6'; roundRect(g, -.45 * k, -.45 * k, .9 * k, .9 * k, .1 * k); g.fill();
      g.shadowColor = 'transparent';
      g.fillStyle = '#fff'; g.font = `700 ${.66 * k}px "Inter Tight", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 0, .03 * k);
      g.restore();
    }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------- phases ---------- */
  let phaseIdx = -1;
  const PHASES = ['Fornitura', 'Installazione', 'Segnaletica', 'Manutenzione', 'Gestione'];
  function setPhase(i) {
    if (i === phaseIdx) return; phaseIdx = i;
    steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('done', k < i); });
    ui.phase.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> ${PHASES[i]}`;
    root.dataset.phase = String(i);
    if (i === 0) toast('<i></i><b>Fornitura</b><span>Fornitura dei parcometri</span>');
    if (i === 1) toast('<i></i><b>Installazione</b><span>Installazione del parcometro su strada</span>');
    if (i === 2) toast('<i></i><b>Segnaletica</b><span>Segnaletica orizzontale e verticale</span>');
    if (i === 3) toast('<i></i><b>Manutenzione</b><span>Manutenzione dei parcometri</span>');
    if (i === 4) toast('<i></i><b>Gestione</b><span>Gestione con personale altamente qualificato</span>');
  }
  function render(dt) {
    const k = S * dpr;
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    const pMeter = range(P, .02, .14), pInst = range(P, .2, .36), pPaint = range(P, .4, .58), pVan = range(P, .6, .8), live = P >= .8;
    setPhase(P < .19 ? 0 : P < .39 ? 1 : P < .59 ? 2 : P < .8 ? 3 : 4);
    drawStallLines(g, k, pPaint);
    // install progress chip
    ui.install.style.opacity = String(pInst > 0 && pInst < 1 ? 1 : 0);
    ui.install.querySelector('i').style.transform = `scaleX(${pInst})`;
    ui.photo.classList.toggle('on', P < .3);
    ui.hud.classList.toggle('on', live);
    // cars
    stepCars(dt, live);
    for (const c of through) drawCar(g, c, k);
    for (const c of carsLive) drawCar(g, c, k, live ? 1 : 0);
    // maintenance van: drives in, stops by the meter with the beacon on, leaves
    if (pVan > 0 && pVan < 1) {
      const a = easeOut(range(pVan, 0, .35)), b = easeIO(range(pVan, .7, 1));
      const vx = -4 + (METER.x - 1.2 + 4) * a + (W + 8 - METER.x + 1.2) * b;
      drawVan(g, vx, LANE_A - .2, k, pVan > .3 && pVan < .75 && (sim % .8) < .4);
      // technician + wrench pulse while stopped
      if (pVan > .35 && pVan < .7) {
        const tw = ease(range(pVan, .35, .45)) * (1 - ease(range(pVan, .6, .7)));
        g.fillStyle = '#e25861'; g.beginPath(); g.arc((METER.x + .7) * k, (METER.y + .6 + (1 - tw) * 3.5) * k, .32 * k, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc((METER.x + .7) * k, (METER.y + .6 + (1 - tw) * 3.5) * k, .15 * k, 0, 7); g.fill();
      }
    }
    drawMeter(g, k, pMeter, pInst > .02, sim);
  }

  /* ---------- loop & scroll ---------- */
  let running = false, last = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; sim += dt;
    render(dt);
    requestAnimationFrame(frame);
  }
  const start = () => { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); };
  const stop = () => { running = false; };
  resize(); hudUpdate(); render(0);
  addEventListener('resize', () => { resize(); render(0); });
  ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: s => (s.isActive ? start() : stop()) });

  if (reduced) P = 1.02;
}
