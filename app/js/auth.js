// Sign in / create account / forgot password for THIS store's customers. Accounts belong to this
// store only (the API scopes them by storefront_domain), exactly like the store's website.

import { api, storeDomain } from './api.js';
import { h, icon, cleanNumber, validNumber } from './util.js';
import { setSession, store } from './state.js';
import { field, setLoading, storeImage, toast, logoTile } from './ui.js';
import { back, canGoBack, go, switchTab } from './nav.js';

function shell({ quote, title, children }) {
  const bg = storeImage('auth', { class: 'bg', alt: '' });
  return h('div', {},
    h('div', { class: 'auth-top' },
      bg,
      h('button', { class: 'icon-btn', style: { color: '#fff', position: 'relative', zIndex: 2 }, 'aria-label': 'Back', onclick: () => (back() || switchTab('home')) }, icon('left')),
      h('div', { style: { position: 'absolute', right: '20px', top: 'calc(14px + var(--sat))', zIndex: 2 } }, logoTile()),
      h('div', { class: 'q rise' }, quote || '')),
    h('div', { class: 'auth-card rise', style: { '--i': '2' } }, h('h2', {}, title), children));
}

function done(message) {
  toast(message, 'ok');
  if (canGoBack()) back(); else switchTab('account');
}

export function loginScreen() {
  const login = field({ label: 'Email or phone number', autocomplete: 'username', inputmode: 'email' });
  const password = field({ label: 'Password', type: 'password', autocomplete: 'current-password' });
  const button = h('button', { class: 'btn primary lg block', type: 'button' }, 'Sign in');
  const problem = h('div', { class: 'note bad', hidden: true });
  const resend = h('button', { class: 'btn text sm', type: 'button', hidden: true }, 'Resend verification email');

  async function submit() {
    problem.hidden = true; resend.hidden = true;
    if (!login.value || !password.input.value) { toast('Enter your email/phone and password', 'bad'); return; }
    setLoading(button, true, 'Signing in');
    const res = await api('/auth/login', { method: 'POST', session: null, body: { login: login.value, password: password.input.value, storefront_domain: storeDomain() } });
    setLoading(button, false);
    if (!res.ok) {
      problem.replaceChildren(icon('info', 20), res.error);
      problem.hidden = false;
      resend.hidden = res.code !== 'unverified_email';
      return;
    }
    setSession('store', res.data.token, res.data.user);
    done(`Welcome back, ${String(res.data.user?.name || '').split(' ')[0] || 'friend'}!`);
  }
  button.addEventListener('click', submit);
  password.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  resend.addEventListener('click', async () => {
    const res = await api('/auth/email/resend-public', { method: 'POST', session: null, body: { login: login.value, storefront_domain: storeDomain() } });
    toast(res.ok ? 'If that account needs verifying, a new link was sent.' : res.error, res.ok ? 'ok' : 'bad');
  });

  return shell({
    quote: store().content?.auth?.loginQuote,
    title: 'Sign in',
    children: h('div', { class: 'stack' }, login.el, password.el, problem, resend, button,
      h('button', { class: 'btn text', type: 'button', onclick: () => go('forgot') }, 'Forgot password?'),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('span', { class: 'muted' }, 'New here?'), h('button', { class: 'btn text', type: 'button', onclick: () => go('register', {}, { replace: true }) }, 'Create an account'))),
  });
}

export function registerScreen() {
  const name = field({ label: 'Full name', autocomplete: 'name' });
  const email = field({ label: 'Email address', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const phone = field({ label: 'Phone number', type: 'tel', autocomplete: 'tel', inputmode: 'numeric' });
  const password = field({ label: 'Password (8+ characters)', type: 'password', autocomplete: 'new-password' });
  const confirm = field({ label: 'Confirm password', type: 'password', autocomplete: 'new-password' });
  const button = h('button', { class: 'btn primary lg block', type: 'button' }, 'Create account');
  const problem = h('div', { class: 'note bad', hidden: true });

  button.addEventListener('click', async () => {
    problem.hidden = true;
    if (!name.value) return toast('Enter your name', 'bad');
    if (!/^\S+@\S+\.\S+$/.test(email.value)) return toast('Enter a valid email address', 'bad');
    if (!validNumber(phone.value)) return toast('Enter a valid phone number', 'bad');
    if (password.input.value.length < 8) return toast('Password must be at least 8 characters', 'bad');
    if (password.input.value !== confirm.input.value) return toast('The two passwords do not match', 'bad');

    setLoading(button, true, 'Creating account');
    const res = await api('/auth/register', { method: 'POST', session: null, body: {
      name: name.value, email: email.value, phone: cleanNumber(phone.value),
      password: password.input.value, password_confirmation: confirm.input.value, storefront_domain: storeDomain(),
    } });
    setLoading(button, false);
    if (!res.ok) { problem.replaceChildren(icon('info', 20), res.error); problem.hidden = false; return; }
    setSession('store', res.data.token, res.data.user);
    done('Account created! Check your email to verify it.');
  });

  return shell({
    quote: store().content?.auth?.registerQuote,
    title: 'Create your account',
    children: h('div', { class: 'stack' }, name.el, email.el, phone.el, password.el, confirm.el, problem, button,
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('span', { class: 'muted' }, 'Already registered?'), h('button', { class: 'btn text', type: 'button', onclick: () => go('login', {}, { replace: true }) }, 'Sign in'))),
  });
}

export function forgotScreen() {
  const email = field({ label: 'Email address', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const button = h('button', { class: 'btn primary lg block', type: 'button' }, 'Send reset link');
  button.addEventListener('click', async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.value)) return toast('Enter a valid email address', 'bad');
    setLoading(button, true, 'Sending');
    const res = await api('/auth/password/forgot', { method: 'POST', session: null, body: { email: email.value, storefront_domain: storeDomain() } });
    setLoading(button, false);
    toast(res.ok ? 'If an account exists for that email, a reset link is on its way.' : res.error, res.ok ? 'ok' : 'bad');
    if (res.ok) back();
  });
  return shell({
    quote: 'No worries, it happens to everyone.',
    title: 'Reset your password',
    children: h('div', { class: 'stack' }, h('p', { class: 'muted' }, "Enter your email and we'll send you a link to choose a new password."), email.el, button),
  });
}
