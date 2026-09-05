// Build an unsigned, locally importable Scrolls browser graph from reviewed DOM selectors.
// The HAR is reference material only; no captured cookies, tokens or contact data are used.
const fs = require('node:fs');
const path = require('node:path');
const SIZES = ['3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '14', '15'];
const nodes = [];
const edges = [];
function node(id, kind, config) {
  if (nodes.length) edges.push({ id: `e_${edges.length}`, from: nodes.at(-1).id, fromPort: 'next', to: id });
  nodes.push({ id, kind, position: { x: 160, y: nodes.length * 140 }, config });
}
function evaluate(id, script, into) { node(id, 'evaluate', { script, into }); }
const helpers = `
const visible = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const norm = value => String(value || '').trim().replace(/\\s+/g, ' ').toLowerCase();
const dialog = () => document.querySelector('[data-scrolls-travis-dialog="active"]');
`;
function acceptCookies(id, timeoutMs = 0) {
  evaluate(id, helpers + `
const timeoutMs = ${timeoutMs};
const deadline = Date.now() + timeoutMs;
do {
  const button = document.querySelector('#cookiebanner a.c-button');
  if (visible(button) && norm(button.textContent) === 'ok') { button.click(); return true; }
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
const url = new URL(settings.url);
if (url.protocol !== 'https:' || url.hostname !== 'shop.travisscott.com' || url.username || url.password)
  throw new Error('Use an HTTPS URL on shop.travisscott.com.');
if (!String(settings.product || '').trim()) throw new Error('Enter the exact product title before running.');
const allowedSizes = ${JSON.stringify(SIZES)};
const mode = settings.sizeMode || 'Single size';
if (!['Single size', 'Size range', 'Random'].includes(mode)) throw new Error('Choose Single size, Size range or Random.');
if (mode === 'Single size' && !allowedSizes.includes(String(settings.size))) throw new Error('Choose a size from the supported size list.');
if (mode === 'Size range' && (!allowedSizes.includes(String(settings.sizeMinimum)) || !allowedSizes.includes(String(settings.sizeMaximum)) || Number(settings.sizeMinimum) > Number(settings.sizeMaximum)))
  throw new Error('Choose a valid size range with minimum no greater than maximum.');
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
node('n_wait_products', 'waitFor', { selector: '.superswipe-block .superswipe-button', state: 'attached', timeoutMs: 60000 });
evaluate('n_find_product', helpers + `
const settings = {{vars.travisSettings}};
const matches = [...document.querySelectorAll('.superswipe-block')].filter(block => {
  try { return norm(JSON.parse(block.querySelector('[data-superswipe-config]').textContent).title) === norm(settings.product); }
  catch { return false; }
});
if (matches.length !== 1) throw new Error('Expected one exact product match; found ' + matches.length + '. Check the product title.');
const block = matches[0];
if (block.dataset.releaseMode !== 'pay_after') throw new Error('This module supports no-payment entry draws only.');
const variants = JSON.parse(block.querySelector('[data-superswipe-variants]').textContent);
const allowedSizes = ${JSON.stringify(SIZES)};
const mode = settings.sizeMode || 'Single size';
const sizes = variants.filter(v => v.available !== false && allowedSizes.includes(String(v.title)) && (
  mode === 'Single size' ? String(v.title) === String(settings.size) :
  mode === 'Size range' ? Number(v.title) >= Number(settings.sizeMinimum) && Number(v.title) <= Number(settings.sizeMaximum) : true
));
if (!sizes.length || (mode === 'Single size' && sizes.length !== 1)) throw new Error('Requested size is missing or unavailable; no sizes match the selection.');
const variant = sizes[mode === 'Single size' ? 0 : Math.floor(Math.random() * sizes.length)];
if (!/^\\d+$/.test(String(variant.id))) throw new Error('Invalid product variant.');
document.querySelectorAll('[data-scrolls-travis-product]').forEach(el => el.removeAttribute('data-scrolls-travis-product'));
block.setAttribute('data-scrolls-travis-product', 'active');
return { title: JSON.parse(block.querySelector('[data-superswipe-config]').textContent).title,
  releaseId: block.dataset.superswipeLaunchId, variantId: String(variant.id), size: variant.title };
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
modal.setAttribute('data-scrolls-travis-dialog', 'active');
return true;
`, 'travisDialogReady');
acceptCookies('n_cookies_before_size');
node('n_size', 'click', { selector: '[data-scrolls-travis-dialog="active"] .superswipe-size-chip[data-variant-id="{{vars.travisProduct.variantId}}"]', instant: true, timeoutMs: 30000 });
evaluate('n_verify_size', `
const selected = document.querySelector('[data-scrolls-travis-dialog="active"] .superswipe-size-chip[aria-checked="true"]');
const product = {{vars.travisProduct}};
if (!selected || selected.dataset.variantId !== product.variantId) throw new Error('The requested size was not selected.');
return true;
`, 'travisSizeReady');
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
const selected = modal.querySelector('.superswipe-size-chip[aria-checked="true"]');
if (!selected || selected.dataset.variantId !== product.variantId) throw new Error('Size changed during entry; review the confirmation manually.');
return { email: actual, status: 'entered', releaseId: product.releaseId, variantId: product.variantId, size: product.size };
`, 'travisOutcome');
node('n_save_entry', 'inventory.record', { site: 'shop.travisscott.com', productLabel: '{{vars.travisProduct.title}}', status: 'entered', email: '{{vars.travisOutcome.email}}', productUrl: '{{inputs.url}}', cost: 0, currency: 'USD', metadata: '{{vars.travisOutcome}}', into: 'travisEntry' });
node('n_result', 'setResult', { value: '{{vars.travisOutcome}}' });
const graph = {
  schemaVersion: 1, version: '0.3.3', metadata: {
    id: 'travis-scott-browser', name: 'Travis Scott — Browser Entry', class: 'raffle',
    description: 'Oasis-style browser flow for SuperSwipe no-payment draws. Selects your size, accepts the cookie banner, checks five draw acknowledgments individually with randomized pauses, fills and verifies shipping details, solves Turnstile through Key Vault and submits. Acknowledgments include terms, privacy and Email/SMS communications. Saves only a visible entry confirmation. Requires Scrolls 1.6.0 or newer.',
    tags: ['travis-scott', 'superswipe', 'browser', 'raffle'], inputs: [
      { id: 'url', label: 'Store / product URL', type: 'url', required: true, defaultValue: 'https://shop.travisscott.com/' },
      { id: 'product', label: 'Exact product title', type: 'string', required: true, defaultValue: "AIR FORCE 1 '07 LOW CACTUS JACK" },
      { id: 'sizeMode', label: 'Size selection', type: 'select', defaultValue: 'Single size', options: ['Single size', 'Size range', 'Random'], hint: 'Random chooses from available supported sizes. Size range chooses randomly within your inclusive bounds.' },
      { id: 'size', label: 'Size', type: 'select', required: true, defaultValue: '10.5', options: SIZES, visibleWhen: { input: 'sizeMode', equals: 'Single size' } },
      { id: 'sizeMinimum', label: 'Minimum size', type: 'select', required: true, defaultValue: '8', options: SIZES, visibleWhen: { input: 'sizeMode', equals: 'Size range' } },
      { id: 'sizeMaximum', label: 'Maximum size', type: 'select', required: true, defaultValue: '12', options: SIZES, visibleWhen: { input: 'sizeMode', equals: 'Size range' } },
    ],
  }, permissions: ['browser', 'evaluate', 'captcha', 'inventory'], variables: [], start: 'n_start', nodes, edges,
};
const target = path.resolve(__dirname, '../tasks/travis-scott-browser.arcana-task.json');
fs.writeFileSync(target, JSON.stringify({ format: 'arcana-task/v1', exportedAt: '2026-09-04T00:00:00.000Z', graph }, null, 2) + '\n');
console.log(`Built ${nodes.length} browser flow nodes: ${target}`);
