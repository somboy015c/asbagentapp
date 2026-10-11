// Home: every word, colour and picture on this screen comes from the agent's Store Settings
// (hero, about, how it works, services, FAQ, call-to-action, contact details, social links).

import { api } from './api.js';
import { h, icon, cycleIcon, vibrate } from './util.js';
import { getSession, store } from './state.js';
import { logoTile, storeImage } from './ui.js';
import { go, switchTab } from './nav.js';
import { openExternal, openInApp } from './native.js';

const section = (eyebrow, title, lead) => h('div', {},
  eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null,
  title ? h('h2', { class: 'h2' }, title) : null,
  lead ? h('p', { class: 'lead' }, lead) : null);

export function homeScreen() {
  const s = store();
  const c = s.content || {};
  const hero = c.hero || {};
  const signedIn = !!getSession('store');
  const root = h('div', {});

  // ---------------- Hero ----------------
  const heroImg = storeImage('hero', { alt: '' });
  root.append(h('header', { class: 'hero' },
    h('div', { class: 'blob a' }), h('div', { class: 'blob b' }),
    h('div', { class: 'brandrow rise' },
      logoTile(),
      h('div', {}, h('strong', {}, s.business_name || ''), h('span', {}, s.store_tagline || ''))),
    hero.eyebrow ? h('div', { class: 'badge rise', style: { '--i': '1' } }, icon('bolt', 15), hero.eyebrow) : null,
    h('h2', { class: 'rise', style: { '--i': '2' } }, hero.h1 || s.business_name),
    hero.p ? h('p', { class: 't rise', style: { '--i': '3' } }, hero.p) : null,
    h('div', { class: 'cta rise', style: { '--i': '4' } },
      h('button', { class: 'btn white lg', onclick: () => switchTab('buy') }, icon('bolt', 20), 'Buy data now'),
      signedIn
        ? h('button', { class: 'btn ghost lg', onclick: () => switchTab('orders') }, 'My orders')
        : h('button', { class: 'btn ghost lg', onclick: () => go('login') }, hero.secondaryCtaText || 'Sign in')),
    heroImg ? h('div', { class: 'hero-img rise', style: { '--i': '5' } }, heroImg) : null,
    (hero.trustPoints || []).length
      ? h('div', { class: 'trust rise', style: { '--i': '6' } }, hero.trustPoints.map((t) => h('span', {}, icon('check', 14), t)))
      : null,
    hero.floatingCardValue
      ? h('div', { class: 'trust rise', style: { '--i': '7', marginTop: '12px' } }, h('span', {}, icon('card', 14), `${hero.floatingCardLabel || 'Payment'}: ${hero.floatingCardValue}`), hero.floatingBadgeText ? h('span', {}, icon('shield', 14), hero.floatingBadgeText) : null)
      : null));

  // ---------------- Networks quick pick ----------------
  const netBox = h('div', { class: 'hscroll' });
  root.append(h('div', { class: 'section' }, section(null, 'Buy for any network'), h('div', { class: 'mt' }, netBox)));
  api('/networks', { session: null }).then((res) => {
    const list = res.ok ? (res.data?.data || []) : [];
    if (!list.length) { netBox.closest('.section')?.remove(); return; }
    list.forEach((n, i) => netBox.append(h('button', { class: 'netcard pop', style: { '--i': String(i) }, onclick: () => { vibrate(); switchTab('buy', { networkId: n.id }); } },
      h('div', { class: 'dot' }, String(n.name).slice(0, 2).toUpperCase()), h('b', {}, n.name), h('small', {}, n.tag || 'Tap to see bundles'))));
  });

  // ---------------- About ----------------
  if (c.about) {
    root.append(h('div', { class: 'section' },
      section(c.about.eyebrow, c.about.h2, c.about.p),
      h('div', { class: 'mt' }, (c.about.features || []).map((f, i) => h('div', { class: 'feature rise', style: { '--i': String(i) } },
        h('div', { class: 'ico' }, cycleIcon(i)), h('div', {}, h('h4', {}, f.title), h('p', {}, f.text)))))));
  }

  // ---------------- How it works ----------------
  if (c.howItWorks?.steps?.length) {
    root.append(h('div', { class: 'section' },
      section(c.howItWorks.eyebrow, c.howItWorks.h2),
      h('div', { class: 'mt2' }, c.howItWorks.steps.map((step, i) => h('div', { class: 'step rise', style: { '--i': String(i) } },
        h('div', { class: 'n' }, String(i + 1)), h('div', {}, h('h4', {}, step.title), h('p', {}, step.text)))))));
  }

  // ---------------- Services ----------------
  if (c.services?.items?.length) {
    root.append(h('div', { class: 'section' },
      section(c.services.eyebrow, c.services.h2, c.services.p),
      h('div', { class: 'grid2 mt' }, c.services.items.map((item, i) => h('div', { class: 'card pop', style: { '--i': String(i), padding: '16px' } },
        h('div', { class: 'ico', style: { width: '40px', height: '40px', borderRadius: '13px', background: 'var(--tint)', color: 'var(--primary)', display: 'grid', placeItems: 'center', marginBottom: '10px' } }, cycleIcon(i + 2, 20)),
        h('h4', { style: { fontSize: '15px' } }, item.title),
        h('p', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' } }, item.text))))));
  }

  // ---------------- FAQ ----------------
  if (c.faq?.items?.length) {
    root.append(h('div', { class: 'section' },
      section(c.faq.eyebrow, c.faq.h2),
      h('div', { class: 'mt' }, c.faq.items.map((item) => {
        const box = h('div', { class: 'faq' },
          h('button', { class: 'q', onclick: () => box.classList.toggle('open') }, h('span', {}, item.q), h('span', { class: 'chev' }, icon('down', 20))),
          h('div', { class: 'a' }, h('div', {}, h('p', {}, item.a))));
        return box;
      }))));
  }

  // ---------------- Call to action ----------------
  if (c.cta) {
    root.append(h('div', { class: 'cta-card' },
      h('div', { class: 'blob' }),
      h('h3', {}, c.cta.h2),
      c.cta.p ? h('p', {}, c.cta.p) : null,
      h('button', { class: 'btn white', onclick: () => (signedIn ? switchTab('buy') : go('register')) }, signedIn ? 'Buy data now' : (c.cta.buttonText || 'Get started'))));
  }

  // ---------------- Contact ----------------
  const rows = [];
  if (s.support_phone) rows.push(contactRow('phone', 'Call us', s.support_phone, () => openExternal(`tel:${s.support_phone}`)));
  if (s.whatsapp_number) rows.push(contactRow('chat', 'WhatsApp', s.whatsapp_number, () => openExternal(`https://wa.me/${String(s.whatsapp_number).replace(/[^\d]/g, '')}`)));
  if (s.support_email) rows.push(contactRow('mail', 'Email', s.support_email, () => openExternal(`mailto:${s.support_email}`)));
  Object.entries(s.socials || {}).filter(([, url]) => url).forEach(([name, url]) => rows.push(contactRow('globe', name.charAt(0).toUpperCase() + name.slice(1), url.replace(/^https?:\/\/(www\.)?/, ''), () => openInApp(url))));
  if (rows.length) root.append(h('div', { class: 'section' }, section('Get in touch', 'Need help?'), h('div', { class: 'card mt', style: { padding: '4px 16px' } }, rows)));

  root.append(h('div', { class: 'foot' },
    c.footer?.description ? h('p', { style: { marginBottom: '8px' } }, c.footer.description) : null,
    h('p', {}, `\u00a9 ${new Date().getFullYear()} ${s.business_name || ''}`)));
  return root;
}

function contactRow(iconName, title, value, onClick) {
  return h('button', { class: 'contact-row ripple', onclick: onClick },
    h('div', { class: 'ico' }, icon(iconName, 20)),
    h('div', { style: { flex: 1, minWidth: 0 } }, h('b', {}, title), h('small', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, value)),
    icon('right', 18));
}
