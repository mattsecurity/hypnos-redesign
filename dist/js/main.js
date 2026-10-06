// HYPNOS — page orchestration: intro, smooth scroll, story HUD, section motion.
import { createStory } from './story.js';

const { gsap, ScrollTrigger } = window;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const range = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth <= 720;

/* ================================================================ */
/*  Smooth scroll                                                    */
/* ================================================================ */
let lenis = null;
if (!reduced && window.Lenis) {
  lenis = new window.Lenis({ lerp: .085, wheelMultiplier: .9, touchMultiplier: 1.4 });
  lenis.stop();
  window.__lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const scrollTo = target => {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
};
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  if (id.length < 2 && id !== '#') return;
  e.preventDefault();
  closeMenu();
  scrollTo(id === '#top' || id === '#' ? document.body : id);
}));

/* ================================================================ */
/*  Nav                                                              */
/* ================================================================ */
const nav = $('#nav');
const burger = $('#burger');
const links = $('#nav-links');
function closeMenu() { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
burger.addEventListener('click', () => {
  const open = !links.classList.contains('open');
  links.classList.toggle('open', open);
  burger.setAttribute('aria-expanded', String(open));
});
function updateNav() {
  const y = 38;
  let mode = 'story';
  for (const sec of $$('[data-nav]')) {
    const r = sec.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) { mode = sec.dataset.nav; break; }
  }
  nav.classList.toggle('is-light', mode === 'light');
  nav.classList.toggle('is-dark-solid', mode === 'dark');
}

/* ================================================================ */
/*  Intro: logo draws itself, then flies into the nav                */
/* ================================================================ */
const loader = $('#loader');
const loaderBar = $('#loader-bar');
const loaderPct = $('#loader-pct');
let loadP = 0;
const setLoad = p => {
  loadP = Math.max(loadP, p);
  gsap.to(loaderBar, { scaleX: loadP, duration: .4, ease: 'power2.out', overwrite: true });
  loaderPct.textContent = `${Math.round(loadP * 100)}%`;
};
const introTl = gsap.timeline({ paused: true })
  .to('.loader__mark .draw', { strokeDashoffset: 0, duration: 1.5, ease: 'power3.inOut' })
  .to('.loader__word span', { yPercent: -105, duration: .9, stagger: .05, ease: 'power4.out' }, '-=.75')
  .to('.loader__claim', { opacity: 1, duration: .8 }, '-=.5');
gsap.set('.brand', { opacity: 0 });
introTl.play();
const introDone = new Promise(r => introTl.eventCallback('onComplete', r));

