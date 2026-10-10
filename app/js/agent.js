// "Become an agent", entirely inside the app:
//   1. account   - a main-site account (separate from this store's customer account)
//   2. plan      - pick a plan and pay for it with the in-app payment screen
//   3. business  - business name, store address (subdomain), logo, region, MoMo details
//   4. status    - submitted / approved (with the live store link) / rejected
// The screen asks the server which stage the application is at, so it resumes exactly where
// the person left off, even after closing the app.

import { api, gatewaysFor, storeDomain } from './api.js';
import { h, icon, money, cleanNumber, validNumber, debounce } from './util.js';
import { clearSession, getSession, setSession, state } from './state.js';
import { field, segmented, setLoading, toast, confirmSheet } from './ui.js';
import { back, switchTab } from './nav.js';
import { runPayment } from './pay.js';
import { openInApp } from './native.js';

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Western North', 'Central', 'Eastern', 'Volta', 'Oti', 'Northern', 'Savannah', 'North East', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo'];
const MOMO = ['MTN MoMo', 'Telecel Cash', 'AirtelTigo Money'];
const siteUrl = () => (state.cfg?.siteUrl || 'https://asbdataghana.com').replace(/\/+$/, '');

export function agentScreen() {
  const body = h('div', { class: 'pad stack', style: { paddingBottom: '40px' } });
  const stepper = h('div', { class: 'stepper' }, [0, 1, 2, 3].map(() => h('i')));
  const root = h('div', {},
    h('div', { class: 'appbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => (back() || switchTab('home')) }, icon('left')), h('h1', {}, 'Become an agent')),
    stepper, body);

  const setProgress = (done) => [...stepper.children].forEach((el, i) => el.classList.toggle('done', i < done));
  const loadingView = () => body.replaceChildren(h('div', { class: 'skeleton', style: { height: '120px' } }), h('div', { class: 'skeleton', style: { height: '200px' } }));

  async function render() {
    const session = getSession('agent');
    if (!session) { setProgress(0); return viewAccount(); }
    loadingView();
    const res = await api('/agent/onboarding/status', { session: 'agent' });
    if (!res.ok) {
      if (res.status === 401 || !getSession('agent')) { setProgress(0); return viewAccount(); }
      body.replaceChildren(h('div', { class: 'note bad' }, icon('info', 20), res.error), h('button', { class: 'btn primary', onclick: render }, 'Try again'));
      return undefined;
    }
    const status = res.data;
    if (status.stage === 'awaiting_payment') { setProgress(1); return viewPlans(); }
    if (status.stage === 'awaiting_business_profile') { setProgress(2); return viewProfile(status); }
    setProgress(status.stage === 'approved' ? 4 : 3);
    return viewStatus(status);
  }

  // ------------------------------------------------------------------ 1. account
  function viewAccount() {
    let mode = 'register';
    const form = h('div', { class: 'stack' });

    function drawForm() {
      form.replaceChildren();
      if (mode === 'register') {
        const name = field({ label: 'Full name', autocomplete: 'name' });
        const email = field({ label: 'Email address', type: 'email', autocomplete: 'email', inputmode: 'email' });
        const phone = field({ label: 'Phone number', type: 'tel', autocomplete: 'tel', inputmode: 'numeric' });
        const password = field({ label: 'Password (8+ characters)', type: 'password', autocomplete: 'new-password' });
        const confirm = field({ label: 'Confirm password', type: 'password', autocomplete: 'new-password' });
        const button = h('button', { class: 'btn primary lg block' }, 'Create account and continue');
        button.addEventListener('click', async () => {
          if (!name.value) return toast('Enter your name', 'bad');
          if (!/^\S+@\S+\.\S+$/.test(email.value)) return toast('Enter a valid email address', 'bad');
          if (!validNumber(phone.value)) return toast('Enter a valid phone number', 'bad');
          if (password.input.value.length < 8) return toast('Password must be at least 8 characters', 'bad');
          if (password.input.value !== confirm.input.value) return toast('The two passwords do not match', 'bad');
          setLoading(button, true, 'Creating account');
          // No storefront_domain: this is a main-site account, which is what agents use.
          const res = await api('/auth/register', { method: 'POST', session: null, body: { name: name.value, email: email.value, phone: cleanNumber(phone.value), password: password.input.value, password_confirmation: confirm.input.value } });
          setLoading(button, false);
          if (!res.ok) return toast(res.error, 'bad');
          setSession('agent', res.data.token, res.data.user);
          toast('Account created. Please verify your email from the message we sent.', 'ok');
          render();
          return undefined;
        });
        form.append(name.el, email.el, phone.el, password.el, confirm.el, button);
      } else {
        const login = field({ label: 'Email or phone number', autocomplete: 'username', inputmode: 'email' });
        const password = field({ label: 'Password', type: 'password', autocomplete: 'current-password' });
        const button = h('button', { class: 'btn primary lg block' }, 'Sign in and continue');
        button.addEventListener('click', async () => {
          if (!login.value || !password.input.value) return toast('Enter your email/phone and password', 'bad');
          setLoading(button, true, 'Signing in');
          const res = await api('/auth/login', { method: 'POST', session: null, body: { login: login.value, password: password.input.value } });
          setLoading(button, false);
          if (!res.ok) return toast(res.error, 'bad');
          setSession('agent', res.data.token, res.data.user);
          render();
          return undefined;
        });
        form.append(login.el, password.el, button);
      }
    }

    body.replaceChildren(
      h('div', { class: 'card rise', style: { background: 'linear-gradient(150deg, var(--primary), var(--primary-deep))', color: 'var(--on-primary)' } },
        h('h2', { class: 'h2' }, 'Sell data under your own brand'),
        h('p', { style: { opacity: '.9', marginTop: '8px' } }, 'Get your own online store' + ' and mobile app, set your own prices, and earn on every sale. Register in minutes, right here in the app.')),
      segmented([{ value: 'register', label: 'Create account' }, { value: 'login', label: 'I have an account' }], mode, (v) => { mode = v; drawForm(); }),
      form);
    drawForm();
  }

  // ------------------------------------------------------------------ 2. plan
  async function viewPlans() {
    body.replaceChildren(h('div', { class: 'skeleton', style: { height: '180px' } }), h('div', { class: 'skeleton', style: { height: '180px' } }));
    const res = await api('/agent-plans', { session: null });
    const plans = res.ok ? (res.data?.data || []) : [];
    if (!plans.length) {
      body.replaceChildren(h('div', { class: 'note bad' }, icon('info', 20), res.error || 'Plans are not available right now.'), h('button', { class: 'btn primary', onclick: viewPlans }, 'Try again'));
      return;
    }
    let chosen = plans[0].key;
    const cards = plans.map((plan) => {
      const card = h('button', { class: `plan rise${plan.key === chosen ? ' sel' : ''}`, onclick: () => { chosen = plan.key; cards.forEach((c) => c.classList.toggle('sel', c === card)); } },
        h('div', { class: 'row spread' }, h('b', { style: { fontSize: '18px' } }, plan.name), h('span', { class: 'price' }, money(plan.price))),
        h('ul', {}, (plan.features || []).map((f) => h('li', {}, icon('check', 16), f))));
      return card;
    });
    const button = h('button', { class: 'btn primary lg block' }, 'Continue to payment');
    const gatewayHolder = h('div');
    let gateway = null;
    let gateways = [];

    async function refreshGateways() {
      const plan = plans.find((p) => p.key === chosen);
      gateways = await gatewaysFor(plan.price);
      gateway = gateways[0]?.key || null;
      gatewayHolder.replaceChildren(gateways.length > 1 ? h('div', {}, h('div', { class: 'eyebrow' }, 'Pay with'), segmented(gateways.map((g) => ({ value: g.key, label: g.label })), gateway, (v) => { gateway = v; })) : '');
    }
    cards.forEach((card, i) => card.addEventListener('click', () => { refreshGateways(); void i; }));
    refreshGateways();

    button.addEventListener('click', async () => {
      setLoading(button, true, 'Starting payment');
      const started = await api('/agent/plan', { method: 'POST', session: 'agent', body: { plan: chosen, gateway: gateway || undefined } });
      setLoading(button, false);
      if (!started.ok) return toast(started.error, 'bad');
      const ref = started.data.reference;
      const plan = plans.find((p) => p.key === chosen);
      const result = await runPayment({
        url: started.data.authorization_url,
        summary: [['Plan', plan.name], ['Amount', money(plan.price)]],
        successTitle: 'Plan activated',
        successText: 'Payment received. One more step: tell us about your business.',
        verify: async () => {
          const res2 = await api(`/payments/confirm/${encodeURIComponent(ref)}`, { session: 'agent' });
          return { status: res2.ok ? (res2.data?.status || 'pending') : 'pending' };
        },
        resume: async () => {
          const again = await api('/agent/plan', { method: 'POST', session: 'agent', body: { plan: chosen, gateway: gateway || undefined } });
          if (!again.ok) throw new Error(again.error);
          return again.data.authorization_url;
        },
      });
      if (result.status === 'success') render();
      return undefined;
    });

    body.replaceChildren(
      h('div', { class: 'rise' }, h('h2', { class: 'h2' }, 'Choose your plan'), h('p', { class: 'lead' }, 'Pay once. Your store goes live after a quick review.')),
      ...cards, gatewayHolder, button,
      h('button', { class: 'btn text', onclick: signOutAgent }, 'Use a different account'));
  }

  // ------------------------------------------------------------------ 3. business
  function viewProfile(status) {
    const includesDomain = !!status.plan_details?.includes_custom_domain;
    const baseDomain = String(storeDomain() || '').split('.').slice(1).join('.') || 'asbdataghana.com';

    const name = field({ label: 'Business name', value: status.business_name || '', maxlength: 80 });
    const sub = field({ label: 'Your store address', value: status.subdomain || '', maxlength: 40, autocomplete: 'off', hint: `Letters and numbers only. Your store will be at name.${baseDomain}` });
    const region = field({ label: 'Region', options: [{ value: '', label: 'Select your region' }, ...REGIONS.map((r) => ({ value: r, label: r }))], value: '' });
    const momoNetwork = field({ label: 'MoMo network (for your payouts)', options: [{ value: '', label: 'Select network' }, ...MOMO.map((r) => ({ value: r, label: r }))], value: '' });
    const momoNumber = field({ label: 'MoMo number', type: 'tel', inputmode: 'numeric', maxlength: 14 });
    const domain = includesDomain ? field({ label: 'Your own domain (optional)', hint: 'e.g. mystore.com', autocomplete: 'off' }) : null;
    let logoFile = null;
    const preview = h('div', { style: { width: '84px', height: '84px', borderRadius: '24px', background: 'var(--tint)', color: 'var(--primary)', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: 'none' } }, icon('store', 34));
    const picker = h('input', { type: 'file', accept: 'image/*', hidden: true });
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { toast('The logo must be smaller than 2 MB', 'bad'); picker.value = ''; return; }
      logoFile = file;
      preview.replaceChildren(h('img', { src: URL.createObjectURL(file), alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }));
    });

    const checkSub = debounce(async () => {
      const value = sub.input.value.trim().toLowerCase();
      if (!/^[a-z0-9]{3,40}$/.test(value)) { sub.hint('Use 3 or more letters or numbers', value ? 'bad' : ''); return; }
      const res = await api(`/agent/onboarding/subdomain/check?value=${encodeURIComponent(value)}`, { session: 'agent' });
      if (sub.input.value.trim().toLowerCase() !== value) return;
      if (res.ok) sub.hint(res.data.available ? `${value}.${baseDomain} is available` : 'That address is taken, try another', res.data.available ? 'ok' : 'bad');
    }, 450);
    sub.input.addEventListener('input', () => { sub.input.value = sub.input.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); checkSub(); });

    const generate = h('button', { class: 'btn tonal sm', type: 'button' }, 'Suggest an address');
    generate.addEventListener('click', async () => {
      const res = await api(`/agent/onboarding/subdomain/generate?business_name=${encodeURIComponent(name.value)}`, { session: 'agent' });
      if (res.ok && res.data?.value) { sub.input.value = res.data.value; checkSub(); }
    });

    const submit = h('button', { class: 'btn primary lg block' }, 'Submit for review');
    submit.addEventListener('click', async () => {
      if (!name.value) return toast('Enter your business name', 'bad');
      if (!logoFile) return toast('Add your business logo', 'bad');
      if (!/^[a-z0-9]{3,40}$/.test(sub.input.value.trim().toLowerCase())) return toast('Enter a store address (letters and numbers only)', 'bad');
      if (!region.input.value) return toast('Select your region', 'bad');
      if (!momoNetwork.input.value) return toast('Select your MoMo network', 'bad');
      if (!validNumber(momoNumber.value)) return toast('Enter a valid MoMo number', 'bad');

      const form = new FormData();
      form.append('business_name', name.value);
      form.append('business_logo', logoFile);
      form.append('subdomain', sub.input.value.trim().toLowerCase());
      form.append('region', region.input.value);
      form.append('momo_network', momoNetwork.input.value);
      form.append('momo_number', cleanNumber(momoNumber.value));
      if (domain?.value) form.append('custom_domain', domain.value.toLowerCase());

      setLoading(submit, true, 'Submitting');
      const res = await api('/agent/onboarding/business-profile', { method: 'POST', session: 'agent', form });
      setLoading(submit, false);
      if (!res.ok) return toast(res.error, 'bad');
      toast('Submitted! We will review your store shortly.', 'ok');
      render();
      return undefined;
    });

    body.replaceChildren(
      h('div', { class: 'rise' }, h('h2', { class: 'h2' }, 'Tell us about your business'), h('p', { class: 'lead' }, 'This becomes your store and your app. You can fine-tune the look later from your agent dashboard.')),
      h('div', { class: 'row' }, preview, h('div', { class: 'stack', style: { gap: '8px' } }, h('b', {}, 'Business logo'), h('button', { class: 'btn outline sm', type: 'button', onclick: () => picker.click() }, 'Choose a picture'), picker)),
      ...[name.el, sub.el, generate, region.el, momoNetwork.el, momoNumber.el, domain ? domain.el : null, submit].filter(Boolean));
  }

  // ------------------------------------------------------------------ 4. status
  function viewStatus(status) {
    const summary = h('div', { class: 'card', style: { width: '100%', textAlign: 'left' } },
      h('div', { class: 'kv' }, h('span', {}, 'Business'), h('b', {}, status.business_name || '')),
      h('div', { class: 'kv' }, h('span', {}, 'Plan'), h('b', {}, status.plan_details?.name || '')),
      h('div', { class: 'kv' }, h('span', {}, 'Address'), h('b', {}, status.subdomain || '')));

    let view;
    if (status.stage === 'approved') {
      view = [
        h('div', { class: 'result-ico ok' }, icon('check', 56)),
        h('h2', { class: 'h2' }, "You're approved!"),
        h('p', { class: 'lead' }, status.storefront_url ? 'Your store is live. Share it with your customers.' : 'Your store is being set up and will be live shortly.'),
        summary,
        status.storefront_url ? h('button', { class: 'btn primary lg block', onclick: () => openInApp(status.storefront_url) }, 'Open my store') : null,
        h('button', { class: 'btn tonal lg block', onclick: () => openInApp(`${siteUrl()}/agent-dashboard`) }, 'Open my agent dashboard'),
        status.plan_details?.includes_app ? h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Your own mobile app is built automatically from your store settings. Save your store settings in the dashboard to build it.') : null,
      ];
    } else if (status.stage === 'rejected') {
      view = [
        h('div', { class: 'result-ico bad' }, icon('x', 56)),
        h('h2', { class: 'h2' }, 'Application not approved'),
        h('p', { class: 'lead' }, status.rejection_reason || 'Please contact support for more details.'),
        summary,
      ];
    } else {
      view = [
        h('div', { class: 'result-ico wait' }, icon('clock', 56)),
        h('h2', { class: 'h2' }, 'Application submitted'),
        h('p', { class: 'lead' }, "We're reviewing your store. You'll get an email as soon as it's approved, usually within a day."),
        summary,
        h('button', { class: 'btn outline block', onclick: render }, icon('refresh', 18), 'Check status'),
      ];
    }
    body.replaceChildren(h('div', { class: 'stack center rise', style: { alignItems: 'center' } }, ...view), h('button', { class: 'btn text', onclick: signOutAgent }, 'Sign out of this application'));
  }

  async function signOutAgent() {
    if (!(await confirmSheet({ title: 'Switch account?', message: 'You will be signed out of this agent application. Your progress is saved on your account.', confirmText: 'Sign out' }))) return;
    clearSession('agent');
    render();
  }

  render();
  return root;
}
