// Offline integration tests: the real Scrolls graph runtime and browser nodes,
// with a synthetic storefront and an in-memory inventory sink. No live entries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(process.env.SCROLLS_APP_DIR || path.join(__dirname, '../../scrolls-app/app'));
const { chromium } = require(path.join(app, 'node_modules/playwright-core'));
const { runGraph, registerNode, validateGraph, requiredPermissions } = require(path.join(app, 'dist-electron/graph-runtime'));
require(path.join(app, 'dist-electron/graph-nodes-core'));
const recorded = [];
const { solveSuperswipeTurnstile } = require(path.join(app, 'dist-electron/browser-turnstile'));
let solverCalls = [];
let currentOptions = {};
let currentController;
registerNode({ kind: 'captcha.solveTurnstile', permissions: ['captcha', 'browser'], execute: async ({ config, resolve, task }) => {
  const c = resolve(config);
  const result = await solveSuperswipeTurnstile({ page: task.page, frameSelector: c.frameSelector, timeoutMs: 1500, signal: task.signal,
    solve: async challenge => {
      solverCalls.push(challenge);
      assert.equal(challenge.siteKey, '0xOFFLINE_TEST_SITEKEY');
      assert.equal(challenge.url, 'https://captcha.superswipe.com/?o=https%3A%2F%2Fshop.travisscott.com');
      if (currentOptions.providerFailure) throw new Error('Mock provider failure');
      if (currentOptions.cancel) {
        currentController.abort();
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (currentOptions.replaceFrame) await task.page.locator(c.frameSelector).evaluate(el => el.replaceWith(el.cloneNode()));
      return { token: 'offline-test-token-not-real', provider: 'capsolver', elapsedMs: 1 };
    },
  });
  return { setVars: { [c.into]: result } };
} });
registerNode({ kind: 'inventory.record', permissions: ['inventory'], execute: async ({ config, resolve }) => {
  recorded.push(resolve(config)); return {};
} });
const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '../tasks/travis-scott-browser.arcana-task.json'))).graph;
assert.deepEqual(validateGraph(graph), []);
assert.deepEqual(requiredPermissions(graph), [...graph.permissions].sort());
const product = "AIR FORCE 1 '07 LOW CACTUS JACK";
function fixture({ mode = 'pay_after', stale = false, hiddenRegion = false, closed = false, statusDelay = 0, hiddenButton = false, noSuccess = false, rejectEntry = false, unavailableNine = false, termsCount = 5, precheckedTerms = false, disabledTerms = false, rejectTerms = false, stateSelect = false, phonePrefix = false, cookie = '', rejectField = false } = {}) {
  const blocks = ['OTHER PRODUCT', product].map((title, i) => `
    <section class="superswipe-block" data-release-mode="${mode}" data-superswipe-launch-id="release-${i}">
      <script type="application/json" data-superswipe-config>${JSON.stringify({ title })}</script>
      <script type="application/json" data-superswipe-variants>${JSON.stringify([{ id: 101 + i * 100, title: '9', available: !unavailableNine }, { id: 102 + i * 100, title: '10.5', available: true }, { id: 103 + i * 100, title: '13.5', available: true }])}</script>
      <button class="superswipe-button" ${(closed || statusDelay) && i === 1 ? 'disabled' : ''} ${hiddenButton && i === 1 ? 'hidden' : ''}>${title}</button>
    </section>`).join('');
  return `<!doctype html><style>[hidden]{display:none!important} .superswipe-modal{border:1px solid;padding:15px}input,select{display:block;margin:4px}</style>${blocks}
  <script>
    function showCookie() {
      const banner = document.createElement('div');banner.id='cookiebanner';
      banner.style='position:fixed;inset:0;z-index:9999;background:#3338';
      banner.innerHTML='<a class="c-button" href="#">OK</a>';
      banner.querySelector('a').onclick=e=>{e.preventDefault();banner.remove();document.body.dataset.cookieAccepted='true'};
      document.body.append(banner);
    }
    if (${JSON.stringify(cookie)} === 'early') showCookie();
    for (const [i, block] of [...document.querySelectorAll('.superswipe-block')].entries()) {
      const modal = document.createElement('div'); modal.className='superswipe-modal'; modal.hidden=true; modal.setAttribute('aria-hidden','true');
      modal.innerHTML = '<div class="superswipe-product"></div>' +
        '<button class="superswipe-size-chip" data-variant-id="'+(101+i*100)+'" aria-checked="true">9</button>' +
        '<button class="superswipe-size-chip" data-variant-id="'+(102+i*100)+'" aria-checked="false">10.5</button>' +
        '<div class="superswipe-terms-accept">' + Array.from({length:${termsCount}}, (_, t) => '<label><input type="checkbox" class="superswipe-checkbox" '+(${precheckedTerms} && t % 2 === 0 ? 'checked' : '')+' '+(${disabledTerms} && t === 4 ? 'disabled' : '')+'>Acknowledgment '+t+'</label>').join('') + '</div><button class="superswipe-continue-button" disabled>Continue</button>' +
        '<div class="superswipe-entry-form" hidden>' +
        ['first_name','last_name','email','phone','address1','address2','city','state','zip'].map(name => '<label '+(${hiddenRegion} && ['state','zip'].includes(name)?'hidden':'')+'>'+name+'<input name="'+name+'"></label>').join('') +
        '<select name="country"><option value="US">United States</option><option value="HK">Hong Kong</option></select><div class="superswipe-turnstile"></div><button class="superswipe-entry-submit">Enter draw</button></div>' +
        '<div class="superswipe-entry-success" hidden>You&#39;re entered!</div><div class="superswipe-message"></div>';
      modal.querySelector('.superswipe-product').textContent = JSON.parse(block.querySelector('[data-superswipe-config]').textContent).title;
      document.body.append(modal); // The real site also detaches dialogs from blocks.
      if (${stateSelect}) {
        const select=document.createElement('select');select.name='state';select.innerHTML='<option value="">Select</option><option value="AZ">Arizona</option>';
        modal.querySelector('input[name="state"]').replaceWith(select);
      }
      if (${phonePrefix}) {
        const prefix=document.createElement('span');prefix.setAttribute('data-pa-phone-prefix','');prefix.textContent='+1';modal.querySelector('input[name="phone"]').before(prefix);
      }
      if (${rejectField}) modal.querySelector('input[name="address1"]').oninput=e=>{e.target.value=''};
      if (${stale}) modal.querySelector('.superswipe-entry-success').hidden=false;
      block.querySelector('button').onclick=()=>{modal.hidden=false;modal.setAttribute('aria-hidden','false')};
      if (i === 1 && ${statusDelay} && !${closed}) setTimeout(() => {
        block.querySelector('button').disabled=false;
        block.querySelector('button').hidden=false;
      }, ${statusDelay});
      modal.querySelectorAll('.superswipe-size-chip').forEach(chip=>chip.onclick=()=>modal.querySelectorAll('.superswipe-size-chip').forEach(c=>c.setAttribute('aria-checked',String(c===chip))));
      modal.querySelectorAll('.superswipe-checkbox').forEach(box => box.onchange=e=>{
        modal.dataset.termTimes=JSON.stringify([...JSON.parse(modal.dataset.termTimes || '[]'),performance.now()]);
        if (${rejectTerms}) e.target.checked=false;
        modal.querySelector('.superswipe-continue-button').disabled=![...modal.querySelectorAll('.superswipe-checkbox')].every(cb=>cb.checked);
      });
      let token=''; let frame;
      modal.querySelector('.superswipe-continue-button').onclick=()=>{
        if (${JSON.stringify(cookie)} === 'late') showCookie();
        modal.querySelector('.superswipe-entry-form').hidden=false;
        frame=document.createElement('iframe');frame.src='https://captcha.superswipe.com/?o='+encodeURIComponent(location.origin);modal.querySelector('.superswipe-turnstile').append(frame);
      };
      window.addEventListener('message',e=>{if(e.origin==='https://captcha.superswipe.com' && e.source===frame?.contentWindow && e.data?.source==='superswipe-turnstile' && e.data.type==='token') token=e.data.token;});
      modal.querySelector('.superswipe-entry-submit').onclick=()=>{
        if (${rejectEntry}) { const message=modal.querySelector('.superswipe-message');message.className+=' is-visible is-error';message.textContent='Verification failed. Please retry the challenge.';return; }
        if(token==='offline-test-token-not-real' && !${noSuccess}) {modal.querySelector('.superswipe-entry-form').hidden=true;modal.querySelector('.superswipe-entry-success').hidden=false}
      };
    }
  </script>`;
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    async function scenario(name, options = {}) {
      recorded.length = 0;
      solverCalls = [];
      currentOptions = options;
      currentController = new AbortController();
      const context = await browser.newContext();
      await context.route('**/*', route => route.request().url() === 'https://shop.travisscott.com/'
        ? route.fulfill({ contentType: 'text/html', body: fixture(options) })
        : route.request().url().startsWith('https://captcha.superswipe.com/')
          ? route.fulfill({ contentType: 'text/html', body: '<div>Offline verification</div>' + (options.noSiteKey ? '' : '<script type="text/plain">turnstile.render("#w",{sitekey:"0xOFFLINE_TEST_SITEKEY"})</script>') }) : route.abort());
      const page = await context.newPage();
      const g = structuredClone(graph);
      for (const n of g.nodes) {
        if (['click', 'fill'].includes(n.kind) && !options.naturalInput) n.config.instant = true;
        if (n.kind === 'dwell' && !options.naturalInput) n.config = { ms: 1 };
        if (n.id === 'n_cookies_before_draw' && !options.naturalInput) n.config.script = n.config.script.replace('const timeoutMs = 4500;', 'const timeoutMs = 20;');
        if (n.config.timeoutMs) n.config.timeoutMs = 1500;
      }
      const address = { isDefault: true, firstName: 'Jane', lastName: "O'Neil", country: options.hiddenRegion ? 'HK' : 'US', street1: '123 Example St', street2: '', city: 'Test City', state: options.hiddenRegion ? '' : options.stateName || 'AZ', postalCode: options.hiddenRegion ? '' : '85001', phone: '+16025550123' };
      const vars = new Map();
      const actions = [];
      const ctx = { page, context, profile: { id: 'offline-profile', name: 'Offline', persona: {
        identity: { email: 'jane@example.com', firstName: 'Jane', lastName: "O'Neil", phone: address.phone },
        addresses: options.noAddress ? [] : [address],
      } }, inputs: { url: options.url || 'https://shop.travisscott.com/', product, size: options.size || '10.5', sizeMode: options.sizeMode || 'Single size', sizeMinimum: options.sizeMinimum || '8', sizeMaximum: options.sizeMaximum || '12' }, vars, signal: currentController.signal,
        log: () => {}, onNodeEnter: (id) => {
          const active = '[data-scrolls-travis-dialog="active"]';
          if (id === 'n_wait_terms') actions.push((async () => {
            assert.equal(await page.locator(active + ' .superswipe-checkbox:checked').count(), 5);
            assert.equal(await page.locator('.superswipe-modal').first().locator('.superswipe-checkbox:checked').count(), options.precheckedTerms ? 3 : 0);
            if (options.naturalInput) {
              const times=JSON.parse(await page.locator(active).getAttribute('data-term-times'));
              assert.equal(times.length, 5);
              assert.ok(times.slice(1).every((time,i)=>time-times[i]>=30), 'Each checkbox must have its own pause');
            }
          })());
          if (id === 'n_solve_turnstile') actions.push((async () => {
            assert.equal(await page.locator(active + ' input[name="last_name"]').inputValue(), "O'Neil");
            assert.equal(await page.locator(active + ' input[name="address2"]').inputValue(), '');
            assert.equal(await page.locator(active + ' select[name="country"]').inputValue(), address.country);
            if (options.stateSelect) assert.equal(await page.locator(active + ' select[name="state"]').inputValue(), 'AZ');
            if (options.phonePrefix) assert.equal(await page.locator(active + ' input[name="phone"]').inputValue(), '6025550123');
            if (options.cookie) assert.equal(await page.locator('body').getAttribute('data-cookie-accepted'), 'true');
            assert.equal(await page.locator('.superswipe-modal').first().getAttribute('aria-hidden'), 'true');
          })());
        },
      };
      try {
        let error;
        try { await runGraph(g, ctx); } catch (e) { error = e; }
        await Promise.all(actions);
        if (options.error) {
          assert.ok(error, name + ' must fail'); assert.match(error.message, options.error); assert.equal(recorded.length, 0);
        } else {
          if (error) throw error;
          assert.equal(recorded.length, 1); assert.equal(recorded[0].productLabel, product);
          assert.equal(recorded[0].email, 'jane@example.com');
          assert.ok((options.expectedVariants || ['202']).includes(recorded[0].metadata.variantId)); assert.equal(recorded[0].metadata.releaseId, 'release-1');
          assert.equal(vars.get('_result').status, 'entered');
          assert.equal(solverCalls.length, 1);
          assert.deepEqual(vars.get('travisTurnstile'), { provider: 'capsolver', elapsedMs: 1 });
        }
        console.log('PASS ' + name);
      } finally { await context.close(); }
    }
    await scenario('Correct detached dialog, exact size, quoted name, blank optional address and confirmed inventory');
    await scenario('State dropdown and separate phone prefix', { stateSelect: true, phonePrefix: true });
    await scenario('State dropdown matches full state name', { stateSelect: true, stateName: 'Arizona' });
    await scenario('Invalid state fails before solving', { stateSelect: true, stateName: 'Invalid', error: /does not match an available option/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Cookie banner before opening the draw', { cookie: 'early' });
    await scenario('Cookie banner appearing on the address page', { cookie: 'late' });
    await scenario('Blank rejected field prevents CAPTCHA and submission', { rejectField: true, error: /not filled correctly: address1/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Production input settings and individually delayed boxes', { naturalInput: true, stateSelect: true, phonePrefix: true, cookie: 'late' });
    await scenario('Already checked acknowledgments stay checked', { precheckedTerms: true });
    await scenario('Missing acknowledgment fails before solving', { termsCount: 4, error: /Expected five draw acknowledgment boxes/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Disabled acknowledgment fails before solving', { disabledTerms: true, error: /disabled the draw acknowledgment/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Rejected checkbox change fails before solving', { rejectTerms: true, error: /did not keep all draw acknowledgment/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Hidden country-specific state/postal fields', { hiddenRegion: true });
    await scenario('Missing size never falls back', { size: '15', error: /size is missing/ });
    await scenario('Delayed status check waits for selected product despite another enabled draw', { statusDelay: 500 });
    await scenario('Initially hidden button becomes visible after status check', { statusDelay: 500, hiddenButton: true });
    await scenario('Closed selected draw times out despite another enabled draw', { closed: true, error: /Timeout/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Status check that never finishes times out without solving', { statusDelay: 10000, error: /Timeout/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Payment-required draw', { mode: 'pay_now', error: /no-payment/ });
    await scenario('Missing shipping profile', { noAddress: true, error: /shipping address/ });
    await scenario('Stale prior entry never records a new entry', { stale: true, error: /already shows an entry/ });
    await scenario('No confirmed submission never records inventory', { noSuccess: true, error: /Timeout/ });
    await scenario('Unexpected store URL', { url: 'https://example.com/', error: /HTTPS URL/ });
    await scenario('Missing widget key avoids a paid solver call', { noSiteKey: true, error: /one Turnstile site key/ });
    assert.equal(solverCalls.length, 0);
    await scenario('Provider error prevents submission', { providerFailure: true, error: /Mock provider failure/ });
    await scenario('Cancellation discards late solver tokens', { cancel: true, error: /aborted/ });
    await scenario('Replaced verification frame rejects the token', { replaceFrame: true, error: /Verification frame changed/ });
    await scenario('Site rejection is reported and not recorded', { rejectEntry: true, error: /Entry rejected by the site: Verification failed/ });
    await scenario('Individual size 9', { size: '9', expectedVariants: ['201'] });
    await scenario('Range picks only sizes inside inclusive bounds', { sizeMode: 'Size range', sizeMinimum: '10', sizeMaximum: '11' });
    await scenario('Range includes both endpoints', { sizeMode: 'Size range', sizeMinimum: '9', sizeMaximum: '10.5', expectedVariants: ['201', '202'] });
    await scenario('Random picks from the supported available sizes', { sizeMode: 'Random', expectedVariants: ['201', '202'] });
    await scenario('Random excludes unavailable and unsupported sizes', { sizeMode: 'Random', unavailableNine: true });
    await scenario('Reversed range fails before entry', { sizeMode: 'Size range', sizeMinimum: '12', sizeMaximum: '8', error: /valid size range/ });
    await scenario('Empty available range fails without fallback', { sizeMode: 'Size range', sizeMinimum: '14', sizeMaximum: '15', error: /no sizes match/ });
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