async function outro() {
  const logo = $('#loader-logo');
  const target = $('.brand');
  const a = logo.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const s = b.height / a.height * 1.1;
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  const tl = gsap.timeline();
  tl.to('.loader__meta', { opacity: 0, y: 10, duration: .4, ease: 'power2.in' })
    .to(logo, { x: dx, y: dy, scale: s, color: '#ffffff', duration: 1.15, ease: 'expo.inOut' }, '<.1')
    .to(loader, { backgroundColor: 'rgba(255,255,255,0)', duration: .9, ease: 'power2.inOut' }, '<.35')
    .set(target, { opacity: 1 })
    .to(logo, { opacity: 0, duration: .25 })
    .add(() => { loader.remove(); document.body.classList.remove('is-loading'); lenis && lenis.start(); }, '<')
    .set('.chapter--hero', { opacity: 1 }, '<')
    .fromTo('.chapter--hero > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, stagger: .1, ease: 'power3.out' }, '-=.8')
    .fromTo(['.nav__links', '.nav__cta', '.nav__burger', '.rail', '.scroll-hint'], { opacity: 0 }, { opacity: 1, duration: 1, stagger: .05 }, '<.2');
  await tl;
}

/* ================================================================ */
/*  Story                                                            */
/* ================================================================ */
const storyEl = $('#story');
const chapters = $$('.chapter');
const railItems = $$('#rail span');
const hint = $('#scroll-hint');
const reticle = $('#reticle');
const target = $('#target');
const feed = $('#feed');
const boxCar = $('#box-car');
const boxPlate = $('#box-plate');
const scan = $('#box-plate .scan');
const read = $('#read');
const ocr = $('#ocr');
const checks = $$('#checks li');
const checksEl = $('#checks');
const rail = $('#rail');
const sticky = $('.story__sticky');
const logged = $('#logged');
const clockEl = $('#feed-clock');
const loggedTime = $('#logged-time');
let story = null;
let storyP = 0;
let heroIntroDone = false;

function storyProgress() {
  const r = storyEl.getBoundingClientRect();
  const span = storyEl.offsetHeight - innerHeight;
  return { p: clamp(-r.top / span), visible: r.bottom > 0 && r.top < innerHeight };
}

function updateChapters(p) {
  for (const c of chapters) {
    const a = parseFloat(c.dataset.in), b = parseFloat(c.dataset.out);
    const w = .022;
    let o = Math.min(range(p, a, a + w), 1 - range(p, b - w, b));
    if (c.classList.contains('chapter--hero')) {
      if (!heroIntroDone) continue;
      o = 1 - range(p, b - .06, b);
      c.style.opacity = o;
      c.style.transform = `translateY(calc(-50% - ${(1 - o) * 60}px))`;
      continue;
    }
    c.style.opacity = o;
    c.style.transform = `translateY(${(1 - o) * (p < a + w ? 30 : -30)}px)`;
    c.style.visibility = o < .01 ? 'hidden' : 'visible';
  }
  let active = 0;
  railItems.forEach((r, i) => { if (p >= parseFloat(r.dataset.at) - .001) active = i; });
  railItems.forEach((r, i) => r.classList.toggle('is-on', i === active));
  if (hint) hint.style.opacity = heroIntroDone ? String(1 - range(p, .005, .03)) : '';
  // the sequence closes into a card, handing over to the white page
  const k = ease(range(p, .965, 1));
  sticky.style.transform = k > 0 ? `scale(${1 - k * .08})` : '';
  sticky.style.borderRadius = k > 0 ? `${k * 28}px` : '';
  storyEl.querySelector('.story__shade').style.opacity = String(1 - .55 * range(p, .64, .68));
  if (heroIntroDone) rail.style.opacity = String(1 - range(p, .62, .645));
}

const pad = n => String(n).padStart(2, '0');
const BASE = { h: 20, m: 47, s: 12 };
function clockString(t, withMs = true) {
  const total = BASE.h * 3600 + BASE.m * 60 + BASE.s + t;
  const h = Math.floor(total / 3600) % 24, m = Math.floor(total / 60) % 60, s = Math.floor(total) % 60;
  const ms = Math.floor((total % 1) * 100);
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ${pad(h)}:${pad(m)}:${pad(s)}${withMs ? '.' + pad(ms) : ''}`;
}

const GLYPHS = 'ABCDEFGHKLMNPRSTVXYZ0123456789';
let lastOcr = '';
function ocrText(p, plate) {
  const t = range(p, .745, .79);
  const chars = plate.split('');
  const nonSpace = chars.filter(c => c !== ' ').length;
  const done = Math.floor(t * (nonSpace + 1));
  let k = 0;
  return chars.map(c => {
    if (c === ' ') return ' ';
    const i = k++;
    if (i < done) return c;
    if (i === done && t > 0 && t < 1) return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    return '·';
  }).join('');
}

function place(el, box) {
  if (!box) { el.style.opacity = 0; return false; }
  el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
  el.style.width = `${box.w}px`; el.style.height = `${box.h}px`;
  return true;
}

function drawPlateCrop(src) {
  const c = $('#plate-crop'); if (!c || !src) return;
  const g = c.getContext('2d');
  g.filter = 'grayscale(.35) contrast(1.15) brightness(1.05) blur(.6px)';
  g.drawImage(src, 0, 0, c.width, c.height);
  g.filter = 'none';
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - .5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

function onStoryFrame(h) {
  const p = h.p;
  // aerial reticle on the hero car
  const ro = ease(range(p, .31, .34)) * (1 - ease(range(p, .44, .47)));
  if (ro > .01 && place(reticle, h.carBox)) reticle.style.opacity = ro; else reticle.style.opacity = 0;
  // checkpoint marker
  const to = ease(range(p, .465, .49)) * (1 - ease(range(p, .53, .55)));
  if (to > .01 && h.pole) { target.style.opacity = to; target.style.transform = `translate3d(${h.pole.x}px, ${h.pole.y}px, 0)`; } else target.style.opacity = 0;
  // feed
  const fo = ease(range(p, .646, .665)) * (1 - ease(range(p, .975, .998)));
  feed.style.opacity = fo;
  if (fo < .01) return;
  clockEl.textContent = clockString(h.time);
  const co = ease(range(p, .675, .695));
  if (co > .01 && place(boxCar, h.carBox)) boxCar.style.opacity = co * .9; else boxCar.style.opacity = 0;
  const po = ease(range(p, .71, .725));
  if (po > .01 && h.plateBox) {
    const b = { ...h.plateBox };
    const grow = Math.max(0, 34 - b.w) / 2; // keep the plate box legible when far
    b.x -= grow; b.w += grow * 2; b.y -= grow * .3; b.h += grow * .6;
    place(boxPlate, b); boxPlate.style.opacity = po;
    scan.style.transform = `translateY(${(range(p, .715, .745) * 1.0) * b.h}px)`;
    scan.style.opacity = p < .745 ? .9 : 0;
    const ro2 = ease(range(p, .735, .75));
    read.style.opacity = ro2;
    read.style.transform = `translateY(${(1 - ro2) * 12}px)`;
  } else { boxPlate.style.opacity = 0; read.style.opacity = 0; }
  const txt = ocrText(p, story.plate);
  if (txt !== lastOcr) { ocr.textContent = txt; lastOcr = txt; }
  checksEl.style.opacity = ease(range(p, .792, .802));
  checks.forEach((li, i) => {
    const o = ease(range(p, .8 + i * .0125, .812 + i * .0125));
    li.style.opacity = o; li.style.transform = `translateX(${(1 - o) * 14}px)`;
  });
  const lo = ease(range(p, .93, .945));
  logged.style.opacity = lo;
  if (lo > 0 && !loggedTime.textContent) loggedTime.textContent = clockString(h.time, false).split('  ')[1];
}

async function initStory() {
  const canvas = $('#story-canvas');
  try {
    if (!window.WebGL2RenderingContext) throw new Error('WebGL2 non disponibile');
    story = await createStory({ canvas, onProgress: p => setLoad(.08 + p * .92), quality: (isMobile() || (navigator.hardwareConcurrency || 8) <= 4) ? 'low' : 'high' });
    story.onFrame(onStoryFrame);
    drawPlateCrop(story.plateCanvas);
    const { p } = storyProgress(); story.jump(p);
    story.renderOnce();
    addEventListener('resize', () => story.resize());
  } catch (err) {
    console.warn('Story fallback:', err);
    storyEl.classList.add('is-fallback');
    story = null;
  }
}

function tick() {
  const { p, visible } = storyProgress();
  storyP = p;
  if (story) {
    story.setProgress(p);
    if (visible) story.start(); else story.stop();
  }
  updateChapters(p);
  updateNav();
}

/* ================================================================ */
/*  Section motion                                                   */
/* ================================================================ */
function splitLines(el) {
  const parts = el.innerHTML.split(/<br\s*\/?>/i);
  el.innerHTML = parts.map(h => `<span class="line"><span>${h.trim()}</span></span>`).join('');
  return $$('.line > span', el);
}

function sectionMotion() {
  // headings: lines rise
  $$('h2.split').forEach(h => {
    const lines = splitLines(h);
    gsap.from(lines, { yPercent: 110, duration: 1.2, stagger: .09, ease: 'power4.out', scrollTrigger: { trigger: h, start: 'top 86%' } });
  });
  // eyebrows / paragraphs fade
  $$('section:not(.story) .eyebrow, .solutions__intro, .parking__copy > p, .pipeline__head p, .software__copy > p, .company__main > p, .contact__copy > p, .manifesto__pills, .kpis, .audience, .tributi, .contact__list, .form')
    .forEach(el => gsap.from(el, { y: 26, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } }));

  // manifesto: words light up with scroll
  const m = $('#manifesto');
  m.innerHTML = m.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
  const words = $$('.w', m);
  ScrollTrigger.create({
    trigger: m, start: 'top 80%', end: 'bottom 45%', scrub: true,
    onUpdate: s => { const n = Math.round(s.progress * words.length); words.forEach((w, i) => w.classList.toggle('on', i < n)); },
  });

  // solutions: horizontal pinned gallery (desktop) / swipe (mobile)
  const track = $('#htrack');
  const cards = $$('.card', track);
  const mm = gsap.matchMedia();
  mm.add('(min-width: 721px)', () => {
    const dist = () => track.scrollWidth - innerWidth;
    const tween = gsap.to(track, { x: () => -dist(), ease: 'none' });
    const st = ScrollTrigger.create({
      trigger: '#soluzioni', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: .8, animation: tween, invalidateOnRefresh: true,
      onUpdate: () => cards.forEach(c => {
        const r = c.getBoundingClientRect();
        const k = ((r.left + r.width / 2) / innerWidth - .5);
        c.style.setProperty('--px', `${-8 - k * 10}%`);
      }),
    });
    gsap.from(cards, { y: 80, opacity: 0, duration: 1.2, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: track, start: 'top 85%' } });
    return () => { st.kill(); tween.kill(); gsap.set(track, { x: 0 }); };
  });
  mm.add('(max-width: 720px)', () => {
    const hs = $('#hscroll');
    hs.style.overflowX = 'auto'; hs.style.scrollSnapType = 'x mandatory';
    cards.forEach(c => { c.style.scrollSnapAlign = 'center'; });
    return () => { hs.style.overflowX = ''; };
  });

  // parking photo reveal + parallax
  gsap.fromTo('.parking__photo', { clipPath: 'inset(18% 18% 18% 18% round 24px)' }, { clipPath: 'inset(0% 0% 0% 0% round 24px)', ease: 'none', scrollTrigger: { trigger: '.parking__visual', start: 'top 90%', end: 'center 55%', scrub: true } });
  gsap.fromTo('.parking__photo img', { yPercent: -8 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.parking__visual', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('#parking-list li', { x: -20, opacity: 0, duration: .9, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: '#parking-list', start: 'top 85%' } });
  gsap.from('.parking__plan', { y: 60, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.parking__visual', start: 'top 60%' } });
  parkingPlan();

  // pipeline: line draws, steps light up
  const steps = $$('.flow__step');
  ScrollTrigger.create({
    trigger: '#flow', start: 'top 75%', end: 'bottom 45%', scrub: .6,
    onUpdate: s => {
      $('#flow-prog').style.strokeDashoffset = String(1000 - s.progress * 1000);
      steps.forEach((st, i) => st.classList.toggle('on', s.progress >= i / (steps.length - 1) - .02 || (isMobile() && s.progress > i / steps.length)));
    },
  });
  gsap.fromTo('.pipeline__bg img', { yPercent: -10 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.pipeline', start: 'top bottom', end: 'bottom top', scrub: true } });

  // software dashboard
  gsap.from('#dash', { y: 90, rotateX: 10, opacity: 0, transformPerspective: 1400, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: '#dash', start: 'top 85%' } });
  liveDashboard();

  // method progress
  gsap.fromTo('#method-fill', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#method', start: 'top 75%', end: 'bottom 60%', scrub: .6 } });
  gsap.from('.method__step', { y: 40, opacity: 0, duration: 1, stagger: .1, ease: 'power3.out', scrollTrigger: { trigger: '#method', start: 'top 80%' } });
}

/* parking plan: stalls draw, cars arrive & leave */
function parkingPlan() {
  const svg = $('#parking-plan');
  const NS = 'http://www.w3.org/2000/svg';
  const stalls = svg.querySelector('.pl-stalls');
  const carsG = svg.querySelector('.pl-cars');
  const n = 9, x0 = 40, w = 58, y0 = 70, h = 92;
  for (let i = 0; i <= n; i++) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x0 + i * w); l.setAttribute('x2', x0 + i * w); l.setAttribute('y1', y0); l.setAttribute('y2', y0 + h);
    l.style.strokeDasharray = h; l.style.strokeDashoffset = h; stalls.appendChild(l);
  }
  const top = document.createElementNS(NS, 'line');
  top.setAttribute('x1', x0); top.setAttribute('x2', x0 + n * w); top.setAttribute('y1', y0 + h); top.setAttribute('y2', y0 + h);
  top.style.strokeDasharray = n * w; top.style.strokeDashoffset = n * w; stalls.appendChild(top);
  const cars = [];
  for (let i = 0; i < n; i++) {
    // real top-down cars (generated), nose in or out at random
    const r = document.createElementNS(NS, 'g');
    const LEN = [4.0, 4.8, 4.5, 4.8, 4.2, 4.6];           // metres, per model
    const model = i % 6;
    const ch = (h - 12) * LEN[model] / 4.8, cw = ch * .52, cx = x0 + i * w + (w - cw) / 2, cy = y0 + 6 + (h - 12 - ch) / 2;
    const flip = (i * 7) % 3 === 0;
    r.innerHTML = `<image href="assets/img/cars/car-${model + 1}.webp" x="${cx}" y="${cy}" width="${cw}" height="${ch}" preserveAspectRatio="xMidYMid meet"${flip ? ` transform="rotate(180 ${cx + cw / 2} ${cy + ch / 2})"` : ''}/>`;
    r.style.opacity = 0;
    carsG.appendChild(r); cars.push({ el: r, on: false });
  }
  const occ = $('#pl-occ');
  const setOcc = () => { occ.textContent = `OCCUPAZIONE ${Math.round(cars.filter(c => c.on).length / n * 100)}%`; };
  const arrive = (c, d = 0) => { c.on = true; gsap.fromTo(c.el, { opacity: 0, y: -60 }, { opacity: 1, y: 0, duration: .9, delay: d, ease: 'power3.out', onStart: setOcc }); };
  const leave = c => { c.on = false; gsap.to(c.el, { opacity: 0, y: -60, duration: .8, ease: 'power2.in', onComplete: setOcc }); };
  let timer = null;
  ScrollTrigger.create({
    trigger: svg, start: 'top 85%', once: true,
    onEnter: () => {
      gsap.to($$('line', stalls), { strokeDashoffset: 0, duration: .9, stagger: .06, ease: 'power2.inOut' });
      [0, 1, 3, 4, 6, 8].forEach((i, k) => arrive(cars[i], .8 + k * .15));
      timer = setInterval(() => {
        if (document.hidden) return;
        const c = cars[Math.floor(Math.random() * n)];
        c.on ? leave(c) : arrive(c);
      }, 1700);
    },
  });
}

/* live dashboard rows */
function liveDashboard() {
  const list = $('#dash-list');
  const countEl = $('#dash-count');
  const spark = $('#spark');
  const L = 'ABCDEFGHJKLMNPRSTVWXYZ';
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const plate = () => `${rnd(L)}${rnd(L)} ${100 + Math.floor(Math.random() * 899)} ${rnd(L)}${rnd(L)}`;
  const gates = ['CAM 04', 'ZTL 02', 'VEL 01', 'ZTL 05', 'CAM 07'];
  let count = 12480;
  let t = 0;
  const pts = Array.from({ length: 24 }, (_, i) => 16 + Math.sin(i * .7) * 6 + Math.random() * 6);
  const drawSpark = () => spark.setAttribute('points', pts.map((v, i) => `${(i / (pts.length - 1)) * 120},${32 - v}`).join(' '));
  drawSpark();
  const add = () => {
    t += 1;
    const now = new Date();
    const li = document.createElement('li');
    const warn = Math.random() < .12;
    li.innerHTML = `<span>${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}</span><span>${plate()}</span><span>${rnd(gates)}</span><span class="st${warn ? ' warn' : ''}">${warn ? 'Verifica' : 'Regolare'}</span>`;
    list.prepend(li);
    while (list.children.length > 10) list.lastChild.remove();
    count += 1 + Math.floor(Math.random() * 3);
    countEl.textContent = count.toLocaleString('it-IT');
    pts.push(12 + Math.random() * 16); pts.shift(); drawSpark();
  };
  for (let i = 0; i < 9; i++) add();
  let iv = null;
  ScrollTrigger.create({ trigger: '#dash', start: 'top bottom', end: 'bottom top', onToggle: s => { clearInterval(iv); if (s.isActive) iv = setInterval(() => !document.hidden && add(), 1400); } });
}

/* ================================================================ */
/*  Contact form → mailto with summary                               */
/* ================================================================ */
function contactForm() {
  const form = $('#contact-form');
  const dlg = $('#mail-dialog');
  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    for (const id of ['f-name', 'f-email', 'f-msg']) {
      const f = $('#' + id);
      const bad = !f.value.trim() || (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value));
      f.parentElement.classList.toggle('invalid', bad); ok = ok && !bad;
    }
    const priv = $('#f-privacy');
    priv.parentElement.classList.toggle('invalid', !priv.checked); ok = ok && priv.checked;
    if (!ok) { $('#form-note').textContent = 'Compila i campi evidenziati e accetta l’informativa.'; return; }
    const d = new FormData(form);
    const topics = d.getAll('topic');
    const body = [
      `Nome: ${d.get('name')}`, d.get('ente') ? `Ente: ${d.get('ente')}` : '', `E-mail: ${d.get('email')}`, d.get('phone') ? `Telefono: ${d.get('phone')}` : '',
      topics.length ? `Interesse: ${topics.join(', ')}` : '', '', d.get('message'),
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    const subject = `Richiesta informazioni${topics.length ? ' — ' + topics.join(', ') : ''}`;
    $('#mail-summary').textContent = `Oggetto: ${subject}\n\n${body}`;
    $('#mail-link').href = `mailto:info@hypnosweb.it?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    dlg.showModal();
  });
  $('#mail-close').addEventListener('click', () => dlg.close());
  $('#mail-link').addEventListener('click', () => setTimeout(() => dlg.close(), 300));
}

/* ================================================================ */
/*  Boot                                                             */
/* ================================================================ */
(async function boot() {
  setLoad(.04);
  const timeout = new Promise(r => setTimeout(r, 15000));
  await Promise.race([initStory(), timeout]);
  setLoad(1);
  await introDone;
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
  tick();
  sectionMotion();
  contactForm();
  gsap.ticker.add(tick);
  await outro();
  heroIntroDone = true;
  ScrollTrigger.refresh();
  window.__go = p => { const y = storyEl.offsetTop + p * (storyEl.offsetHeight - innerHeight); lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y); };
  // debug hook: ?p=0.5 jumps into the sequence
  const q = new URLSearchParams(location.search).get('p');
  if (q !== null) { const y = storyEl.offsetTop + parseFloat(q) * (storyEl.offsetHeight - innerHeight); lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y); }
})();
