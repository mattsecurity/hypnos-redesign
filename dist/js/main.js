// HYPNOS — page orchestration: intro, smooth scroll, story HUD, section motion.
import { createStory } from './story.js';
import { initParking } from './parking.js';
import { initPipeline } from './pipeline.js';

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
// menu links jump straight to the section (no long scroll through the whole page):
// a short veil hides the cut, the page lands on the target and the veil lifts
const veil = document.createElement('div'); veil.className = 'jump-veil'; document.body.appendChild(veil);
const scrollTo = target => {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return;
  const y = el === document.body ? 0 : el.getBoundingClientRect().top + scrollY;
  const land = () => {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
    ScrollTrigger.update();
    if (story) { const { p } = storyProgress(); story.jump(p); }
  };
  if (reduced) { land(); return; }
  gsap.timeline()
    .to(veil, { opacity: 1, duration: .22, ease: 'power2.in' })
    .add(land)
    .to(veil, { opacity: 0, duration: .45, ease: 'power2.out', delay: .05 });
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
// No loading screen: the hero photo is on the page from the first paint (the 3D scene fades in over it later).
// The night veil lifts with a slight pull-back, the logo assembles in the nav and the hero copy rises: under a second.
gsap.set(['.nav__links', '.nav__cta', '.nav__burger', '.rail', '.scroll-hint', '.chapter--hero > *'], { opacity: 0 });
gsap.set(['.brand__mark .mk', '.brand__word .rg'], { opacity: 0 });

async function opening() {
  document.body.classList.remove('is-loading');
  lenis && lenis.start();
  const tl = gsap.timeline();
  tl.to(loader, { opacity: 0, duration: .9, ease: 'power2.inOut' }, 0)
    .fromTo(sticky, { '--open': 1.07 }, { '--open': 1, duration: 1.6, ease: 'expo.out' }, 0)
    .fromTo('.brand__mark .mk', { opacity: 0, x: i => [-150, 90, 170, -80, -170, 140][i], y: i => [150, -80, 120, -150, 50, -150][i] },
      { opacity: 1, x: 0, y: 0, duration: .75, stagger: .045, ease: 'expo.out' }, .05)
    .fromTo('#hy-reveal-r', { attr: { width: 0 } }, { attr: { width: 400 }, duration: .7, ease: 'power3.inOut' }, .2)
    .fromTo('.brand__word .rg', { opacity: 0, rotation: -150, scale: .5, svgOrigin: '289.4 36.65' }, { opacity: 1, rotation: 0, scale: 1, svgOrigin: '289.4 36.65', duration: .9, ease: 'expo.out' }, .4)
    .set('.chapter--hero', { opacity: 1 }, 0)
    .fromTo('.chapter--hero > *', { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: .9, stagger: .07, ease: 'power3.out' }, .25)
    .fromTo(['.nav__links', '.nav__cta', '.nav__burger', '.rail', '.scroll-hint'], { opacity: 0 }, { opacity: 1, duration: .7, stagger: .04 }, .45)
    .add(() => loader.remove(), .95);
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

// the sticky stage is 100lvh tall: measuring against it (not innerHeight) keeps the progress still while
// mobile toolbars slide in and out
const storySpan = () => storyEl.offsetHeight - sticky.offsetHeight;
function storyProgress() {
  const r = storyEl.getBoundingClientRect();
  const span = storySpan();
  return { p: clamp(-r.top / span), visible: r.bottom > 0 && r.top < innerHeight };
}

// The aerial photo under the canvas is laid out exactly like the scene's first frame (same scale, centre and,
// on portrait screens, the same quarter turn), so the hero shows it while the 3D loads and the cross-fade is seamless.
const fallbackImg = $('.story__fallback');
function fitFallback() {
  const W = sticky.offsetWidth, H = sticky.offsetHeight;
  if (!W || !H) return;
  const MPP = .135, GW = 1536 * MPP, GH = 1024 * MPP, FOCUS = { x: -8, z: -.7 };  // mirror story.js
  const aspect = W / H, portrait = aspect < .9;
  const visH = portrait ? GW * .82 : GH * .92, visW = portrait ? GH * .92 : GW * .92;
  const ppm = H / Math.min(visH, visW / aspect);                 // screen pixels per metre in the first shot
  Object.assign(fallbackImg.style, {
    inset: 'auto', left: '50%', top: '50%', width: `${GW * ppm}px`, height: `${GH * ppm}px`, maxWidth: 'none',
    transform: `translate(-50%, -50%) rotate(${portrait ? -90 : 0}deg) translate(${-FOCUS.x * ppm}px, ${-FOCUS.z * ppm}px)`,
  });
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

// the reticle tag goes where there is room: right of the box, else below it (above the caption), else above it
// (under the nav), else inside the box; it is also kept inside the screen sideways
const reticleTag = $('.reticle__tag');
const targetTag = $('#target span');
function placeReticleTag(box) {
  const W = innerWidth, m = 12, gap = 10;
  const tw = reticleTag.offsetWidth, th = reticleTag.offsetHeight;
  const navB = nav.offsetHeight + 8;
  let capTop = Infinity;
  for (const c of chapters) if (!c.classList.contains('chapter--hero') && parseFloat(c.style.opacity) > .02) capTop = Math.min(capTop, c.getBoundingClientRect().top);
  let mode = 'inside';
  if (box.x + box.w + 14 + tw <= W - m) mode = 'right';
  else if (box.y + box.h + gap + th <= capTop - 12) mode = 'below';
  else if (box.y - gap - th >= navB) mode = 'above';
  if (reticle.dataset.tag !== mode) reticle.dataset.tag = mode;
  const left = mode === 'right' ? box.x + box.w + 14 : box.x + (mode === 'inside' ? 10 : 0);
  const shift = Math.min(0, W - m - (left + tw)) + Math.max(0, m - left);
  reticleTag.style.transform = shift ? `translateX(${shift}px)` : '';
}

function onStoryFrame(h) {
  const p = h.p;
  // aerial reticle on the hero car
  const ro = ease(range(p, .31, .34)) * (1 - ease(range(p, .44, .47)));
  if (ro > .01 && place(reticle, h.carBox)) { reticle.style.opacity = ro; placeReticleTag(h.carBox); } else reticle.style.opacity = 0;
  // checkpoint marker: when the label does not fit on the right it moves under the dot, kept inside the screen
  const to = ease(range(p, .465, .49)) * (1 - ease(range(p, .53, .55)));
  if (to > .01 && h.pole) {
    target.style.opacity = to; target.style.transform = `translate3d(${h.pole.x}px, ${h.pole.y}px, 0)`;
    const sw = targetTag.offsetWidth, m = 12;
    const flip = h.pole.x + 18 + sw > innerWidth - m;
    target.classList.toggle('flip', flip);
    targetTag.style.left = flip ? `${Math.min(Math.max(h.pole.x - sw / 2, m), innerWidth - m - sw) - h.pole.x}px` : '';
  } else target.style.opacity = 0;
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
    story = await createStory({ canvas, quality: new URLSearchParams(location.search).get('q') || ((isMobile() || (navigator.hardwareConcurrency || 8) <= 4) ? 'low' : 'high') });
    story.onFrame(onStoryFrame);
    window.__story = story;
    drawPlateCrop(story.plateCanvas);
    const { p } = storyProgress(); story.jump(p);
    story.renderOnce();
    addEventListener('resize', () => story.resize());
    // the first rendered frame matches the photo underneath: cross-fade into the live scene
    requestAnimationFrame(() => storyEl.classList.add('is-live'));
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
  $$('section:not(.story) .eyebrow, .solutions__intro, .parking__intro > p, .pipeline__head p, .software__copy > p, .company__main > p, .contact__copy > p, .manifesto__pills, .kpis, .audience, .tributi, .contact__list, .form')
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
      trigger: track, pin: '#hscroll', start: 'center 54%', end: () => `+=${dist()}`, scrub: .8, animation: tween, invalidateOnRefresh: true,
      onUpdate: () => cards.forEach(c => {
        const r = c.getBoundingClientRect();
        const k = ((r.left + r.width / 2) / innerWidth - .5);
        c.style.setProperty('--px', `${gsap.utils.clamp(-16, -0.5, -8.33 - k * 10)}%`);
      }),
    });
    gsap.from(cards, { y: 80, opacity: 0, duration: 1.2, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: track, start: 'top 85%' } });
    return () => { st.kill(); tween.kill(); gsap.set(track, { x: 0 }); };
  });
  mm.add('(max-width: 720px)', () => {
    const hs = $('#hscroll');
    hs.style.overflowX = 'auto'; hs.style.scrollSnapType = 'x mandatory';
    cards.forEach(c => { c.style.scrollSnapAlign = 'start'; });
    // dots under the swipe gallery: which card is in view
    const dots = $('#hdots');
    dots.innerHTML = cards.map(() => '<i></i>').join('');
    const dotEls = [...dots.children];
    const onScroll = () => {
      const max = hs.scrollWidth - hs.clientWidth;
      const i = max > 0 ? Math.round(hs.scrollLeft / max * (cards.length - 1)) : 0;
      dotEls.forEach((d, k) => d.classList.toggle('on', k === i));
    };
    hs.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { hs.style.overflowX = ''; hs.style.scrollSnapType = ''; cards.forEach(c => { c.style.scrollSnapAlign = ''; }); hs.removeEventListener('scroll', onScroll); dots.innerHTML = ''; };
  });

  // parking: living street simulation, pinned through the five phases
  initParking({ gsap, ScrollTrigger, isMobile, reduced });
  // pipeline: one event followed from detection to reporting
  initPipeline({ gsap, ScrollTrigger });

  // software dashboard
  gsap.from('#dash', { y: 90, rotateX: 10, opacity: 0, transformPerspective: 1400, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: '#dash', start: 'top 85%' } });
  liveDashboard();

  // method progress
  gsap.fromTo('#method-fill', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#method', start: 'top 75%', end: 'bottom 60%', scrub: .6 } });
  gsap.from('.method__step', { y: 40, opacity: 0, duration: 1, stagger: .1, ease: 'power3.out', scrollTrigger: { trigger: '#method', start: 'top 80%' } });
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
    li.innerHTML = `<span>${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}</span><span>${plate()}</span><span>${rnd(gates)}</span><span class="st">Registrato</span>`;
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
const wait = ms => new Promise(r => setTimeout(r, ms));
(async function boot() {
  fitFallback();
  addEventListener('resize', fitFallback);
  const storyReady = initStory();
  // open as soon as the hero photo is decoded (a cached 3D scene gets a short grace period to open directly)
  await Promise.race([fallbackImg.decode().catch(() => {}), wait(1200)]);
  await Promise.race([Promise.all([storyReady, document.fonts ? document.fonts.ready : null]), wait(350)]);
  tick();
  sectionMotion();
  contactForm();
  gsap.ticker.add(tick);
  await opening();
  heroIntroDone = true;
  ScrollTrigger.refresh();
  window.__go = p => { const y = storyEl.offsetTop + p * storySpan(); lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y); };
  // debug hook: ?p=0.5 jumps into the sequence
  const q = new URLSearchParams(location.search).get('p');
  if (q !== null) { const y = storyEl.offsetTop + parseFloat(q) * storySpan(); lenis ? lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y); }
})();
