// Orders: what this person bought through the store. Signed-in customers see their account's orders;
// guests see the orders placed on this phone (each re-checked with the server for its real status).

import { api, storeDomain } from './api.js';
import { h, icon, money, fmtDate, statusInfo } from './util.js';
import { getSession, localOrders, rememberOrder } from './state.js';
import { openSheet, segmented, toast, setLoading } from './ui.js';
import { runPayment } from './pay.js';
import { go, switchTab } from './nav.js';

const orderRef = (order) => `ORD-${order.id}`;

/** Asks the server for the real state of an order by its payment reference. */
export async function verifyOrderRef(ref) {
  const res = await api(`/orders/guest/verify/${encodeURIComponent(ref)}`, { session: null });
  if (!res.ok || !res.data?.order) return { status: 'pending', order: null };
  const order = res.data.order;
  if (['delivered', 'processing', 'paid'].includes(order.status)) return { status: 'success', order };
  if (['failed', 'refunded'].includes(order.status)) return { status: 'failed', order };
  return { status: 'pending', order };
}

/** A fresh payment link for an order that is still unpaid. Resolves to null if it turns out to be paid already. */
export async function resumeOrderPayment(ref, gateway) {
  const res = await api(`/orders/payment/${encodeURIComponent(ref)}/resume`, { method: 'POST', body: gateway ? { payment_method: gateway } : {}, session: null });
  if (!res.ok) throw new Error(res.error);
  return res.data.authorization_url || null;
}

/** Opens the in-app payment for an order, wired to verify / resume / the "email me the link" call. */
export async function payForOrder({ url, ref, summary }) {
  const result = await runPayment({
    url,
    summary,
    successTitle: 'Payment received',
    successText: 'Thank you! Your data bundle is on its way and will arrive shortly.',
    verify: () => verifyOrderRef(ref),
    resume: () => resumeOrderPayment(ref),
    onCancelled: async () => {
      const res = await api(`/orders/payment/${encodeURIComponent(ref)}/cancelled`, { method: 'POST', session: null });
      return res.ok && res.data?.email ? `We've emailed a link to ${res.data.email} so you can complete this payment later.` : null;
    },
  });
  return result;
}

function orderCard(order, onOpen) {
  const info = statusInfo(order.status);
  return h('button', { class: 'order rise', onclick: () => onOpen(order) },
    h('div', { class: 'dot' }, String(order.network || '?').slice(0, 2).toUpperCase()),
    h('div', { class: 'meta' },
      h('b', {}, `${order.network || ''} ${order.bundle_size || ''}`.trim()),
      h('small', {}, `${order.recipient_number} · ${fmtDate(order.created_at)}`)),
    h('div', { style: { textAlign: 'right' } },
      h('b', { style: { display: 'block' } }, money(order.amount)),
      h('span', { class: `pill ${info.cls}` }, info.label)));
}

function openDetail(order, afterChange) {
  const info = statusInfo(order.status);
  const ref = orderRef(order);
  const pay = h('button', { class: 'btn primary block lg' }, 'Complete payment');
  const sheet = openSheet({
    title: 'Order details',
    content: h('div', {},
      h('div', { class: 'row spread', style: { marginBottom: '8px' } }, h('b', { style: { fontSize: '20px' } }, money(order.amount)), h('span', { class: `pill ${info.cls}` }, info.label)),
      h('div', { class: 'kv' }, h('span', {}, 'Network'), h('b', {}, order.network || '')),
      h('div', { class: 'kv' }, h('span', {}, 'Bundle'), h('b', {}, order.bundle_size || '')),
      h('div', { class: 'kv' }, h('span', {}, 'Recipient'), h('b', {}, order.recipient_number)),
      h('div', { class: 'kv' }, h('span', {}, 'Ordered'), h('b', {}, fmtDate(order.created_at))),
      order.delivered_at ? h('div', { class: 'kv' }, h('span', {}, 'Delivered'), h('b', {}, fmtDate(order.delivered_at))) : null,
      h('div', { class: 'kv' }, h('span', {}, 'Reference'), h('b', { style: { fontSize: '12px', wordBreak: 'break-all' } }, ref)),
      order.status === 'pending_payment' ? h('div', { class: 'mt2' }, pay) : null),
  });
  pay.addEventListener('click', async () => {
    setLoading(pay, true, 'Please wait');
    try {
      const url = await resumeOrderPayment(ref);
      setLoading(pay, false);
      if (!url) { toast('This order is already paid.', 'ok'); sheet.close(); afterChange(); return; }
      sheet.close();
      const result = await payForOrder({ url, ref, summary: [['Amount', money(order.amount)], ['Recipient', order.recipient_number]] });
      if (result.status === 'success') toast('Payment confirmed', 'ok');
      afterChange();
    } catch (err) {
      setLoading(pay, false);
      toast(err.message, 'bad');
    }
  });
}

