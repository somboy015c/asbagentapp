// Account tab: profile + wallet for signed-in customers, sign-in prompt for everyone else.

import { api } from './api.js';
import { h, icon, money, initials } from './util.js';
import { clearSession, getSession, setSession, state, store } from './state.js';
import { confirmSheet, toast } from './ui.js';
import { go, refresh, switchTab } from './nav.js';

export function accountScreen() {
  const s = store();
  const session = getSession('store');
  const root = h('div', {}, h('div', { class: 'appbar' }, h('h1', {}, 'Account')));
  const body = h('div', { class: 'pad stack' });
  root.append(body);

  if (!session) {
    body.append(h('div', { class: 'empty rise' },
      h('div', { class: 'art' }, icon('user', 42)),
      h('h3', {}, `Welcome to ${s.business_name || 'our store'}`),
      h('p', {}, 'Sign in to see your orders on any phone, or just buy as a guest.'),
      h('div', { class: 'stack', style: { maxWidth: '280px', margin: '0 auto' } },
        h('button', { class: 'btn primary lg block', onclick: () => go('login') }, 'Sign in'),
        h('button', { class: 'btn tonal lg block', onclick: () => go('register') }, 'Create account'))));
  } else {
    const user = session.user || {};
    const balance = h('b', { style: { fontSize: '24px' } }, money(0));
    const verify = h('div', { class: 'note', hidden: user.email_verified !== false },
      icon('mail', 20), h('span', {}, 'Please verify your email address. '),
      h('button', { class: 'btn text sm', style: { height: 'auto', padding: 0 }, onclick: async () => {
        const res = await api('/auth/email/resend', { method: 'POST' });
        toast(res.ok ? 'Verification email sent' : res.error, res.ok ? 'ok' : 'bad');
      } }, 'Resend email'));

    body.append(
      h('div', { class: 'card rise row', style: { gap: '16px' } },
        h('div', { style: { width: '60px', height: '60px', borderRadius: '20px', background: 'var(--primary)', color: 'var(--on-primary)', display: 'grid', placeItems: 'center', fontWeight: '800', fontSize: '22px', flex: 'none' } }, initials(user.name)),
        h('div', { style: { minWidth: 0 } }, h('b', { style: { fontSize: '18px', display: 'block' } }, user.name || 'Customer'), h('span', { class: 'muted', style: { fontSize: '13px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' } }, user.email), h('span', { class: 'muted', style: { fontSize: '13px' } }, user.phone))),
      verify,
      h('div', { class: 'card rise row spread', style: { '--i': '1' } }, h('div', {}, h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Wallet balance'), h('div', {}, balance), h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Refunds from failed orders land here')), h('div', { style: { color: 'var(--primary)' } }, icon('wallet', 34))),
      menuRow('orders', 'My orders', () => switchTab('orders')),
      h('button', { class: 'btn outline block', onclick: async () => {
        if (!(await confirmSheet({ title: 'Sign out?', message: 'You can sign back in any time.', confirmText: 'Sign out' }))) return;
        await api('/auth/logout', { method: 'POST' });
        clearSession('store');
        toast('Signed out');
        refresh();
      } }, icon('logout', 20), 'Sign out'));

    api('/wallet').then((res) => { if (res.ok) balance.textContent = money(res.data.balance); });
    api('/me').then((res) => { if (res.ok) { const u = res.data.data || res.data; setSession('store', session.token, u); verify.hidden = u.email_verified !== false; } });
  }

  body.append(
    h('div', { class: 'section', style: { padding: '8px 0 0' } }, menuRow('store', 'Start your own data store', () => go('agent'), 'Become an agent, with your own app')),
    h('div', { class: 'foot', style: { padding: '18px 0 8px' } },
      h('p', {}, s.business_name || ''),
      h('p', { style: { marginTop: '4px' } }, `App version built ${state.cfg?.builtAt ? new Date(state.cfg.builtAt).toLocaleDateString() : ''}`)));
  return root;
}

function menuRow(iconName, title, onClick, sub) {
  return h('button', { class: 'card ripple row', style: { width: '100%', textAlign: 'left', padding: '14px 16px' }, onclick: onClick },
    h('div', { class: 'feature', style: { padding: 0 } }, h('div', { class: 'ico' }, icon(iconName, 22))),
    h('div', { style: { flex: 1 } }, h('b', {}, title), sub ? h('small', { class: 'muted', style: { display: 'block' } }, sub) : null),
    icon('right', 18));
}
