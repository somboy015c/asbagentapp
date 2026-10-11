// Buying: tapping a plan on Home opens ONE sheet - recipient number, (guest details), payment, Pay.
// Then the in-app payment screen takes over (see pay.js).

import { api, storeDomain, publicSettings, gatewaysFor } from './api.js';
import { h, icon, money, cleanNumber, validNumber, networkColor } from './util.js';
import { getSession, ls, rememberOrder } from './state.js';
import { openSheet, segmented, field, setLoading, toast } from './ui.js';
import { go, switchTab } from './nav.js';
import { payForOrder } from './orders.js';

let networksCache = null;

export async function loadNetworks() {
  if (networksCache) return networksCache;
  const res = await api('/networks', { session: null });
  if (res.ok) networksCache = res.data?.data || [];
  return res.ok ? networksCache : null;
}

/** Remembers the last recipient and (for guests) the buyer's details, so the next purchase is two taps. */
const lastBuyer = () => ls.get('buyer', {});

export async function openPurchase({ bundle, network }) {
  const session = getSession('store');
  const user = session?.user;
  const settings = await publicSettings();
  const gateways = await gatewaysFor(bundle.price);
  let gateway = gateways[0]?.key || null;
  const saved = lastBuyer();
  const color = networkColor(network.name);

  const number = field({ label: 'Recipient number', type: 'tel', inputmode: 'numeric', maxlength: 14, value: saved.number || '', hint: 'The number that will receive the data' });
  const firstName = field({ label: 'First name', autocomplete: 'given-name', value: saved.first || '' });
  const lastName = field({ label: 'Last name', autocomplete: 'family-name', value: saved.last || '' });
  const email = field({ label: 'Email (for your receipt)', type: 'email', autocomplete: 'email', inputmode: 'email', value: saved.email || '' });
  const payButton = h('button', { class: 'btn primary lg block' }, `Pay ${money(bundle.price)}`);

  const guestAllowed = !!settings.guest_checkout_enabled;
  const needsAccount = !user && !guestAllowed;

  const head = h('div', { class: 'buyhead' },
    h('div', { class: 'netdot', style: { background: color.bg, color: color.fg } }, String(network.name).slice(0, 2).toUpperCase()),
    h('div', { style: { flex: 1 } }, h('b', { style: { fontSize: '20px', display: 'block' } }, `${network.name} ${bundle.size_label}`), h('small', { class: 'muted' }, 'Data bundle')),
    h('b', { style: { fontSize: '20px', color: 'var(--primary)' } }, money(bundle.price)));

  const parts = [head];
  if (needsAccount) {
    parts.push(
      h('div', { class: 'note info mt' }, icon('info', 20), h('span', {}, 'Please sign in or create a free account to buy.')),
      h('div', { class: 'row mt' },
        h('button', { class: 'btn outline block', onclick: () => { sheet.close(); go('register'); } }, 'Create account'),
        h('button', { class: 'btn primary block', onclick: () => { sheet.close(); go('login'); } }, 'Sign in')));
  } else {
    const stack = [number.el];
    if (user?.phone) {
      stack.push(h('button', { class: 'btn text sm', style: { alignSelf: 'flex-start', height: '30px', padding: '0 4px' }, onclick: () => { number.value = user.phone; number.hint('The number that will receive the data'); } }, 'Use my number'));
    }
    if (!user) stack.push(h('div', { class: 'grid2' }, firstName.el, lastName.el), email.el);
    if (gateways.length > 1) stack.push(h('div', {}, h('div', { class: 'eyebrow' }, 'Pay with'), segmented(gateways.map((g) => ({ value: g.key, label: g.label })), gateway, (v) => { gateway = v; })));
    parts.push(
      h('div', { class: 'stack mt' }, ...stack),
      h('div', { class: 'note mt' }, icon('info', 20), h('span', {}, 'Check the number carefully. Once paid, an order cannot be undone or refunded.')),
      h('div', { class: 'mt' }, payButton));
  }

  const sheet = openSheet({ title: 'Buy data', content: h('div', {}, ...parts) });

  payButton.addEventListener('click', async () => {
    if (!validNumber(number.value)) { number.hint('Enter a valid 10 digit number, e.g. 0241234567', 'bad'); number.input.focus(); return; }
    if (!user) {
      if (!firstName.value || !lastName.value) { toast('Enter your first and last name', 'bad'); return; }
      if (!/^\S+@\S+\.\S+$/.test(email.value)) { email.hint('Enter a valid email address', 'bad'); return; }
    }
    const recipient = cleanNumber(number.value);

    setLoading(payButton, true, 'Placing order');
    const common = { data_bundle_id: bundle.id, recipient_number: recipient, storefront_domain: storeDomain(), payment_method: gateway || undefined };
    const res = user
      ? await api('/orders', { method: 'POST', body: common })
      : await api('/orders/guest', { method: 'POST', session: null, body: { ...common, first_name: firstName.value, last_name: lastName.value, email: email.value, phone: recipient } });
    setLoading(payButton, false);
    if (!res.ok) { toast(res.error, 'bad'); return; }

    ls.set('buyer', { number: recipient, first: firstName.value || saved.first, last: lastName.value || saved.last, email: email.value || saved.email });
    const order = res.data.order;
    const ref = res.data.reference || `ORD-${order.id}`;
    rememberOrder({ ref, id: order.id, network: network.name, bundle_size: bundle.size_label, recipient_number: recipient, amount: Number(order.amount), status: order.status, created_at: order.created_at });
    sheet.close();

    const result = await payForOrder({ url: res.data.authorization_url, ref, summary: [['Bundle', `${network.name} ${bundle.size_label}`], ['Recipient', recipient], ['Amount', money(order.amount)]] });
    if (result.status === 'success') toast('Order placed. Your data is on its way!', 'ok');
    switchTab('orders');
  });
}
