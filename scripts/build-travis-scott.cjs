// Build an unsigned, locally importable Scrolls browser graph from reviewed DOM selectors.
// The HAR is reference material only; no captured cookies, tokens or contact data are used.
const fs = require('node:fs');
const path = require('node:path');
const SHOE_SIZES = ['3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '14', '15'];
const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
// Ordered: a range compares positions, and shoe and apparel bounds may not mix.
const SIZES = [...SHOE_SIZES, ...APPAREL_SIZES];
// SuperSwipe storefronts this module may enter. Keys are hostnames without "www.".
const STORES = { 'shop.travisscott.com': 'Travis Scott', 'victorvictor.com': 'Victor Victor' };
const nodes = [];
const edges = [];
function node(id, kind, config, { linked = true } = {}) {
  if (nodes.length && linked) edges.push({ id: `e_${edges.length}`, from: nodes.at(-1).id, fromPort: 'next', to: id });
  nodes.push({ id, kind, position: { x: 160, y: nodes.length * 140 }, config });
}
function edge(from, fromPort, to) { edges.push({ id: `e_${edges.length}`, from, fromPort, to }); }
function evaluate(id, script, into, options) { node(id, 'evaluate', { script, into }, options); }
const helpers = `
const visible = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const norm = value => String(value || '').trim().replace(/[\\u2018\\u2019\\u0060\\u00b4]/g, "'").replace(/[\\u201c\\u201d]/g, '"').replace(/\\s+/g, ' ').toLowerCase();
const dialog = () => document.querySelector('[data-scrolls-travis-dialog="active"]');
`;
// Travis Scott uses its own cookie banner; Victor Victor uses Consentmo (open
// shadow root) and Klaviyo sign-up popups. Only these known overlays are dismissed.
function acceptCookies(id, timeoutMs = 0) {
  evaluate(id, helpers + `
const timeoutMs = ${timeoutMs};
const deadline = Date.now() + timeoutMs;
const dismiss = () => {
  const button = document.querySelector('#cookiebanner a.c-button');
  if (visible(button) && norm(button.textContent) === 'ok') { button.click(); return true; }
  for (const host of document.querySelectorAll('csm-cookie-consent, .csm-cmp-root')) {
    const accept = [...(host.shadowRoot || host).querySelectorAll('button, a[role="button"]')]
      .find(el => visible(el) && /^(accept|accept all|allow all|ok|got it|agree|i agree)$/.test(norm(el.textContent)));
    if (accept) { accept.click(); return true; }
  }
  const popupClose = [...document.querySelectorAll('button.klaviyo-close-form')].find(visible);
  if (popupClose) { popupClose.click(); return true; }
  return false;
};
do {
  if (dismiss()) return true;
  if (Date.now() >= deadline) return false;
  await new Promise(resolve => setTimeout(resolve, 100));
} while (true);
`, 'travisCookiesAccepted');
}
node('n_start', 'noop', {});
node('n_settings', 'setVar', { name: 'travisSettings', value: {
  url: '{{inputs.url}}', product: '{{inputs.product}}', size: '{{inputs.size}}',
  sizeMode: '{{inputs.sizeMode}}', sizeMinimum: '{{inputs.sizeMinimum}}', sizeMaximum: '{{inputs.sizeMaximum}}',
  identity: { firstName: '{{profile.identity.firstName}}', lastName: '{{profile.identity.lastName}}', email: '{{profile.identity.email}}', phone: '{{profile.identity.phone}}' }, addresses: '{{addresses}}',
} });
evaluate('n_preflight', `
const settings = {{vars.travisSettings}};
const stores = ${JSON.stringify(STORES)};
const url = new URL(settings.url);
if (url.protocol !== 'https:' || !stores[url.hostname.replace(/^www\\./, '')] || url.username || url.password)
  throw new Error('Use an HTTPS URL on ' + Object.keys(stores).join(' or ') + '.');
const allowedSizes = ${JSON.stringify(SIZES)};
const shoeSizes = ${JSON.stringify(SHOE_SIZES)};
const mode = settings.sizeMode || 'Single size';
if (!['Single size', 'Size range', 'Random'].includes(mode)) throw new Error('Choose Single size, Size range or Random.');
if (mode === 'Single size' && !allowedSizes.includes(String(settings.size))) throw new Error('Choose a size from the supported size list.');
const minimum = allowedSizes.indexOf(String(settings.sizeMinimum)), maximum = allowedSizes.indexOf(String(settings.sizeMaximum));
if (mode === 'Size range' && (minimum < 0 || maximum < 0 || minimum > maximum))
  throw new Error('Choose a valid size range with minimum no greater than maximum.');
if (mode === 'Size range' && shoeSizes.includes(String(settings.sizeMinimum)) !== shoeSizes.includes(String(settings.sizeMaximum)))
  throw new Error('Choose a valid size range: use two shoe sizes or two apparel sizes.');
const addresses = Array.isArray(settings.addresses) ? settings.addresses : [];
const address = addresses.find(a => a.isDefault) || addresses[0];
if (!address) throw new Error('Add a shipping address to this profile before running.');
const identity = settings.identity || {};
const fields = {
  first_name: address.firstName || identity.firstName, last_name: address.lastName || identity.lastName,
  email: identity.email, phone: address.phone || identity.phone,
  address1: address.street1, address2: address.street2 || '', city: address.city,
  state: address.state || '', zip: address.postalCode || '', country: String(address.country || '').toUpperCase(),
};
for (const key of ['first_name', 'last_name', 'email', 'phone', 'address1', 'city', 'country']) {
  if (!String(fields[key] || '').trim()) throw new Error('Profile shipping/contact field missing: ' + key);
}
if (!/^[A-Z]{2}$/.test(fields.country)) throw new Error('Shipping country must be a two-letter country code.');
return fields;
`, 'travisFields');
node('n_goto', 'goto', { url: '{{inputs.url}}', waitUntil: 'domcontentloaded', timeoutMs: 60000 });
// A locked Shopify store redirects every page to /password before a drop.
evaluate('n_store_open', `
if (/^\\/password(\\/|$)/.test(location.pathname)) throw new Error('The store is password-protected; run again once the draw page is live.');
return true;
`, 'travisStoreOpen');
node('n_wait_products', 'waitFor', { selector: '.superswipe-block .superswipe-button', state: 'attached', timeoutMs: 60000 });
evaluate('n_find_product', helpers + `
const settings = {{vars.travisSettings}};
const stores = ${JSON.stringify(STORES)};
const site = location.hostname.replace(/^www\\./, '');
if (!stores[site]) throw new Error('The page left the supported store: ' + location.hostname);
const configOf = block => { try { return JSON.parse(block.querySelector('[data-superswipe-config]').textContent); } catch { return null; } };
const draws = [...document.querySelectorAll('.superswipe-block')].filter(configOf);
const titles = [...new Set(draws.map(block => configOf(block).title))];
const wanted = norm(settings.product);
const matches = wanted ? draws.filter(block => norm(configOf(block).title) === wanted) : draws;
// Themes may render one draw twice (for example desktop and mobile layouts).
const launches = [...new Set(matches.map(block => block.dataset.superswipeLaunchId || configOf(block).title))];
if (launches.length !== 1) {
  const found = titles.length ? ' Draws on this page: ' + titles.join('; ') + '.' : '';
  if (!wanted) throw new Error('This page has ' + titles.length + ' draws; enter the exact product title.' + found);
  throw new Error('Expected one exact product match; found ' + launches.length + '. Check the product title.' + found);
}
const block = matches.find(visible) || matches[0];
const cfg = configOf(block);
if ((block.dataset.releaseMode || cfg.releaseMode) !== 'pay_after') throw new Error('This module supports no-payment entry draws only.');
const variants = JSON.parse(block.querySelector('[data-superswipe-variants]').textContent);
const allowedSizes = ${JSON.stringify(SIZES)};
// Shopify size labels vary by store: "Small", "X-Large", "US 10.5" and so on.
const canonical = value => {
  const label = String(value ?? '').trim().toUpperCase().replace(/\\s+/g, ' ');
  const words = { 'X-SMALL': 'XS', 'XSMALL': 'XS', 'EXTRA SMALL': 'XS', 'SMALL': 'S', 'MEDIUM': 'M', 'LARGE': 'L',
    'X-LARGE': 'XL', 'XLARGE': 'XL', 'EXTRA LARGE': 'XL', 'XX-LARGE': 'XXL', 'XXLARGE': 'XXL', '2XL': 'XXL', '2X': 'XXL',
    'XXX-LARGE': 'XXXL', 'XXXLARGE': 'XXXL', '3XL': 'XXXL', '3X': 'XXXL' };
  if (words[label]) return words[label];
  const shoe = label.match(/^(?:US ?)?(\\d{1,2}(?:\\.5)?)(?: ?US)?$/);
  return shoe ? String(Number(shoe[1])) : label;
};
const optionNames = Array.isArray(cfg.optionNames) ? cfg.optionNames : [];
const optionAt = (variant, index) => Array.isArray(variant.options) ? variant.options[index] : variant['option' + (index + 1)];
const distinct = index => new Set(variants.map(v => String(optionAt(v, index)))).size;
// Mirrors the widget: one variant has no picker, several option names use option chips.
let selection = 'chip', sizeOf = variant => variant.title;
if (variants.length === 1) selection = 'none';
else if (optionNames.length > 1) {
  selection = 'options';
  let sizeIndex = optionNames.findIndex(name => /size/i.test(name));
  const varying = optionNames.map((_, i) => i).filter(i => distinct(i) > 1);
  if (sizeIndex < 0 && varying.length === 1) sizeIndex = varying[0];
  if (sizeIndex < 0) throw new Error('This draw has ' + optionNames.join(' / ') + ' choices without a size option; it is not supported.');
  const others = varying.filter(i => i !== sizeIndex);
  if (others.length) throw new Error('This draw also asks for ' + others.map(i => optionNames[i]).join(' / ') + '; only size choices are supported.');
  sizeOf = variant => optionAt(variant, sizeIndex);
}
const mode = settings.sizeMode || 'Single size';
const rank = size => allowedSizes.indexOf(size);
const available = variants.filter(v => v.available !== false);
let sizes;
if (selection === 'none') {
  // One-size product: a size picker setting only matters if the variant is itself a supported size.
  const only = canonical(sizeOf(variants[0]));
  const matchesSetting = mode === 'Random' || !allowedSizes.includes(only) ||
    (mode === 'Single size' ? only === String(settings.size) : rank(only) >= rank(String(settings.sizeMinimum)) && rank(only) <= rank(String(settings.sizeMaximum)));
  sizes = matchesSetting ? available : [];
} else sizes = available.filter(v => {
  const size = canonical(sizeOf(v));
  return allowedSizes.includes(size) && (
    mode === 'Single size' ? size === String(settings.size) :
    mode === 'Size range' ? rank(size) >= rank(String(settings.sizeMinimum)) && rank(size) <= rank(String(settings.sizeMaximum)) : true);
});
if (!sizes.length || (mode === 'Single size' && sizes.length !== 1))
  throw new Error('Requested size is missing or unavailable; no sizes match the selection. Available: ' + (available.map(v => sizeOf(v)).join(', ') || 'none') + '.');
const variant = sizes[mode === 'Single size' ? 0 : Math.floor(Math.random() * sizes.length)];
if (!/^\\d+$/.test(String(variant.id))) throw new Error('Invalid product variant.');
document.querySelectorAll('[data-scrolls-travis-product]').forEach(el => el.removeAttribute('data-scrolls-travis-product'));
block.setAttribute('data-scrolls-travis-product', 'active');
return { title: cfg.title, site, releaseId: block.dataset.superswipeLaunchId, variantId: String(variant.id), size: String(sizeOf(variant)), selection,
  options: selection === 'options' ? optionNames.map((_, i) => String(optionAt(variant, i))) : [] };
`, 'travisProduct');
// SuperSwipe initially disables the button during its asynchronous status check.
// Wait for the site's own readiness signal on the exact selected product.
node('n_draw_status_notice', 'log', { level: 'info', message: 'Waiting up to 60 seconds for the site to enable Enter Draw for the selected product.' });
node('n_wait_draw_ready', 'waitFor', { selector: '[data-scrolls-travis-product="active"] .superswipe-button:not([disabled])', state: 'visible', timeoutMs: 60000 });
acceptCookies('n_cookies_before_draw', 4500);
node('n_open_draw', 'click', { selector: '[data-scrolls-travis-product="active"] .superswipe-button', instant: true, timeoutMs: 30000 });
node('n_wait_dialog', 'waitFor', { selector: '.superswipe-modal[aria-hidden="false"]', timeoutMs: 30000 });
evaluate('n_bind_dialog', helpers + `
const product = {{vars.travisProduct}};
const matches = [...document.querySelectorAll('.superswipe-modal')].filter(el => visible(el) && norm(el.querySelector('.superswipe-product')?.textContent) === norm(product.title));
if (matches.length !== 1) throw new Error('Could not identify the selected product dialog.');
document.querySelectorAll('[data-scrolls-travis-dialog]').forEach(el => el.removeAttribute('data-scrolls-travis-dialog'));
const modal = matches[0];
if (visible(modal.querySelector('.superswipe-entry-success'))) throw new Error('This browser already shows an entry for this draw; no new entry was recorded.');
if (visible(modal.querySelector('.superswipe-pickup-main-wrap'))) throw new Error('This draw is pickup-only; pickup draws are not supported.');
modal.setAttribute('data-scrolls-travis-dialog', 'active');
return true;
`, 'travisDialogReady');
acceptCookies('n_cookies_before_size');
// Size chips (the recorded format) keep the real click. Multi-option drops pick
// each option chip in turn; one-size drops have no picker at all.
node('n_size_picker', 'branch', { left: '{{vars.travisProduct.selection}}', op: '===', right: 'chip' });
node('n_size', 'click', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-size-chip[data-variant-id="{{vars.travisProduct.variantId}}"]', instant: true, timeoutMs: 30000 }, { linked: false });
evaluate('n_size_options', helpers + `
const modal = dialog();
const product = {{vars.travisProduct}};
for (const [index, value] of product.options.entries()) {
  const chip = [...modal.querySelectorAll('.superswipe-option-chip[data-option-index="' + index + '"]')].find(el => el.dataset.optionValue === value);
  if (!chip || chip.disabled) throw new Error('The draw option ' + value + ' is missing or unavailable.');
  if (chip.getAttribute('aria-checked') !== 'true') {
    await new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 450));
    chip.click();
  }
}
return true;
`, 'travisOptionsReady', { linked: false });
edge('n_size_picker', 'true', 'n_size');
edge('n_size_picker', 'false', 'n_size_options');
evaluate('n_verify_size', `
const modal = document.querySelector('[data-scrolls-travis-dialog="active"]');
const product = {{vars.travisProduct}};
const selected = product.selection === 'chip' ? modal?.querySelector('.superswipe-size-chip[aria-checked="true"]')?.dataset.variantId :
  product.selection === 'options' ? modal?.querySelector('select.superswipe-size')?.value : product.variantId;
if (selected !== product.variantId) throw new Error('The requested size was not selected.');
return true;
`, 'travisSizeReady', { linked: false });
edge('n_size', 'next', 'n_verify_size');
edge('n_size_options', 'next', 'n_verify_size');
node('n_terms_notice', 'log', { level: 'info', message: 'Checking all five draw acknowledgments, including terms, privacy and Email/SMS communications.' });
evaluate('n_accept_terms', helpers + `
const modal = dialog();
if (!visible(modal)) throw new Error('The selected draw dialog is no longer visible.');
const boxes = [...modal.querySelectorAll('.superswipe-terms-accept input.superswipe-checkbox[type="checkbox"]')];
if (boxes.length !== 5) throw new Error('Expected five draw acknowledgment boxes; found ' + boxes.length + '.');
if (boxes.some(box => box.disabled)) throw new Error('The site has disabled the draw acknowledgment boxes.');
return true;
`, 'travisTermsReady');
for (let i = 0; i < 5; i++) {
  node('n_term_pause_' + i, 'dwell', { minMs: 350, maxMs: 900 });
  evaluate('n_term_' + i, helpers + `
const modal = dialog();
if (!visible(modal)) throw new Error('The selected draw dialog is no longer visible.');
const boxes = modal.querySelectorAll('.superswipe-terms-accept input.superswipe-checkbox[type="checkbox"]');
if (boxes.length !== 5) throw new Error('Expected five draw acknowledgment boxes; found ' + boxes.length + '.');
const box = boxes[${i}];
if (box.disabled) throw new Error('The site has disabled the draw acknowledgment boxes.');
if (!box.checked) box.click();
if (!box.checked) throw new Error('The site did not keep all draw acknowledgment boxes checked.');
return true;
`, 'travisTermsReady');
}
evaluate('n_verify_terms', helpers + `
const boxes = dialog()?.querySelectorAll('.superswipe-terms-accept input.superswipe-checkbox[type="checkbox"]');
if (!boxes || boxes.length !== 5 || [...boxes].some(box => !box.checked)) throw new Error('The site did not keep all draw acknowledgment boxes checked.');
return true;
`, 'travisTermsReady');
node('n_wait_terms', 'waitFor', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-continue-button:not([disabled])', timeoutMs: 30000 });
acceptCookies('n_cookies_before_continue');
node('n_continue', 'click', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-continue-button', instant: true, timeoutMs: 30000 });
node('n_wait_form', 'waitFor', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-entry-form:not([hidden]) input[name="first_name"]', timeoutMs: 30000 });
acceptCookies('n_cookies_before_form');
node('n_fill_notice', 'log', { level: 'info', message: 'Filling the selected shipping address and contact details.' });
node('n_country', 'select', { selector: '[data-scrolls-travis-dialog="active"] select[name="country"]', value: '{{vars.travisFields.country}}', timeoutMs: 30000 });
evaluate('n_phone_format', helpers + `
const fields = {{vars.travisFields}};
const prefix = dialog()?.querySelector('[data-pa-phone-prefix]')?.textContent?.replace(/\\D/g, '') || '';
const digits = String(fields.phone).replace(/\\D/g, '');
if (prefix && String(fields.phone).trim().startsWith('+') && digits.startsWith(prefix)) fields.phone = digits.slice(prefix.length);
return fields;
`, 'travisFields');
for (const field of ['first_name', 'last_name', 'email', 'phone', 'address1', 'address2', 'city']) {
  acceptCookies('n_cookies_before_' + field);
  node(`n_${field}`, 'fill', { selector: `[data-scrolls-travis-dialog="active"] input[name="${field}"]`, value: `{{vars.travisFields.${field}}}`, instant: true, timeoutMs: 30000 });
}
// State and postal code controls may be hidden for some shipping countries.
evaluate('n_regional_fields', helpers + `
const fields = {{vars.travisFields}};
for (const name of ['state', 'zip']) {
  const el = dialog()?.querySelector('[name="' + name + '"]');
  if (!visible(el)) continue;
  if (!String(fields[name]).trim()) throw new Error('Fill the profile shipping field: ' + name);
  if (el.tagName === 'SELECT') {
    const option = [...el.options].find(o => !o.disabled && o.value && (norm(o.value) === norm(fields[name]) || norm(o.textContent) === norm(fields[name])));
    if (!option) throw new Error('Shipping ' + name + ' does not match an available option.');
    el.value = option.value;
  } else el.value = fields[name];
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
return true;
`, 'travisRegionalReady');
evaluate('n_verify_fields', helpers + `
const fields = {{vars.travisFields}};
for (const name of ['first_name', 'last_name', 'email', 'phone', 'address1', 'address2', 'city', 'country', 'state', 'zip']) {
  const el = dialog()?.querySelector('[name="' + name + '"]');
  if (['state', 'zip'].includes(name) && el && !visible(el)) continue;
  if (!el || !visible(el)) throw new Error('Shipping form field is missing or hidden: ' + name);
  const actual = name === 'phone' ? el.value.replace(/\\D/g, '') : norm(el.value);
  const expected = name === 'phone' ? String(fields[name]).replace(/\\D/g, '') : norm(fields[name]);
  const selectedText = el.tagName === 'SELECT' ? norm(el.selectedOptions[0]?.textContent) : '';
  if (actual !== expected && !(el.tagName === 'SELECT' && el.value && selectedText === expected)) throw new Error('Shipping form field was not filled correctly: ' + name);
}
return true;
`, 'travisFieldsReady');
node('n_submit_notice', 'log', { level: 'info', message: 'Solving Turnstile with the configured Key Vault provider, then submitting the draw entry.' });
node('n_solve_turnstile', 'captcha.solveTurnstile', { frameSelector: '[data-scrolls-travis-dialog="active"] .superswipe-turnstile iframe', provider: 'auto', timeoutMs: 180000, into: 'travisTurnstile' });
acceptCookies('n_cookies_before_submit');
node('n_submit', 'click', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-entry-submit', instant: true, timeoutMs: 30000 });
node('n_wait_success', 'waitFor', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-entry-success:not([hidden]), [data-scrolls-travis-dialog="active"] .superswipe-message.is-visible.is-error', state: 'visible', timeoutMs: 45000 });
evaluate('n_confirm', helpers + `
const modal = dialog();
const product = {{vars.travisProduct}};
if (!visible(modal) || norm(modal.querySelector('.superswipe-product')?.textContent) !== norm(product.title)) throw new Error('Entry confirmation belongs to an unexpected dialog.');
const error = modal.querySelector('.superswipe-message.is-visible.is-error');
if (visible(error)) throw new Error('Entry rejected by the site: ' + error.textContent.trim());
const success = modal.querySelector('.superswipe-entry-success');
if (!visible(success) || !/you['’]re entered/i.test(success.textContent || '')) throw new Error('The site has not confirmed entry.');
const fields = {{vars.travisFields}};
const actual = modal.querySelector('input[name="email"]')?.value?.trim();
if (!actual) throw new Error('The confirmed entry has no email address.');
const selected = product.selection === 'chip' ? modal.querySelector('.superswipe-size-chip[aria-checked="true"]')?.dataset.variantId :
  product.selection === 'options' ? modal.querySelector('select.superswipe-size')?.value : product.variantId;
if (selected !== product.variantId) throw new Error('Size changed during entry; review the confirmation manually.');
return { email: actual, status: 'entered', site: product.site, releaseId: product.releaseId, variantId: product.variantId, size: product.size };
`, 'travisOutcome');
node('n_save_entry', 'inventory.record', { site: '{{vars.travisProduct.site}}', productLabel: '{{vars.travisProduct.title}}', status: 'entered', email: '{{vars.travisOutcome.email}}', productUrl: '{{inputs.url}}', cost: 0, currency: 'USD', metadata: '{{vars.travisOutcome}}', into: 'travisEntry' });
node('n_result', 'setResult', { value: '{{vars.travisOutcome}}' });
const DESCRIPTION = 'Oasis-style browser flow for SuperSwipe no-payment draws on shop.travisscott.com and victorvictor.com. Selects your size (shoe or apparel; one-size drops need none), dismisses the cookie banner, checks the five draw acknowledgments individually with randomized pauses, fills and verifies shipping details, solves Turnstile through Key Vault and submits. Acknowledgments include terms, privacy and Email/SMS communications. Saves only a visible entry confirmation. Requires Scrolls 1.6.0 or newer. 0.4.0: Victor Victor store support, optional product title when the page has one draw, apparel and one-size drops.';
const URL_HINT = 'shop.travisscott.com or victorvictor.com. A password-protected store fails until the draw is live.';
const PRODUCT_HINT = 'Leave blank when the page has a single draw. With several draws, enter the title exactly as shown.';
const sizeInput = (id, label, defaultValue, equals) => ({ id, type: 'select', label, default: defaultValue, options: SIZES,
  visibleWhen: { input: 'sizeMode', equals }, requiredWhen: { input: 'sizeMode', equals } });
const graph = {
  schemaVersion: 1, version: '0.4.0', metadata: {
    id: 'travis-scott-browser', name: 'Travis Scott — Browser Entry', class: 'raffle', description: DESCRIPTION,
    tags: ['travis-scott', 'victor-victor', 'superswipe', 'browser', 'raffle'], inputs: [
      { id: 'url', label: 'Store / product URL', type: 'url', required: true, defaultValue: 'https://shop.travisscott.com/', hint: URL_HINT },
      { id: 'product', label: 'Exact product title', type: 'string', required: false, defaultValue: '', hint: PRODUCT_HINT },
      { id: 'sizeMode', label: 'Size selection', type: 'select', defaultValue: 'Single size', options: ['Single size', 'Size range', 'Random'], hint: 'Random chooses from available supported sizes. Size range chooses randomly within your inclusive bounds.' },
      { id: 'size', label: 'Size', type: 'select', required: true, defaultValue: '10.5', options: SIZES, visibleWhen: { input: 'sizeMode', equals: 'Single size' } },
      { id: 'sizeMinimum', label: 'Minimum size', type: 'select', required: true, defaultValue: '8', options: SIZES, visibleWhen: { input: 'sizeMode', equals: 'Size range' } },
      { id: 'sizeMaximum', label: 'Maximum size', type: 'select', required: true, defaultValue: '12', options: SIZES, visibleWhen: { input: 'sizeMode', equals: 'Size range' } },
    ],
  }, permissions: ['browser', 'evaluate', 'captcha', 'inventory'], variables: [], start: 'n_start', nodes, edges,
  runSchema: {
    schemaVersion: 1, kind: 'graph',
    module: { id: 'travis-scott-browser', name: 'Travis Scott — Browser Entry', site: 'shop.travisscott.com', siteLabel: 'Travis Scott', execution: 'browser' },
    tabs: { identity: { kinds: ['saved', 'generated'] }, network: { proxy: 'optional' }, api: { captcha: [{ type: 'turnstile', mode: 'token', label: 'Turnstile solver' }] } },
    threads: { default: 1, max: 20 }, runCount: 'identity',
    inputs: [
      { id: 'url', type: 'url', label: 'Store / product URL', default: 'https://shop.travisscott.com/', required: true, hint: URL_HINT },
      { id: 'product', type: 'text', label: 'Exact product title', default: '', placeholder: 'Blank: the only draw on the page', hint: PRODUCT_HINT },
      { id: 'sizeMode', type: 'segmented', label: 'Size selection', default: 'Single size', options: [
        { value: 'Single size', hint: 'Enter one size. Ignored for one-size drops.' },
        { value: 'Size range', hint: 'Chooses randomly within your inclusive bounds (two shoe sizes or two apparel sizes).' },
        { value: 'Random', hint: 'Chooses from the available supported sizes.' },
      ] },
      sizeInput('size', 'Size', '10.5', 'Single size'),
      sizeInput('sizeMinimum', 'Minimum size', '8', 'Size range'),
      sizeInput('sizeMaximum', 'Maximum size', '12', 'Size range'),
    ],
  },
};
const target = path.resolve(__dirname, '../tasks/travis-scott-browser.arcana-task.json');
fs.writeFileSync(target, JSON.stringify({ format: 'arcana-task/v1', exportedAt: '2026-10-22T00:00:00.000Z', graph }, null, 2) + '\n');
console.log(`Built ${nodes.length} browser flow nodes: ${target}`);
