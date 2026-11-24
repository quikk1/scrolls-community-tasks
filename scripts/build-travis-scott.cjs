// Build an unsigned, locally importable Scrolls browser graph from reviewed DOM selectors.
// The HAR is reference material only; no captured cookies, tokens or contact data are used.
const fs = require('node:fs');
const path = require('node:path');
const SHOE_SIZES = ['3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '14', '15'];
const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
// Ordered: a range compares positions, and shoe and apparel bounds may not mix.
const SIZES = [...SHOE_SIZES, ...APPAREL_SIZES];
const SHOPIFY_SIZES = [...SHOE_SIZES, '16', '17', '18'];
const INPUT_SIZES = [...SHOPIFY_SIZES, ...APPAREL_SIZES];
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
  sizeMode: '{{inputs.sizeMode}}', sizeMinimum: '{{inputs.sizeMinimum}}', sizeMaximum: '{{inputs.sizeMaximum}}', cardDraws: '{{inputs.cardDraws}}', cardSource: '{{inputs.cardSource}}', enterAllDraws: '{{inputs.enterAllDraws}}',
  identity: { firstName: '{{profile.identity.firstName}}', lastName: '{{profile.identity.lastName}}', email: '{{profile.identity.email}}', phone: '{{profile.identity.phone}}' }, addresses: '{{addresses}}',
} });
evaluate('n_preflight', `
const settings = {{vars.travisSettings}};
const stores = ${JSON.stringify(STORES)};
const url = new URL(settings.url);
if (url.protocol !== 'https:' || !stores[url.hostname.replace(/^www\\./, '')] || url.username || url.password)
  throw new Error('Use an HTTPS URL on ' + Object.keys(stores).join(' or ') + '.');
const allowedSizes = ${JSON.stringify(INPUT_SIZES)};
const shoeSizes = ${JSON.stringify(SHOPIFY_SIZES)};
const mode = settings.sizeMode || 'Single size';
if (!['Single size', 'Size range', 'Random'].includes(mode)) throw new Error('Choose Single size, Size range or Random.');
if (mode === 'Single size' && !allowedSizes.includes(String(settings.size))) throw new Error('Choose a size from the supported size list.');
const minimum = allowedSizes.indexOf(String(settings.sizeMinimum)), maximum = allowedSizes.indexOf(String(settings.sizeMaximum));
if (mode === 'Size range' && (minimum < 0 || maximum < 0 || minimum > maximum))
  throw new Error('Choose a valid size range with minimum no greater than maximum.');
if (mode === 'Size range' && shoeSizes.includes(String(settings.sizeMinimum)) !== shoeSizes.includes(String(settings.sizeMaximum)))
  throw new Error('Choose a valid size range: use two shoe sizes or two apparel sizes.');
return true;
`, 'travisPreflight');
node('n_goto', 'goto', { url: '{{inputs.url}}', waitUntil: 'domcontentloaded', timeoutMs: 60000 });
evaluate('n_store_open', `
const stores = ${JSON.stringify(STORES)};
if (location.protocol !== 'https:' || !stores[location.hostname.replace(/^www\\./, '')])
  throw new Error('The page left the supported store: ' + location.hostname);
if (/^\\/password(\\/|$)/.test(location.pathname)) throw new Error('The store is password-protected; run again once the draw page is live.');
return true;
`, 'travisStoreOpen');
const SHOPIFY_CARD = '.RaffleMulti__item.js-raffle[data-raffle-id]';
const SHOPIFY_DRAW = '[data-scrolls-shopify-draw="active"]';
node('n_wait_products', 'waitFor', { selector: '.superswipe-block .superswipe-button, ' + SHOPIFY_CARD + ' [data-raffle-data]', state: 'attached', timeoutMs: 60000 });
evaluate('n_detect_layout', `
return location.hostname.replace(/^www\\./, '') === 'shop.travisscott.com' &&
  !!document.querySelector(${JSON.stringify(SHOPIFY_CARD + ' [data-raffle-data]')});
`, 'travisShopifyLayout');
node('n_layout', 'branch', { left: '{{vars.travisShopifyLayout}}', op: 'truthy' });
evaluate('n_shipping_fields', `
const settings = {{vars.travisSettings}};
const allowedSizes = ${JSON.stringify(SIZES)};
if (settings.sizeMode === 'Size range' && ![settings.sizeMinimum, settings.sizeMaximum].every(size => allowedSizes.includes(String(size))))
  throw new Error('Choose a valid size range for this SuperSwipe draw.');
if ((!settings.sizeMode || settings.sizeMode === 'Single size') && !allowedSizes.includes(String(settings.size)))
  throw new Error('Choose a size from the supported size list for this SuperSwipe draw.');
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
`, 'travisFields', { linked: false });
edge('n_layout', 'false', 'n_shipping_fields');
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
const releaseMode = block.dataset.releaseMode || cfg.releaseMode || 'standard';
const cardDraws = settings.cardDraws === true || settings.cardDraws === 'true';
// "standard" draws hand off to Shopify checkout with a deferred-payment selling
// plan: $0 today, charged only if selected. Entering them needs an explicit opt-in.
if (releaseMode === 'standard' && !cardDraws) throw new Error('This draw needs a card on file ($0 today, charged only if selected). Turn on Card draws to enter it; no-payment entry draws need nothing.');
if (!['pay_after', 'standard'].includes(releaseMode)) throw new Error('This module supports no-payment and card-on-file entry draws only.');
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
return { title: cfg.title, site, releaseMode, releaseId: block.dataset.superswipeLaunchId, variantId: String(variant.id), size: String(sizeOf(variant)), selection,
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
// SuperSwipe can re-render its dialog after the acknowledgments, so rebind to
// the visible dialog for this product before pressing Continue, and report
// what the page shows if Continue never becomes available.
evaluate('n_continue', helpers + `
const product = {{vars.travisProduct}};
const deadline = Date.now() + 30000;
const findModal = () => {
  const active = dialog();
  if (visible(active)) return active;
  const modal = [...document.querySelectorAll('.superswipe-modal')].find(el => visible(el) && norm(el.querySelector('.superswipe-product')?.textContent) === norm(product.title));
  if (modal) {
    document.querySelectorAll('[data-scrolls-travis-dialog]').forEach(el => el.removeAttribute('data-scrolls-travis-dialog'));
    modal.setAttribute('data-scrolls-travis-dialog', 'active');
  }
  return modal;
};
while (true) {
  const modal = findModal();
  const button = [...(modal?.querySelectorAll('.superswipe-continue-button') || [])].find(visible);
  if (button && !button.disabled) {
    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  }
  if (Date.now() > deadline) {
    const state = !modal ? 'no visible draw dialog' : !button ? 'Continue is hidden' : 'Continue is disabled';
    const text = (modal || document.body).innerText.replace(/\\s+/g, ' ').trim().slice(0, 240);
    throw new Error('Could not press Continue (' + state + '). The page shows: ' + text);
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}
`, 'travisContinued');
node('n_entry_route', 'branch', { left: '{{vars.travisProduct.releaseMode}}', op: '===', right: 'pay_after' });
node('n_wait_form', 'waitFor', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-entry-form:not([hidden]) input[name="first_name"]', timeoutMs: 30000 }, { linked: false });
edge('n_entry_route', 'true', 'n_wait_form');
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
// Card-on-file ("standard") draws: SuperSwipe puts the size in a cart with a
// deferred-payment selling plan and opens Shopify checkout. The order is $0
// today; the store charges the Key Vault card later only if the entry wins.
// Selectors follow Shopify's one-page checkout (captured live 22 Oct 2026).
const CO_FIELD = name => `input[name="${name}"]:not([id^="autofill_"])`;
const CARD_FRAME = (frame, input) => `iframe[name^="card-fields-${frame}-"] >> internal:control=enter-frame >> input[name="${input}"]`;
// Scrolls 1.10.53+: source "address" reads the card saved on the run's address record.
node('n_co_card', 'vault.pick', { source: '{{inputs.cardSource}}', cardId: '{{inputs.cardId}}', into: 'travisCard' }, { linked: false });
edge('n_entry_route', 'false', 'n_co_card');
// Only non-secret card details go into a script; the number and CVV are typed by fill nodes.
node('n_co_card_meta', 'setVar', { name: 'travisCardMeta', value: { name: '{{vars.travisCard.cardholderName}}', expMonth: '{{vars.travisCard.expMonth}}', expYear: '{{vars.travisCard.expYear}}', source: '{{vars.travisCard.source}}' } });
evaluate('n_co_card_fields', `
const meta = {{vars.travisCardMeta}};
const fields = {{vars.travisFields}};
const settings = {{vars.travisSettings}};
// An app older than 1.10.53 ignores source "address" and returns the Key Vault card instead.
if ((settings.cardSource || 'address') === 'address' && meta.source !== 'address') throw new Error('Address-record cards need Scrolls 1.10.53 or newer. Update Scrolls, or choose Key Vault card.');
const month = String(meta.expMonth ?? '').padStart(2, '0'), year = String(meta.expYear ?? '').slice(-2);
if (!/^(0[1-9]|1[0-2])$/.test(month) || !/^\\d{2}$/.test(year)) throw new Error('The Key Vault card has no valid expiry date.');
const name = String(meta.name || '').trim() || (fields.first_name + ' ' + fields.last_name).trim();
// Shopify's national phone field: drop the +1 prefix for US and Canada.
let phone = String(fields.phone).trim();
const digits = phone.replace(/\\D/g, '');
if (['US', 'CA'].includes(fields.country) && /^1\\d{10}$/.test(digits)) phone = digits.slice(1);
else if (['US', 'CA'].includes(fields.country) && /^\\d{10}$/.test(digits)) phone = digits;
return { expiry: month + ' / ' + year, name, phone };
`, 'travisCardFields');
node('n_co_queue_notice', 'log', { level: 'info', message: 'Opening Shopify checkout. Busy drops queue checkouts; waiting up to 90 minutes in line.' });
node('n_co_wait_checkout', 'waitFor', { selector: '#checkout-pay-button', state: 'attached', timeoutMs: 5400000 });
node('n_co_wait_email', 'waitFor', { selector: 'input#email', state: 'visible', timeoutMs: 60000 });
evaluate('n_co_check_page', helpers + `
const product = {{vars.travisProduct}};
if (location.hostname.replace(/^www\\./, '') !== product.site || !/\\/checkouts?\\//.test(location.pathname)) throw new Error('Unexpected checkout page: ' + location.hostname + location.pathname);
const text = norm(document.body.innerText);
if (!text.includes(norm(product.title))) throw new Error('The checkout cart does not show the selected draw product.');
const due = document.body.innerText.match(/Due today\\s*(?:[A-Z]{3})?\\s*[^0-9\\s]?\\s*([0-9][0-9.,]*)/i);
if (!due || Number(due[1].replace(/,/g, '')) !== 0) throw new Error('Checkout does not show $0.00 due today; stopped before entering payment details.');
return true;
`, 'travisCheckoutReady');
node('n_co_fill_notice', 'log', { level: 'info', message: 'Filling checkout contact and shipping details.' });
node('n_co_email', 'fill', { selector: 'input#email', value: '{{vars.travisFields.email}}', instant: true, timeoutMs: 30000 });
node('n_co_country', 'select', { selector: 'select[name="countryCode"]', value: '{{vars.travisFields.country}}', timeoutMs: 30000 });
node('n_co_first_name', 'fill', { selector: CO_FIELD('firstName'), value: '{{vars.travisFields.first_name}}', instant: true, timeoutMs: 30000 });
node('n_co_last_name', 'fill', { selector: CO_FIELD('lastName'), value: '{{vars.travisFields.last_name}}', instant: true, timeoutMs: 30000 });
node('n_co_address1', 'fill', { selector: CO_FIELD('address1'), value: '{{vars.travisFields.address1}}', instant: true, timeoutMs: 30000 });
// Close the address-suggestion list without choosing a suggestion.
node('n_co_address1_close', 'press', { selector: CO_FIELD('address1'), key: 'Escape', instant: true, timeoutMs: 30000 });
node('n_co_address2', 'fill', { selector: CO_FIELD('address2'), value: '{{vars.travisFields.address2}}', instant: true, timeoutMs: 30000 });
node('n_co_city', 'fill', { selector: CO_FIELD('city'), value: '{{vars.travisFields.city}}', instant: true, timeoutMs: 30000 });
// State and postal code depend on the country; React needs the native value setter.
evaluate('n_co_regional', helpers + `
const fields = {{vars.travisFields}};
const setValue = (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
};
const zone = document.querySelector('select[name="zone"], input[name="zone"]:not([id^="autofill_"])');
if (visible(zone)) {
  if (!String(fields.state).trim()) throw new Error('Fill the profile shipping field: state');
  if (zone.tagName === 'SELECT') {
    const option = [...zone.options].find(o => !o.disabled && o.value && (norm(o.value) === norm(fields.state) || norm(o.textContent) === norm(fields.state)));
    if (!option) throw new Error('Shipping state does not match an available option.');
    setValue(zone, option.value);
  } else setValue(zone, fields.state);
}
const zip = document.querySelector('input[name="postalCode"]:not([id^="autofill_"])');
if (visible(zip)) {
  if (!String(fields.zip).trim()) throw new Error('Fill the profile shipping field: zip');
  setValue(zip, fields.zip);
}
return true;
`, 'travisCheckoutRegional');
node('n_co_phone', 'fill', { selector: CO_FIELD('phone'), value: '{{vars.travisCardFields.phone}}', instant: true, timeoutMs: 30000 });
evaluate('n_co_verify_fields', helpers + `
const fields = {{vars.travisFields}};
const card = {{vars.travisCardFields}};
const value = name => document.querySelector('[name="' + name + '"]:not([id^="autofill_"])');
const expected = { email: fields.email, firstName: fields.first_name, lastName: fields.last_name, address1: fields.address1, address2: fields.address2, city: fields.city, countryCode: fields.country };
for (const [name, want] of Object.entries(expected)) {
  const el = value(name);
  if (!el || (!visible(el) && name !== 'address2')) throw new Error('Checkout field is missing or hidden: ' + name);
  if (visible(el) && norm(el.value) !== norm(want)) throw new Error('Checkout field was not filled correctly: ' + name);
}
const phone = value('phone');
if (visible(phone) && phone.value.replace(/\\D/g, '').slice(-10) !== String(card.phone).replace(/\\D/g, '').slice(-10)) throw new Error('Checkout field was not filled correctly: phone');
return true;
`, 'travisCheckoutFields');
evaluate('n_co_wait_shipping', helpers + `
const deadline = Date.now() + 45000;
while (Date.now() < deadline) {
  const text = document.body.innerText;
  if (/no shipping (rates|options|methods)|can.t ship to|doesn.t ship to|isn.t available for/i.test(text)) throw new Error('The store has no shipping option for this address.');
  if (!/Enter your shipping address to view available shipping methods|Getting available shipping rates|Calculating/i.test(text)) return true;
  await new Promise(resolve => setTimeout(resolve, 500));
}
throw new Error('Shipping options did not load for this address.');
`, 'travisShippingReady');
evaluate('n_co_card_tile', `
const tile = document.querySelector('#payment-tiles-creditCards');
if (tile && !tile.checked) tile.click();
if (tile && !tile.checked) throw new Error('Could not choose credit card payment.');
return true;
`, 'travisCardTile');
node('n_co_card_notice', 'log', { level: 'info', message: 'Entering the Key Vault card ($0 due today).' });
node('n_co_card_wait', 'waitFor', { selector: CARD_FRAME('number', 'number'), state: 'visible', timeoutMs: 60000 });
node('n_co_card_number', 'fill', { selector: CARD_FRAME('number', 'number'), value: '{{vars.travisCard.number}}', timeoutMs: 30000 });
node('n_co_card_expiry', 'fill', { selector: CARD_FRAME('expiry', 'expiry'), value: '{{vars.travisCardFields.expiry}}', timeoutMs: 30000 });
node('n_co_card_cvv', 'fill', { selector: CARD_FRAME('verification_value', 'verification_value'), value: '{{vars.travisCard.cvv}}', timeoutMs: 30000 });
node('n_co_card_name', 'fill', { selector: CARD_FRAME('name', 'name'), value: '{{vars.travisCardFields.name}}', timeoutMs: 30000 });
evaluate('n_co_before_pay', helpers + `
const due = document.body.innerText.match(/Due today\\s*(?:[A-Z]{3})?\\s*[^0-9\\s]?\\s*([0-9][0-9.,]*)/i);
if (!due || Number(due[1].replace(/,/g, '')) !== 0) throw new Error('Checkout no longer shows $0.00 due today; stopped before paying.');
const errors = [...document.querySelectorAll('[id^="error-for-"]')].filter(visible).map(el => el.textContent.trim()).filter(Boolean);
if (errors.length) throw new Error('Checkout rejected a field: ' + errors.join('; '));
const pay = document.querySelector('#checkout-pay-button');
if (!visible(pay) || pay.disabled) throw new Error('The checkout pay button is not available.');
const later = document.body.innerText.match(/Due [A-Z][a-z]{2} \\d{1,2}, \\d{4}\\s*([^\\n]+)/);
return { dueToday: 0, dueLater: later ? later[0].replace(/\\s+/g, ' ').trim() : '' };
`, 'travisCheckoutDue');
node('n_co_pay_notice', 'log', { level: 'info', message: 'Completing the $0.00 checkout.' });
node('n_co_pay', 'click', { selector: '#checkout-pay-button', timeoutMs: 30000 });
node('n_co_wait_result', 'waitFor', { selector: 'h1:has-text("Thank you"), h2:has-text("Thank you"), [id^="error-for-"]:visible, [role="alert"]:visible:not(:empty)', state: 'visible', timeoutMs: 180000 });
evaluate('n_co_confirm', helpers + `
const product = {{vars.travisProduct}};
const fields = {{vars.travisFields}};
const due = {{vars.travisCheckoutDue}};
const heading = [...document.querySelectorAll('h1, h2')].find(el => visible(el) && /thank you/i.test(el.textContent));
if (!/thank[-_]you/i.test(location.pathname) && !heading) {
  const errors = [...document.querySelectorAll('[id^="error-for-"], [role="alert"]')].filter(visible).map(el => el.textContent.trim()).filter(Boolean);
  throw new Error('Checkout was not completed: ' + (errors.join('; ') || 'no confirmation page'));
}
const text = document.body.innerText;
const confirmation = (text.match(/Confirmation\\s*#?\\s*([A-Z0-9-]{4,})/i) || text.match(/Order\\s*#\\s*([A-Z0-9-]+)/i) || [])[1] || '';
return { email: fields.email, status: 'entered', site: product.site, releaseId: product.releaseId, variantId: product.variantId, size: product.size,
  entry: 'card-on-file', confirmation, dueLater: due.dueLater };
`, 'travisOutcome');
node('n_co_save_entry', 'inventory.record', { site: '{{vars.travisProduct.site}}', productLabel: '{{vars.travisProduct.title}}', status: 'entered', email: '{{vars.travisOutcome.email}}', productUrl: '{{inputs.url}}', cost: 0, currency: 'USD', metadata: '{{vars.travisOutcome}}', into: 'travisEntry' });
node('n_co_result', 'setResult', { value: '{{vars.travisOutcome}}' });

// The Travis Scott theme also has a contact-only draw form of its own. Its
// "joyride" game only unlocks the form in the browser; the entry itself is one
// JSON POST to the draw's raffleSubmitUrl with a Turnstile token and a time
// reference (captured 24 Nov 2026). The flow sends that same request from the
// storefront page, so no game, review or manual click is needed.
const SHOPIFY_TURNSTILE = '#scrolls-shopify-turnstile';
const SHOPIFY_TOKEN = SHOPIFY_TURNSTILE + ' input[name="cf-turnstile-response"][value]:not([value=""])';
evaluate('n_shopify_draw', helpers + `
const settings = {{vars.travisSettings}};
const sizes = ${JSON.stringify(SHOPIFY_SIZES)};
const cards = [...document.querySelectorAll(${JSON.stringify(SHOPIFY_CARD)})].filter(visible);
const draws = cards.map(card => {
  const title = card.querySelector('.js-product-title')?.textContent.trim() || '';
  const colorway = card.querySelector('.js-add-description p')?.textContent.trim() || '';
  return { card, title, colorway, label: colorway ? title + ' — ' + colorway : title };
}).filter(draw => draw.title);
const wanted = norm(settings.product);
const matches = wanted ? draws.filter(draw => [draw.title, draw.colorway, draw.label].some(label => norm(label) === wanted)) : draws;
if (matches.length !== 1)
  throw new Error('Choose one Travis Scott draw by its exact title and colorway. Draws on this page: ' + (draws.map(draw => draw.label).join(', ') || 'none'));
const { card, label } = matches[0];
let config;
try { config = JSON.parse(card.querySelector('[data-raffle-data]')?.textContent || '{}'); }
catch { throw new Error('The selected Travis Scott draw has unreadable draw data.'); }
const releaseId = card.dataset.raffleId;
if (config.rafId !== releaseId || config.raffleStatus !== 'open')
  throw new Error('The selected Travis Scott draw is closed or unavailable.');
if (config.raffleHideExtraFields !== true || config.raffleUsOnly !== true)
  throw new Error('This Travis Scott draw does not use the supported U.S. contact form.');
let submitUrl;
try { submitUrl = new URL(config.raffleSubmitUrl); } catch {}
if (submitUrl?.protocol !== 'https:' || !/^[a-z0-9]+\\.execute-api\\.[a-z0-9-]+\\.amazonaws\\.com$/.test(submitUrl.hostname) || submitUrl.username || submitUrl.password)
  throw new Error('The selected Travis Scott draw submits to an unrecognized address; not entering.');
const siteKey = String(config.raffleCaptchaTurnstileKey || '0x4AAAAAAABM6dKVzpGE1ibP');
if (!/^0x[A-Za-z0-9_-]+$/.test(siteKey)) throw new Error('The selected Travis Scott draw has no valid verification key.');
const status = card.querySelector('[data-signup-status]');
if (!status) throw new Error('This draw is missing its signup status.');
if (norm(status.textContent)) throw new Error('This draw already shows a signup status.');
// The site's form offers every variant title as a size; the products are placeholders.
const offered = (config.product?.variants || []).map(variant => String(variant.public_title || 'One Size'));
const available = offered.filter(size => sizes.includes(size));
const mode = settings.sizeMode || 'Single size';
const lower = sizes.indexOf(String(settings.sizeMinimum));
const upper = sizes.indexOf(String(settings.sizeMaximum));
const eligible = available.filter(size => {
  if (mode === 'Random') return true;
  if (mode === 'Single size') return size === String(settings.size);
  const index = sizes.indexOf(size);
  return index >= lower && index <= upper;
});
if (!eligible.length) throw new Error('No sizes match the selection. Available: ' + (offered.join(', ') || 'none'));
const size = eligible[Math.floor(Math.random() * eligible.length)];
const addresses = Array.isArray(settings.addresses) ? settings.addresses : [];
const address = addresses.find(item => item.isDefault) || addresses[0] || {};
const identity = settings.identity || {};
const phone = String(address.phone || identity.phone || '').replace(/\\D/g, '').replace(/^1(?=\\d{10}$)/, '');
const fields = {
  email: String(identity.email || '').trim(),
  firstName: String(address.firstName || identity.firstName || '').trim(),
  lastName: String(address.lastName || identity.lastName || '').trim(),
};
// Same checks as the storefront form: names of at least two characters, an email and a 10-digit U.S. number.
if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(fields.email) || fields.firstName.length < 2 || fields.lastName.length < 2 || !/^[2-9]\\d{2}[2-9]\\d{6}$/.test(phone))
  throw new Error('The draw requires a first and last name (2+ characters), a valid email and a valid 10-digit U.S. phone number.');
const enterAll = settings.enterAllDraws === true || settings.enterAllDraws === 'true';
if (enterAll && config.raffleShowEnterNextRaffle !== true)
  throw new Error('This draw does not offer entering the other draws; turn off Enter all draws.');
for (const draw of cards) draw.removeAttribute('data-scrolls-shopify-draw');
card.setAttribute('data-scrolls-shopify-draw', 'active');
return {
  label: enterAll ? label + ' (+ other open draws)' : label, releaseId, submitUrl: submitUrl.href, siteKey, size, enterNextRaffle: enterAll,
  // The storefront sends the number in international format, e.g. +1 602-555-0123.
  fields: { ...fields, tel: '+1 ' + phone.slice(0, 3) + '-' + phone.slice(3, 6) + '-' + phone.slice(6) },
};
`, 'travisShopifyDraw', { linked: false });
edge('n_layout', 'true', 'n_shopify_draw');
node('n_shopify_notice', 'log', { level: 'info', message: 'Entering {{vars.travisShopifyDraw.label}} in size {{vars.travisShopifyDraw.size}}. Waiting for Cloudflare verification on the storefront.' });
// Implicit Turnstile rendering: api.js finds the widget, and the token lands in its hidden
// cf-turnstile-response input. Nothing runs in the page's main world.
evaluate('n_shopify_turnstile', helpers + `
const draw = {{vars.travisShopifyDraw}};
document.querySelector(${JSON.stringify(SHOPIFY_TURNSTILE)})?.remove();
const box = document.createElement('div');
box.id = ${JSON.stringify(SHOPIFY_TURNSTILE.slice(1))};
box.style.cssText = 'position:fixed;top:16px;left:16px;z-index:2147483647;padding:8px;background:#fff;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.4)';
const widget = document.createElement('div');
widget.className = 'cf-turnstile';
widget.dataset.sitekey = draw.siteKey;
widget.dataset.theme = 'light';
box.append(widget);
document.body.append(box);
if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile/"]'))
  throw new Error('The storefront already loaded its own verification; reload the page and run again.');
const script = document.createElement('script');
script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
script.async = true;
document.head.append(script);
return true;
`, 'travisShopifyTurnstile');
node('n_shopify_token_auto', 'elementExists', { selector: SHOPIFY_TOKEN, timeoutMs: 20000, into: 'travisShopifyAutoPassed' });
node('n_shopify_token_branch', 'branch', { left: '{{vars.travisShopifyAutoPassed}}', op: 'truthy' });
// Interactive challenge: click the checkbox once, then allow time for it (or the user) to finish.
evaluate('n_shopify_checkbox', helpers + `
const widget = document.querySelector(${JSON.stringify(SHOPIFY_TURNSTILE + ' .cf-turnstile')});
const rect = widget?.getBoundingClientRect();
if (!rect || rect.width < 40 || rect.height < 20) throw new Error('Cloudflare verification did not load on the storefront. Check the proxy and run again.');
return { x: Math.round(rect.left + 28 + Math.random() * 6), y: Math.round(rect.top + rect.height / 2 + (Math.random() * 6 - 3)) };
`, 'travisShopifyCheckbox', { linked: false });
edge('n_shopify_token_branch', 'false', 'n_shopify_checkbox');
node('n_shopify_checkbox_notice', 'log', { level: 'info', message: 'Cloudflare asked for a check; clicking the verification box.' });
node('n_shopify_checkbox_click', 'mouse.click', { x: '{{vars.travisShopifyCheckbox.x}}', y: '{{vars.travisShopifyCheckbox.y}}' });
node('n_shopify_token_wait', 'waitFor', { selector: SHOPIFY_TOKEN, state: 'attached', timeoutMs: 90000 });
// The request is marked in the DOM first: an evaluate retried after a stalled bridge call
// waits for the original request instead of sending a second entry.
evaluate('n_shopify_submit', helpers + `
const draw = {{vars.travisShopifyDraw}};
const box = document.querySelector(${JSON.stringify(SHOPIFY_TURNSTILE)});
const card = document.querySelector(${JSON.stringify(SHOPIFY_DRAW)});
if (!box || card?.dataset.raffleId !== draw.releaseId) throw new Error('The storefront page changed before submitting; run again.');
const settle = async () => {
  for (let i = 0; i < 300 && box.dataset.scrollsState === 'sending'; i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (box.dataset.scrollsState !== 'done') throw new Error('The entry request did not finish; check the inbox before running this profile again.');
  return JSON.parse(box.dataset.scrollsResult);
};
let result;
if (box.dataset.scrollsState) result = await settle();
else {
  const token = box.querySelector('input[name="cf-turnstile-response"]')?.value || '';
  if (token.length < 10) throw new Error('Cloudflare verification returned no token.');
  box.dataset.scrollsState = 'sending';
  try {
    // Matches the storefront: SHA-256 of the reversed UTC minute (YYYY-MM-DDTHH:MM).
    const minute = new Date().toISOString().substring(0, 16).split('').reverse().join('');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(minute));
    const ref = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const body = { id: draw.releaseId, firstName: draw.fields.firstName, lastName: draw.fields.lastName, email: draw.fields.email, countryCode: 'US',
      tel: draw.fields.tel, size: draw.size, agreeTerms: true, enterNextRaffle: draw.enterNextRaffle, captcha: token, ref };
    const response = await fetch(draw.submitUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await response.text();
    let message = '';
    try { message = String(JSON.parse(text)?.message || ''); } catch {}
    result = { status: response.status, ok: response.ok, message: message.slice(0, 200) };
  } catch (error) {
    result = { status: 0, ok: false, message: String(error?.message || error).slice(0, 200) };
  }
  box.dataset.scrollsResult = JSON.stringify(result);
  box.dataset.scrollsState = 'done';
}
// Turnstile tokens are single-use. Keep the marker (hidden) so a retried call reads the result.
box.querySelector('.cf-turnstile')?.remove();
box.style.display = 'none';
if (!result.ok) throw new Error('The storefront rejected the entry (' + (result.status ? 'HTTP ' + result.status : 'network error') + (result.message ? ': ' + result.message : '') + ').');
if (result.message.toLowerCase() !== 'success') throw new Error('The storefront did not confirm the entry' + (result.message ? ': ' + result.message : '.'));
return { email: draw.fields.email, status: 'entered', site: 'shop.travisscott.com', releaseId: draw.releaseId, size: draw.size, entry: 'signup', enterNextRaffle: draw.enterNextRaffle };
`, 'travisOutcome', { linked: false });
edge('n_shopify_token_branch', 'true', 'n_shopify_submit');
edge('n_shopify_token_wait', 'next', 'n_shopify_submit');
node('n_shopify_save_entry', 'inventory.record', { site: '{{vars.travisOutcome.site}}', productLabel: '{{vars.travisShopifyDraw.label}}', status: 'entered', email: '{{vars.travisOutcome.email}}', productUrl: '{{inputs.url}}', cost: 0, currency: 'USD', metadata: '{{vars.travisOutcome}}', into: 'travisEntry' });
node('n_shopify_result', 'setResult', { value: '{{vars.travisOutcome}}' });

const DESCRIPTION = 'Browser entry for SuperSwipe draws on shop.travisscott.com and victorvictor.com, and the Travis Scott U.S. Shopify draws. Shopify draws: picks the colorway and size, passes Cloudflare verification on the storefront and submits the entry automatically with the profile name, email and U.S. phone; records it only when the store confirms. SuperSwipe draws: fills shipping, solves Turnstile through Key Vault and submits; optional card-on-file checkout.';
const URL_HINT = 'shop.travisscott.com or victorvictor.com. A password-protected store fails until the draw is live.';
const PRODUCT_HINT = 'Leave blank for a single draw. For Travis Scott Shopify draws with the same title, enter the exact colorway (for example WHITE) or Title — Colorway.';
const ENTER_ALL_HINT = 'Travis Scott Shopify draws only: also enters the other open draws on the page in the same size (the store\'s own "sign up for all" option).';
const CARD_HINT = 'Enter draws that keep a card on file through Shopify checkout. Nothing is due today; the store charges the card later only if you are selected. Stops if checkout shows any amount due today.';
const CARD_SOURCE_HINT = 'Address record card uses the card saved on each run\'s address (run from the Database; Scrolls 1.10.53+). Key Vault card uses one card for every run.';
const CARD_ID_HINT = 'Only for Key Vault card. Leave blank for the default Key Vault card.';
const CARD_SOURCES = [{ value: 'address', label: 'Address record card' }, { value: 'vault', label: 'Key Vault card' }];
const sizeInput = (id, label, defaultValue, equals) => ({ id, type: 'select', label, default: defaultValue, options: INPUT_SIZES,
  visibleWhen: { input: 'sizeMode', equals }, requiredWhen: { input: 'sizeMode', equals } });
const graph = {
  schemaVersion: 1, version: '0.8.0', metadata: {
    id: 'travis-scott-browser', name: 'SuperSwipe — Browser Entry', class: 'raffle', description: DESCRIPTION,
    tags: ['travis-scott', 'victor-victor', 'superswipe', 'browser', 'raffle'], inputs: [
      { id: 'url', label: 'Store / product URL', type: 'url', required: true, defaultValue: 'https://shop.travisscott.com/', hint: URL_HINT },
      { id: 'product', label: 'Exact product title', type: 'string', required: false, defaultValue: '', hint: PRODUCT_HINT },
      { id: 'sizeMode', label: 'Size selection', type: 'select', defaultValue: 'Single size', options: ['Single size', 'Size range', 'Random'], hint: 'Random chooses from available supported sizes. Size range chooses randomly within your inclusive bounds.' },
      { id: 'size', label: 'Size', type: 'select', required: true, defaultValue: '10.5', options: INPUT_SIZES, visibleWhen: { input: 'sizeMode', equals: 'Single size' } },
      { id: 'sizeMinimum', label: 'Minimum size', type: 'select', required: true, defaultValue: '8', options: INPUT_SIZES, visibleWhen: { input: 'sizeMode', equals: 'Size range' } },
      { id: 'sizeMaximum', label: 'Maximum size', type: 'select', required: true, defaultValue: '12', options: INPUT_SIZES, visibleWhen: { input: 'sizeMode', equals: 'Size range' } },
      { id: 'enterAllDraws', label: 'Enter all draws', type: 'boolean', defaultValue: false, hint: ENTER_ALL_HINT },
      { id: 'cardDraws', label: 'Card draws', type: 'boolean', defaultValue: false, hint: CARD_HINT },
      { id: 'cardSource', label: 'Card source', type: 'select', defaultValue: 'address', options: CARD_SOURCES.map(o => o.value), hint: CARD_SOURCE_HINT },
      { id: 'cardId', label: 'Key Vault card ID', type: 'string', required: false, defaultValue: '', hint: CARD_ID_HINT },
    ],
  }, permissions: ['browser', 'evaluate', 'captcha', 'inventory', 'vault'], variables: [], start: 'n_start', nodes, edges,
  runSchema: {
    schemaVersion: 1, kind: 'graph',
    module: { id: 'travis-scott-browser', name: 'SuperSwipe — Browser Entry', site: 'shop.travisscott.com', siteLabel: 'SuperSwipe', execution: 'browser' },
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
      { id: 'enterAllDraws', type: 'boolean', label: 'Enter all draws', default: false, hint: ENTER_ALL_HINT },
      { id: 'cardDraws', type: 'boolean', label: 'Card draws', default: false, hint: CARD_HINT },
      { id: 'cardSource', type: 'segmented', label: 'Card source', default: 'address', options: CARD_SOURCES.map(o => ({ ...o, hint: o.value === 'address' ? 'Each run uses its address record\'s saved card.' : 'Every run uses one Key Vault card.' })), hint: CARD_SOURCE_HINT },
      { id: 'cardId', type: 'text', label: 'Key Vault card ID', default: '', placeholder: 'Blank: default card', hint: CARD_ID_HINT, visibleWhen: { input: 'cardSource', equals: 'vault' } },
    ],
  },
};
const target = path.resolve(__dirname, '../tasks/travis-scott-browser.arcana-task.json');
fs.writeFileSync(target, JSON.stringify({ format: 'arcana-task/v1', exportedAt: '2026-11-24T00:00:00.000Z', graph }, null, 2) + '\n');
console.log(`Built ${nodes.length} browser flow nodes: ${target}`);
