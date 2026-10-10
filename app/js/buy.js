// Buy data: pick a network and bundle, enter the number, then pay inside the app.

import { api, storeDomain, publicSettings, gatewaysFor } from './api.js';
import { h, icon, money, cleanNumber, validNumber, vibrate } from './util.js';
import { getSession, rememberOrder } from './state.js';
import { openSheet, segmented, field, setLoading, toast } from './ui.js';
import { go, switchTab } from './nav.js';
import { payForOrder } from './orders.js';

let remembered = { networkId: null, bundleId: null, number: '' };
let networksCache = null;

async function loadNetworks() {
  if (networksCache) return networksCache;
  const res = await api('/networks', { session: null });
  if (res.ok) networksCache = res.data?.data || [];
  return res.ok ? networksCache : null;
}

export function buyScreen(params = {}) {
  if (params.networkId) remembered = { networkId: params.networkId, bundleId: null, number: remembered.number };

  const body = h('div', { class: 'pad' });
  const bundlesBox = h('div', { class: 'bundles' });
  const bar = h('div', { class: 'buybar' });
  const numberField = field({ label: 'Recipient number', type: 'tel', inputmode: 'numeric', maxlength: 14, value: remembered.number, hint: 'The number that will receive the data, e.g. 0241234567' });
  const root = h('div', {}, h('div', { class: 'appbar' }, h('h1', {}, 'Buy data')), body);

  let networks = [];
  let bundles = [];
  let selected = null;
  let network = null;

  numberField.input.addEventListener('input', () => { remembered.number = numberField.input.value; updateBar(); });

  function updateBar() {
    bar.replaceChildren();
    if (!selected) { bar.classList.remove('show'); return; }
    bar.append(
      h('div', { class: 'sum' }, h('b', {}, `${network?.name || ''} ${selected.size_label}`), h('small', {}, money(selected.price))),
      h('button', { class: 'btn primary', onclick: continueToPay }, 'Continue'));
    bar.classList.add('show');
  }

  function drawBundles() {
    bundlesBox.replaceChildren();
    if (!bundles.length) {
      bundlesBox.append(h('p', { class: 'muted center', style: { gridColumn: '1 / -1', padding: '24px 0' } }, 'No bundles available for this network right now.'));
      return;
    }
    bundles.forEach((bundle, i) => {
      const card = h('button', { class: `bundle pop${selected?.id === bundle.id ? ' sel' : ''}`, style: { '--i': String(Math.min(i, 10)) }, onclick: () => {
        selected = bundle;
        remembered.bundleId = bundle.id;
        vibrate(10);
        bundlesBox.querySelectorAll('.bundle').forEach((el) => el.classList.remove('sel'));
        card.classList.add('sel');
        updateBar();
      } }, h('div', { class: 'tick' }, icon('check', 15)), h('b', {}, bundle.size_label), h('span', {}, money(bundle.price)));
      bundlesBox.append(card);
    });
  }

  async function chooseNetwork(id) {
    network = networks.find((n) => String(n.id) === String(id)) || networks[0];
    remembered.networkId = network.id;
    selected = null;
    updateBar();
    bundlesBox.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'skeleton', style: { height: '86px' } })));
    const res = await api(`/networks/${network.id}/bundles`, { session: null });
    if (network.id !== remembered.networkId) return; // they switched network while this loaded
    bundles = res.ok ? (res.data?.data || []) : [];
    if (!res.ok) toast(res.error, 'bad');
    selected = bundles.find((b) => b.id === remembered.bundleId) || null;
    drawBundles();
    updateBar();
  }

  async function init() {
    body.replaceChildren(h('div', { class: 'skeleton', style: { height: '48px' } }), h('div', { class: 'bundles' }, ...Array.from({ length: 4 }, () => h('div', { class: 'skeleton', style: { height: '86px' } }))));
    const list = await loadNetworks();
    if (!list || !list.length) {
      body.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'art' }, icon('wifi', 42)), h('h3', {}, 'Could not load bundles'), h('p', {}, 'Check your connection and try again.'), h('button', { class: 'btn primary', onclick: init }, 'Try again')));
      return;
    }
    networks = list;
    const seg = segmented(networks.map((n) => ({ value: n.id, label: n.name })), remembered.networkId || networks[0].id, chooseNetwork);
    body.replaceChildren(
      h('div', { class: 'eyebrow rise' }, 'Step 1'),
      h('div', { class: 'rise', style: { '--i': '1' } }, seg),
      bundlesBox,
      h('div', { class: 'mt2 rise', style: { '--i': '2' } }, h('div', { class: 'eyebrow' }, 'Step 2'), numberField.el),
      h('div', { style: { height: '90px' } }));
    await chooseNetwork(remembered.networkId || networks[0].id);
  }

  function continueToPay() {
    if (!selected) return;
    if (!validNumber(numberField.input.value)) {
      numberField.hint('Enter a valid 10 digit number, e.g. 0241234567', 'bad');
      numberField.input.focus();
      toast('Enter the recipient number first', 'bad');
      return;
    }
    numberField.hint('The number that will receive the data, e.g. 0241234567');
    openCheckout({ bundle: selected, network, number: cleanNumber(numberField.input.value) });
  }

  root.append(bar);
  init();
  return root;
}

