// HYPNOS — "Dal rilevamento al verbale": the five parts of the service as stated by HYPNOS
// (equipment for rent/sale → speed control → integrated ticket service → software → continuous support).
// The section is pinned; scroll progress (0…5) drives a deterministic render, so scrubbing back and forth is exact.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const range = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const back = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export function initPipeline({ gsap, ScrollTrigger }) {
  const root = document.getElementById('verbali');
  if (!root) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const scenes = $$('.pv-scene');
  const steps = $$('#pv-steps li');
  const fill = $('#pv-fill');
  const status = $('#pv-status');
  const STATUS = ['Apparecchiature', 'Controllo velocità', 'Verbali', 'Software', 'Supporto'];

  // 1 · equipment
  const gear = $$('.pv-gear figure'), modes = $$('.pv-modes span');
  // 2 · speed check (illustrative)
  const box = $('.pv-box'), gauge = $('#pv-gauge'), speed = $('#pv-speed'), facts = $$('.pv-facts p'), tag = $('.pv-tag'), time = $('.pv-time');
  // 3 · ticket (illustrative)
  const doc = $('.pv-doc'), fields = $$('.pv-doc dd');
  const qr = $('#pv-qr'); const qrCells = [];
  {
    let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const finder = (x, y) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (i === 0 || i === 6 || j === 0 || j === 6 || (i > 1 && i < 5 && j > 1 && j < 5)) qrCells.push([x + i, y + j]); };
    finder(0, 0); finder(14, 0); finder(0, 14);
    for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) {
      const inF = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12);
      if (!inF && R() < .48) qrCells.push([i, j]);
    }
    qrCells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    qr.innerHTML = qrCells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" opacity="0"/>`).join('');
  }
  const qrRects = [...qr.children];
  // 4 · software (illustrative interface)
  const rowsEl = $('#pv-rows');
  const ROWS = [['GM 471 KX', 'Controllo velocità'], ['FT 208 LP', 'Tutor'], ['EK 553 RS', 'ZTL'], ['DB 914 MC', 'Controllo velocità'], ['HA 360 VT', 'Tutor']];
  rowsEl.insertAdjacentHTML('beforeend', ROWS.map(([pl, ap]) => `<div class="pv-row"><span>${pl}</span><span>${ap}</span><em>Gestito</em></div>`).join(''));
  const rows = [...rowsEl.querySelectorAll('.pv-row:not(.pv-row--head)')];
  const bars = $('#pv-bars');
  const MONTHS = ['Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott'], VALS = [.52, .64, .58, .42, .78, .9];
  bars.innerHTML = MONTHS.map(m => `<i data-m="${m}"></i>`).join('');
  const barEls = [...bars.children];
  // 5 · support
  const support = $$('.pv-support li');

  let lastP = -1;
  function render(p) {
    if (Math.abs(p - lastP) < 1e-4) return; lastP = p;
    const active = Math.min(4, Math.floor(p + .02));
    scenes.forEach((sc, i) => {
      const inn = i === 0 ? 1 : ease(range(p, i - .14, i + .06));
      const out = i === 4 ? 0 : ease(range(p, i + .86, i + 1.02));
      const v = inn * (1 - out);
      sc.style.opacity = v; sc.style.visibility = v > .01 ? 'visible' : 'hidden';
      sc.style.transform = `translateY(${(1 - inn) * 26 - out * 18}px) scale(${.985 + .015 * v})`;
    });
    steps.forEach((li, i) => { li.classList.toggle('on', i === active); li.classList.toggle('done', i < active); });
    fill.style.transform = `scaleY(${clamp(p / 4.4)})`;
    status.textContent = STATUS[active];
    status.classList.toggle('ok', active >= 2);

    // 1 · equipment: three device photos deal in, then rental / sale / management
    gear.forEach((f, i) => {
      const t = easeOut(range(p, .02 + i * .12, .32 + i * .12));
      f.style.opacity = t; f.style.transform = `translateY(${(1 - t) * 40}px) rotate(${(1 - t) * (i - 1) * 6}deg)`;
    });
    modes.forEach((m, i) => { const t = range(p, .45 + i * .1, .58 + i * .1); m.style.opacity = t; m.style.transform = `translateY(${(1 - easeOut(t)) * 12}px)`; });

    // 2 · speed check
    const lock = easeOut(range(p, 1.02, 1.3));
    box.style.opacity = lock; box.style.transform = `scale(${1.6 - .6 * lock})`;
    const v = Math.round(82 * easeOut(range(p, 1.12, 1.6)));
    speed.textContent = v;
    gauge.style.strokeDashoffset = String(157 * (1 - v / 140));
    gauge.style.stroke = v > 70 ? 'var(--accent)' : '#ffffff';
    facts.forEach((f, i) => { const t = range(p, 1.35 + i * .12, 1.5 + i * .12); f.style.opacity = t; f.style.transform = `translateX(${(1 - easeOut(t)) * 16}px)`; });
    tag.style.opacity = range(p, 1.05, 1.2); time.style.opacity = range(p, 1.2, 1.35);

    // 3 · ticket: sheet rises, fields type in, code builds
    const up = easeOut(range(p, 1.9, 2.15));
    doc.style.transform = `translateY(${(1 - up) * 50}px) rotate(${(1 - up) * -3}deg)`;
    fields.forEach((dd, i) => {
      const full = dd.dataset.type; const n = Math.round(full.length * range(p, 2.12 + i * .1, 2.22 + i * .1));
      const txt = full.slice(0, n) + (n > 0 && n < full.length ? '▍' : '');
      if (dd.textContent !== txt) dd.textContent = txt;
    });
    const q = range(p, 2.62, 2.82); const nq = Math.round(qrRects.length * q);
    qrRects.forEach((r, i) => r.setAttribute('opacity', i < nq ? '1' : '0'));

    // 4 · software: rows stream in, chart grows
    rows.forEach((r, i) => { const t = range(p, 3.05 + i * .09, 3.18 + i * .09); r.style.opacity = t; r.style.transform = `translateX(${(1 - easeOut(t)) * -18}px)`; });
    barEls.forEach((b, i) => { const t = back(range(p, 3.2 + i * .05, 3.45 + i * .05)); b.style.height = `${VALS[i] * 100}%`; b.style.transform = `scaleY(${Math.max(0, t)})`; });

    // 5 · support: the commitments tick in order
    support.forEach((li, i) => {
      const t = range(p, 4.02 + i * .08, 4.14 + i * .08);
      li.style.opacity = .35 + .65 * t; li.style.transform = `translateX(${(1 - easeOut(t)) * 18}px)`;
      li.classList.toggle('ok', p > 4.1 + i * .08);
    });
  }

  const proxy = { p: 0 };
  render(0);
  gsap.to(proxy, {
    p: 4.8, ease: 'none',
    scrollTrigger: { trigger: root.querySelector('.pipeline__pin'), pin: true, start: 'top top', end: '+=430%', scrub: .7 },
    onUpdate: () => render(proxy.p),
  });
  gsap.fromTo(root.querySelector('.pipeline__bg img'), { yPercent: -10 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('#pv-panel', { y: 70, opacity: 0, duration: 1.3, ease: 'power3.out', scrollTrigger: { trigger: root, start: 'top 70%' } });
}
