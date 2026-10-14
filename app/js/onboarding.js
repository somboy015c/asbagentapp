// The three welcome slides shown the first time the app opens. The words come from the agent's
// Store Settings (hero / services / call-to-action text); the pictures are placeholders you replace
// by replacing slide-1.jpg, slide-2.jpg and slide-3.jpg in app/assets/onboarding/ (landscape pictures are
// shown in full, never cropped, so any lettering inside them stays readable).

import { h, icon } from './util.js';
import { ls, store } from './state.js';

const EXTENSIONS = ['jpg', 'png', 'jpeg', 'webp', 'svg']; // tried in this order; .svg is only a fallback

function slideImage(n) {
  let attempt = 0;
  const img = h('img', { src: `assets/onboarding/slide-${n}.${EXTENSIONS[0]}`, alt: '', draggable: 'false' });
  img.addEventListener('error', () => {
    attempt += 1;
    if (attempt < EXTENSIONS.length) img.src = `assets/onboarding/slide-${n}.${EXTENSIONS[attempt]}`;
  });
  return img;
}

export function slidesFromStore() {
  const s = store();
  const c = s.content || {};
  return [
    { title: c.hero?.h1 || `Welcome to ${s.business_name}`, text: c.hero?.p || s.store_tagline || s.brand_description || '' },
    { title: c.services?.h2 || 'Why buy your data here', text: c.services?.p || (c.services?.items?.[0]?.text) || '' },
    { title: c.cta?.h2 || 'Ready to get started?', text: c.cta?.p || '' },
  ];
}

export function showOnboarding(onDone) {
  const slides = slidesFromStore();
  let index = 0;
  let startX = null;
  let dragged = 0;

  const track = h('div', { class: 'track' }, slides.map((slide, i) => h('section', { class: `slide${i === 0 ? ' on' : ''}` },
    h('div', { class: 'pic' }, slideImage(i + 1)),
    h('h2', {}, slide.title),
    h('p', {}, slide.text))));
  const dots = h('div', { class: 'dots' }, slides.map((_, i) => h('i', { class: i === 0 ? 'on' : '' })));
  const next = h('button', { class: 'btn primary lg', style: { minWidth: '150px' }, onclick: () => (index === slides.length - 1 ? finish() : go(index + 1)) }, 'Next');
  const skip = h('button', { class: 'btn text skip', onclick: finish }, 'Skip');
  const root = h('div', { class: 'onb' }, skip, track, h('div', { class: 'bottom' }, dots, next));

  function go(i) {
    index = Math.max(0, Math.min(slides.length - 1, i));
    track.style.transform = `translateX(${-index * 100}%)`;
    [...track.children].forEach((el, n) => el.classList.toggle('on', n === index));
    [...dots.children].forEach((el, n) => el.classList.toggle('on', n === index));
    const last = index === slides.length - 1;
    next.replaceChildren(last ? 'Get started' : 'Next', last ? icon('right', 20) : '');
    skip.style.visibility = last ? 'hidden' : 'visible';
  }

  function finish() {
    ls.set('onboarded', true);
    root.style.transition = 'opacity .35s ease, transform .35s ease';
    root.style.opacity = '0';
    root.style.transform = 'scale(1.03)';
    setTimeout(() => { root.remove(); onDone(); }, 360);
  }

  // Swipe between slides.
  track.addEventListener('pointerdown', (e) => { startX = e.clientX; dragged = 0; track.style.transition = 'none'; track.setPointerCapture?.(e.pointerId); });
  track.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    dragged = e.clientX - startX;
    const base = -index * track.clientWidth;
    track.style.transform = `translateX(${base + dragged}px)`;
  });
  const release = () => {
    if (startX === null) return;
    startX = null;
    track.style.transition = '';
    if (dragged < -60) go(index + 1);
    else if (dragged > 60) go(index - 1);
    else go(index);
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  document.body.append(root);
  go(0);
  return root;
}