async function openCheckout({ bundle, network, number }) {
  const session = getSession('store');
  const user = session?.user;
  const settings = await publicSettings();
  const gateways = await gatewaysFor(bundle.price);
  let gateway = gateways[0]?.key || null;

  const guestAllowed = !!settings.guest_checkout_enabled;
  const firstName = field({ label: 'First name', autocomplete: 'given-name' });
  const lastName = field({ label: 'Last name', autocomplete: 'family-name' });
  const email = field({ label: 'Email address', type: 'email', autocomplete: 'email', inputmode: 'email', hint: 'Your receipt and order updates are sent here' });
  const phone = field({ label: 'Your phone number', type: 'tel', autocomplete: 'tel', inputmode: 'numeric' });
  const payButton = h('button', { class: 'btn primary lg block' }, `Pay ${money(bundle.price)}`);

  const parts = [
    h('div', { class: 'card', style: { background: 'var(--tint)', boxShadow: 'none' } },
      h('div', { class: 'kv' }, h('span', {}, 'Bundle'), h('b', {}, `${network.name} ${bundle.size_label}`)),
      h('div', { class: 'kv' }, h('span', {}, 'Recipient'), h('b', {}, number)),
      h('div', { class: 'kv' }, h('span', {}, 'Total'), h('b', {}, money(bundle.price)))),
  ];

  const needsAccount = !user && !guestAllowed;
  if (needsAccount) {
    parts.push(
      h('div', { class: 'note info mt' }, icon('info', 20), h('span', {}, 'Please sign in or create a free account to place your order.')),
      h('div', { class: 'row mt' },
        h('button', { class: 'btn outline block', onclick: () => { sheet.close(); go('register'); } }, 'Create account'),
        h('button', { class: 'btn primary block', onclick: () => { sheet.close(); go('login'); } }, 'Sign in')));
  } else {
    if (!user) parts.push(h('div', { class: 'stack mt' }, h('div', { class: 'grid2' }, firstName.el, lastName.el), email.el, phone.el));
    else parts.push(h('p', { class: 'muted mt' }, `Paying as ${user.email || user.name}`));

    if (gateways.length > 1) {
      parts.push(h('div', { class: 'mt' }, h('div', { class: 'eyebrow' }, 'Pay with'), segmented(gateways.map((g) => ({ value: g.key, label: g.label })), gateway, (v) => { gateway = v; })));
    }
    parts.push(
      h('div', { class: 'note mt' }, icon('info', 20), h('span', {}, `Make sure ${number} is correct. Once your order is placed and paid for, it cannot be undone or refunded.`)),
      h('div', { class: 'mt2' }, payButton),
      h('p', { class: 'muted center', style: { fontSize: '12.5px', marginTop: '10px' } }, 'Card or Mobile Money, paid securely inside the app.'));
  }

  const sheet = openSheet({ title: 'Confirm your order', content: h('div', {}, ...parts) });

  payButton.addEventListener('click', async () => {
    if (!user) {
      if (!firstName.value || !lastName.value) { toast('Enter your first and last name', 'bad'); return; }
      if (!/^\S+@\S+\.\S+$/.test(email.value)) { email.hint('Enter a valid email address', 'bad'); return; }
      if (!validNumber(phone.value)) { phone.hint('Enter a valid phone number', 'bad'); return; }
    }

    setLoading(payButton, true, 'Placing your order');
    const common = { data_bundle_id: bundle.id, recipient_number: number, storefront_domain: storeDomain(), payment_method: gateway || undefined };
    const res = user
      ? await api('/orders', { method: 'POST', body: common })
      : await api('/orders/guest', { method: 'POST', session: null, body: { ...common, first_name: firstName.value, last_name: lastName.value, email: email.value, phone: cleanNumber(phone.value) } });
    setLoading(payButton, false);

    if (!res.ok) { toast(res.error, 'bad'); return; }

    const order = res.data.order;
    const ref = res.data.reference || `ORD-${order.id}`;
    rememberOrder({ ref, id: order.id, network: network.name, bundle_size: bundle.size_label, recipient_number: number, amount: Number(order.amount), status: order.status, created_at: order.created_at });
    sheet.close();

    const result = await payForOrder({ url: res.data.authorization_url, ref, summary: [['Bundle', `${network.name} ${bundle.size_label}`], ['Recipient', number], ['Amount', money(order.amount)]] });
    if (result.status === 'success') toast('Order placed. Your data is on its way!', 'ok');
    switchTab('orders');
  });
}
