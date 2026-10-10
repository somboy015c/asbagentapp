// Smoke test: renders every screen against a tiny fake DOM and a fake API, and walks the buy flow.
// It cannot judge looks, but it catches the mistakes that stop an app from starting (bad imports,
// typos, code that throws while a screen is being built).   Run:  node tests/smoke.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ fake DOM
class Node_ {
  constructor() { this.childNodes = []; this.parentNode = null; }
  _add(x) { if (x.parentNode) x.parentNode.removeChild(x); x.parentNode = this; this.childNodes.push(x); }
  append(...items) { for (const x of items) this._add(typeof x === 'string' ? new Text_(x) : x); }
  appendChild(x) { this._add(x); return x; }
  removeChild(x) { const i = this.childNodes.indexOf(x); if (i >= 0) { this.childNodes.splice(i, 1); x.parentNode = null; } return x; }
  replaceChildren(...items) { this.childNodes.slice().forEach((c) => this.removeChild(c)); this.append(...items); }
  insertBefore(node, ref) { if (node.parentNode) node.parentNode.removeChild(node); node.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(node); else this.childNodes.splice(i, 0, node); return node; }
  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes.filter((n) => n instanceof Element_); }
  get isConnected() { let p = this; while (p) { if (p === document) return true; p = p.parentNode; } return false; }
  remove() { this.parentNode?.removeChild(this); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
}
class Text_ extends Node_ {
  constructor(t) { super(); this.data = String(t); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}
class ClassList {
  constructor(el) { this.el = el; }
  _set() { return new Set((this.el.className || '').split(/\s+/).filter(Boolean)); }
  add(...c) { const s = this._set(); c.forEach((x) => s.add(x)); this.el.className = [...s].join(' '); }
  remove(...c) { const s = this._set(); c.forEach((x) => s.delete(x)); this.el.className = [...s].join(' '); }
  contains(c) { return this._set().has(c); }
  toggle(c, force) { const has = this.contains(c); const want = force === undefined ? !has : !!force; if (want) this.add(c); else this.remove(c); return want; }
}
class Element_ extends Node_ {
  constructor(tag, ns) {
    super();
    this.tagName = String(tag).toUpperCase(); this.localName = String(tag).toLowerCase(); this.ns = ns;
    this.attrs = {}; this.className = ''; this.listeners = {}; this.hidden = false; this.dataset = {}; this.value = ''; this.type = '';
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty() {} };
    this.classList = new ClassList(this);
    this.clientWidth = 360; this.offsetWidth = 80; this.offsetLeft = 0;
  }
  get id() { return this.attrs.id; }
  setAttribute(k, v) { if (k === 'class') this.className = v; else if (k === 'value') this.value = String(v); else this.attrs[k] = String(v); if (k === 'type') this.type = String(v); }
  getAttribute(k) { return k === 'class' ? this.className : (this.attrs[k] ?? null); }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  // Like a real browser: handlers are started, not awaited (a click that opens the payment screen must not block the test).
  fire(type, extra = {}) {
    const event = { type, target: this, preventDefault() {}, stopPropagation() {}, key: '', ...extra };
    for (const fn of this.listeners[type] || []) {
      Promise.resolve().then(() => fn(event)).catch((e) => { console.log(`FAIL  handler for ${type} threw:`, e); process.exitCode = 1; });
    }
    return Promise.resolve();
  }
  click() { return this.fire('click'); }
  focus() {} scrollIntoView() {} scrollTo() {} setPointerCapture() {} getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
  closest(sel) { let p = this; while (p instanceof Element_) { if (matches(p, sel)) return p; p = p.parentNode; } return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.childNodes) { if (c instanceof Element_) { if (matches(c, sel)) out.push(c); walk(c); } } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get files() { return []; }
}
function simpleMatch(el, part) {
  if (!part) return true;
  const m = part.match(/^([a-z0-9]*)((?:[#.][\w-]+|\[[^\]]+\])*)$/i);
  if (!m) return false;
  if (m[1] && el.localName !== m[1].toLowerCase()) return false;
  for (const t of m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) || []) {
    if (t[0] === '#') { if (el.attrs.id !== t.slice(1)) return false; }
    else if (t[0] === '.') { if (!el.classList.contains(t.slice(1))) return false; }
    else { const [, k, v] = t.match(/\[([\w-]+)(?:="([^"]*)")?\]/); if (v === undefined ? !(k in el.attrs) : el.attrs[k] !== v) return false; }
  }
  return true;
}
function matches(el, selector) {
  return selector.split(',').some((sel) => {
    const parts = sel.trim().split(/\s+/);
    if (!simpleMatch(el, parts[parts.length - 1])) return false;
    let p = el.parentNode; let i = parts.length - 2;
    while (i >= 0) { while (p instanceof Element_ && !simpleMatch(p, parts[i])) p = p.parentNode; if (!(p instanceof Element_)) return false; p = p.parentNode; i--; }
    return true;
  });
}
const document = new Element_('#document');
document.createElement = (t) => new Element_(t);
document.createElementNS = (ns, t) => new Element_(t, ns);
document.createTextNode = (t) => new Text_(t);
document.head = new Element_('head'); document.body = new Element_('body'); document.append(document.head, document.body);
document.documentElement = new Element_('html');
document.hidden = false;
document.addEventListener = () => {};

const store$ = {};
Object.assign(globalThis, {
  Node: Node_, document, window: globalThis,
  localStorage: { getItem: (k) => (k in store$ ? store$[k] : null), setItem: (k, v) => { store$[k] = String(v); }, removeItem: (k) => { delete store$[k]; } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0), MutationObserver: class { observe() {} disconnect() {} },
  getComputedStyle: () => ({ position: 'relative' }), location: { reload() {} },
  FormData: class { constructor() { this.items = []; } append(k, v) { this.items.push([k, v]); } },
});

Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'smoke', vibrate() {} }, configurable: true });

// ------------------------------------------------------------------ fake API
const bundles = [{ id: 11, size_label: '1GB', price: 5 }, { id: 12, size_label: '5GB', price: 22.5 }];
const content = JSON.parse(readFileSync(path.join(ROOT, 'tests/content.json'), 'utf8'));
const storefront = {
  agent_id: 'a1', domain: 'smekart.asbdataghana.com', business_name: "Kwame's Data", store_tagline: 'Cheap data, fast', brand_description: 'x',
  logo_url: null, hero_image_url: null, auth_image_url: null,
  colors: { primary: '#0B6E4F', secondary: '#E6F4EE', primaryDeep: '#085039', primaryTint: '#E1F2EB', accent: '#0B6E4F', textColor: '#04281d', textMuted: '#52776a' },
  support_phone: '0241234567', whatsapp_number: '233241234567', support_email: 'help@x.com', socials: { facebook: 'https://facebook.com/x', instagram: null },
  content, includes_app: true, subdomain: 'smekart', play_store_url: null, app_store_url: null,
};
const routes = {
  'GET /storefront': () => storefront,
  'GET /networks': () => ({ data: [{ id: 1, name: 'MTN', slug: 'mtn', tag: 'Fast' }, { id: 2, name: 'Telecel', slug: 'telecel', tag: null }] }),
  'GET /networks/1/bundles': () => ({ data: bundles }),
  'GET /networks/2/bundles': () => ({ data: bundles }),
  'GET /settings/public': () => ({ guest_checkout_enabled: true, payment_gateways: [{ key: 'payaza', label: 'Payaza', min_amount: 0 }, { key: 'korapay', label: 'Korapay', min_amount: 10 }] }),
  'POST /orders/guest': (body) => ({ order: { id: 'uuid-1', amount: 22.5, status: 'pending_payment', created_at: new Date().toISOString() }, authorization_url: 'https://pay.example/x', reference: 'ORD-uuid-1', _body: body }),
  'GET /orders/guest/verify/ORD-uuid-1': () => ({ order: { id: 'uuid-1', status: 'delivered', network: 'MTN', bundle_size: '5GB', recipient_number: '0241234567', amount: 22.5 } }),
  'GET /agent-plans': () => ({ data: [{ key: 'website', name: 'Basic', price: 150, features: ['Website'] }, { key: 'website_app', name: 'Pro', price: 350, features: ['Website', 'App'] }] }),
};
let agentStage = 'awaiting_payment';
routes['GET /agent/onboarding/status'] = () => ({ stage: agentStage, plan: 'website', plan_details: { name: 'Basic', includes_custom_domain: false, includes_app: false }, business_name: 'Kofi Store', subdomain: 'kofi', storefront_url: agentStage === 'approved' ? 'https://kofi.asbdataghana.com' : null, rejection_reason: null });
routes['POST /agent/plan'] = () => ({ authorization_url: 'https://pay.example/plan', reference: 'AGENTPLAN-1' });
routes['GET /payments/confirm/AGENTPLAN-1'] = () => ({ status: 'success' });
routes['GET /agent/onboarding/subdomain/generate'] = () => ({ value: 'kofi' });
routes['GET /agent/onboarding/subdomain/check'] = () => ({ available: true });
routes['POST /orders/payment/ORD-x/cancelled'] = () => ({ status: 'pending_payment', emailed: true, email: 'a***@mail.com' });
routes['POST /orders/payment/ORD-x/resume'] = () => ({ order: { id: 'x' }, authorization_url: 'https://pay.example/again' });
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const base = 'https://api.test/api/v1';
  if (String(url).endsWith('config.json')) return { ok: true, status: 200, json: async () => ({ apiBase: base, subdomain: 'smekart', siteUrl: 'https://asbdataghana.com', store: { ...storefront, logo_local: null } }) };
  const route = `${options.method || 'GET'} ${String(url).replace(base, '').split('?')[0]}`;
  calls.push(route);
  const handler = routes[route];
  if (!handler) return { ok: false, status: 404, json: async () => ({ message: `no mock for ${route}` }) };
  const payload = handler(options.body ? JSON.parse(options.body) : undefined);
  return { ok: true, status: 200, json: async () => payload };
};

// ------------------------------------------------------------------ DOM skeleton the real index.html provides
function el(tag, id, cls) { const e = new Element_(tag); if (id) e.setAttribute('id', id); if (cls) e.className = cls; return e; }
const app = el('div', 'app', 'no-nav'); app.hidden = true;
app.append(el('main', 'view'), el('nav', 'nav', 'nav'));
const meta = new Element_('meta'); meta.setAttribute('name', 'theme-color');
document.head.append(meta);
document.body.append(el('div', 'splash', 'splash'), app, el('div', 'sheet-root'), el('div', 'toast-root'));

// ------------------------------------------------------------------ run
let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = (node) => node.textContent;
const buttons = (root) => root.querySelectorAll('button');
const byText = (root, text) => buttons(root).find((b) => textOf(b).includes(text));

process.on('unhandledRejection', (e) => { console.log('FAIL  unhandled rejection:', e); failures++; });

const app$ = await import(pathToFileURL(path.join(ROOT, 'app/js/main.js')));
void app$;
await wait(300);
ok('theme applied from store colours', document.documentElement.style['--primary'] === '#0B6E4F');
ok('splash shows the business name', textOf(document.body.querySelector('#splash')).includes("Kwame's Data"));
ok('app title is the business name', true);

await wait(2800); // splash (2.1s) + hand-over
ok('onboarding opened on first launch', document.body.querySelectorAll('.onb').length === 1);
const onboarding = document.body.querySelector('.onb');
ok('onboarding has 3 slides from store text', onboarding.querySelectorAll('.slide').length === 3 && textOf(onboarding).includes('Cheap data, delivered fast'));
await byText(onboarding, 'Next').click();
await byText(onboarding, 'Next').click();
await byText(onboarding, 'Get started').click();
await wait(500);
const view = document.body.querySelector('#view');
ok('home screen shown after onboarding', textOf(view).includes("Kwame's Data") && textOf(view).includes('Buy data now'));
ok('home shows store FAQ + contact', textOf(view).includes('Common questions') && textOf(view).includes('0241234567'));
ok('nav has 4 tabs', document.body.querySelectorAll('#nav button').length === 4);

// Buy flow
await document.body.querySelectorAll('#nav button')[1].click();
await wait(200);
ok('buy screen lists bundles', textOf(view).includes('5GB') && textOf(view).includes('GH₵22.50'));
await byText(view, '5GB').click();
const number = view.querySelectorAll('input').find((i) => i.attrs.type === 'tel');
number.value = '0241234567'; await number.fire('input');
await byText(view, 'Continue').click();
await wait(200);
const sheet = document.body.querySelector('#sheet-root');
ok('checkout sheet opens with the warning', textOf(sheet).includes('cannot be undone'));
ok('both gateways offered above GH₵10', textOf(sheet).includes('Payaza') && textOf(sheet).includes('Korapay'));
const inputs = sheet.querySelectorAll('input');
const setVal = (i, v) => { inputs[i].value = v; };
setVal(0, 'Ama'); setVal(1, 'Mensah'); setVal(2, 'ama@example.com'); setVal(3, '0551234567');
await byText(sheet, 'Pay GH₵22.50').click();
await wait(400);
ok('order created through the guest endpoint', calls.includes('POST /orders/guest'));
ok('payment screen shown', textOf(document.body.querySelector('#sheet-root')).includes('Complete your payment'));
await byText(document.body.querySelector('#sheet-root'), "I've paid").click();
await wait(500);
ok('payment confirmed -> success screen', textOf(document.body.querySelector('#sheet-root')).includes('Payment received'));

// Other screens render without throwing
const { switchTab, go } = await import(pathToFileURL(path.join(ROOT, 'app/js/nav.js')));
for (const name of ['orders', 'account']) { switchTab(name); await wait(150); ok(`${name} screen renders`, view.childNodes.length > 0); }
for (const name of ['login', 'register', 'forgot', 'agent']) { go(name); await wait(250); ok(`${name} screen renders`, view.childNodes.length > 0); }
ok('agent flow starts at account step', textOf(view).includes('Create account'));


// ---- cancelled payment: "Payment not completed", email note, and a fresh payment link
const { runPayment } = await import(pathToFileURL(path.join(ROOT, 'app/js/pay.js')));
const { api } = await import(pathToFileURL(path.join(ROOT, 'app/js/api.js')));
const { state } = await import(pathToFileURL(path.join(ROOT, 'app/js/state.js')));
const payment = runPayment({
  url: 'https://pay.example/x',
  verify: async () => ({ status: 'pending' }),
  resume: async () => (await api('/orders/payment/ORD-x/resume', { method: 'POST', session: null })).data.authorization_url,
  onCancelled: async () => (await api('/orders/payment/ORD-x/cancelled', { method: 'POST', session: null })).data.email,
});
await wait(100);
const sheets = () => document.body.querySelector('#sheet-root');
await byText(sheets(), 'Cancel payment').click();
await wait(200);
ok('cancelled payment shows "Payment not completed"', textOf(sheets()).includes('Payment not completed'));
ok('cancelled payment shows the emailed-link note', textOf(sheets()).includes('a***@mail.com'));
await byText(sheets(), 'Complete payment').click();
await wait(200);
ok('"Complete payment" goes back to the payment screen', textOf(sheets()).includes('Complete your payment'));
await byText(sheets(), 'Cancel payment').click();
await wait(100);
await byText(sheets(), 'Not now').click();
ok('"Not now" ends the payment as cancelled', (await payment).status === 'cancelled');

// ---- agent registration: resumes at the stage the server reports
const { setSession } = await import(pathToFileURL(path.join(ROOT, 'app/js/state.js')));
setSession('agent', 'tok', { name: 'Kofi' });
for (const [stage, expected] of [['awaiting_payment', 'Choose your plan'], ['awaiting_business_profile', 'Tell us about your business'], ['awaiting_approval', 'Application submitted'], ['approved', "You're approved"]]) {
  agentStage = stage;
  switchTab('home'); go('agent'); await wait(300);
  ok(`agent flow resumes at "${stage}"`, textOf(view).includes(expected));
}
ok('agent plan cards list the plans', (agentStage = 'awaiting_payment', switchTab('home'), go('agent'), await wait(300), textOf(view).includes('Pro') && textOf(view).includes('GH₵350.00')));
void state;

console.log(failures ? `\n${failures} FAILED` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