export function ordersScreen() {
  const list = h('div', { class: 'stack pad' });
  let filter = 'all';
  let orders = [];
  let loading = true;

  const refreshButton = h('button', { class: 'icon-btn', 'aria-label': 'Refresh', onclick: () => load(true) }, icon('refresh'));
  const filters = segmented([
    { value: 'all', label: 'All' },
    { value: 'done', label: 'Delivered' },
    { value: 'wait', label: 'In progress' },
    { value: 'bad', label: 'Failed' },
  ], 'all', (value) => { filter = value; draw(); });

  const root = h('div', {},
    h('div', { class: 'appbar' }, h('h1', {}, 'My orders'), refreshButton),
    h('div', { class: 'pad', style: { marginBottom: '14px' } }, filters),
    list);

  function bucket(order) {
    if (order.status === 'delivered') return 'done';
    if (['failed', 'refunded'].includes(order.status)) return 'bad';
    return 'wait';
  }

  function draw() {
    list.replaceChildren();
    if (loading) {
      for (let i = 0; i < 4; i++) list.append(h('div', { class: 'skeleton', style: { height: '76px' } }));
      return;
    }
    const shown = orders.filter((o) => filter === 'all' || bucket(o) === filter);
    if (!shown.length) {
      list.append(h('div', { class: 'empty' },
        h('div', { class: 'art' }, icon('orders', 42)),
        h('h3', {}, orders.length ? 'Nothing here' : 'No orders yet'),
        h('p', {}, orders.length ? 'No orders match this filter.' : 'Your data purchases will show up here.'),
        orders.length ? null : h('button', { class: 'btn primary', onclick: () => switchTab('home') }, 'Buy data')));
      return;
    }
    shown.forEach((order, i) => { const card = orderCard(order, (o) => openDetail(o, () => load(true))); card.style.setProperty('--i', String(Math.min(i, 8))); list.append(card); });
  }

  async function load(showSkeleton) {
    if (showSkeleton) { loading = true; draw(); }
    const session = getSession('store');
    if (session) {
      const res = await api(`/orders?per_page=100&storefront_domain=${encodeURIComponent(storeDomain())}`);
      orders = res.ok ? (res.data?.data || []) : [];
      if (!res.ok) toast(res.error, 'bad');
    } else {
      // Guests: the orders placed on this phone, each refreshed from the server.
      const mine = localOrders();
      const refreshed = await Promise.all(mine.slice(0, 15).map(async (o) => {
        if (['delivered', 'failed', 'refunded'].includes(o.status)) return o;
        const { order } = await verifyOrderRef(o.ref);
        if (order) { const merged = { ...o, status: order.status, delivered_at: order.delivered_at }; rememberOrder(merged); return merged; }
        return o;
      }));
      orders = [...refreshed, ...mine.slice(15)].map((o) => ({ id: o.id, network: o.network, bundle_size: o.bundle_size, recipient_number: o.recipient_number, amount: o.amount, status: o.status, created_at: o.created_at, delivered_at: o.delivered_at }));
    }
    loading = false;
    draw();
  }

  if (!getSession('store')) {
    root.insertBefore(h('div', { class: 'pad', style: { marginBottom: '12px' } },
      h('div', { class: 'note info' }, icon('info', 20), h('span', {}, 'You are not signed in, so only orders placed on this phone are shown. '), h('button', { class: 'btn text sm', style: { height: 'auto', padding: 0 }, onclick: () => go('login') }, 'Sign in'))), list);
  }

  draw();
  load(false);
  return root;
}
