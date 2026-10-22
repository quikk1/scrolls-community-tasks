// Real browser + app graph-node implementations, on a local fixture only.
// Usage: node scripts/test-tm-phone-country.cjs <app-dir> [chrome-exe]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appDir = path.resolve(process.argv[2]);
const dist = path.join(appDir, 'dist-electron');
const { chromium } = require(path.join(appDir, 'node_modules/playwright-core'));
// These graph paths must never start a process or invoke a service.
const childRegistry = require.resolve(path.join(dist, 'child-registry.js'));
require.cache[childRegistry] = { id: childRegistry, filename: childRegistry, loaded: true, exports: { registerChild() { throw Error('fixture forbids child registration'); } } };
const { runGraph, registerNode } = require(path.join(dist, 'graph-runtime.js'));
require(path.join(dist, 'graph-nodes-core.js'));
const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../tasks/tm.arcana-task.json'), 'utf8')).graph;
let rentals = 0;
registerNode({ kind: 'sms.rent', execute: async () => { rentals++; return {}; } });
const graph = structuredClone(original);
graph.start = 'n_phone_cc_us_ca';
graph.nodes = graph.nodes.filter(node => node.id.startsWith('n_phone_') || node.id === 'n_t44xz7he');
const ids = new Set(graph.nodes.map(node => node.id));
graph.edges = graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to) && edge.from !== 'n_t44xz7he');
for (const node of graph.nodes) if (node.config.timeoutMs) node.config.timeoutMs = 500;
const fixture = `<!doctype html><html><body>
  <span hidden>Other</span><span hidden>Canada</span>
  <div role="dialog"><label>Phone Number <input type="tel"></label>
    <button aria-haspopup="listbox" aria-expanded="false">United States +1</button>
  </div>
  <!-- The real widget portals its list outside the phone dialog. -->
  <div role="listbox" hidden><input placeholder="Dial code">
    <div role="option">United States +1</div><div role="option">Canada +1</div><div role="option">Other +</div>
  </div>
  <script>(() => {
    const toggle = document.querySelector('button');
    const menu = document.querySelector('[role=listbox]');
    toggle.onclick = () => { toggle.setAttribute('aria-expanded', 'true'); menu.hidden = false; };
    document.querySelectorAll('[role=option]').forEach(option => option.onclick = () => {
      if (location.hash === '#stuck') return;
      toggle.textContent = option.textContent; toggle.setAttribute('aria-expanded', 'false'); menu.hidden = true;
    });
  })();</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(fixture);
    await page.locator('button').click();
    await assert.rejects(page.waitForSelector('text=Other', { state: 'visible', timeout: 150 }), /Timeout/);
    console.log('PASS old text=Other selector can stall on a hidden duplicate');
    for (const [region, expected, stuck] of [['US', 'United States +1'], ['CA', 'Canada +1'], ['AR', 'Other +'], ['AR', null, true]]) {
      await page.setContent(fixture);
      await page.evaluate(stuck => { location.hash = stuck ? 'stuck' : ''; }, !!stuck);
      const logs = [];
      rentals = 0;
      const context = { page, context: page.context(), profile: { id: 'fixture' }, inputs: { smsRegion: region }, vars: new Map(), log: (_, text) => logs.push(text), signal: new AbortController().signal };
      if (stuck) {
        await assert.rejects(runGraph(graph, context), /Timeout/);
        assert.equal(rentals, 0, 'never rent before country selection is confirmed');
      } else {
        try { await runGraph(graph, context); }
        catch (error) {
          console.error(JSON.stringify({ region, logs, dom: await page.locator('body').innerHTML() }));
          throw error;
        }
        assert.equal(await page.locator('button').innerText(), expected);
        assert.equal(rentals, 1);
      }
      if (region !== 'US') assert(logs.some(text => text.includes('visible options: ["United States +1","Canada +1","Other +"]')));
      console.log(`PASS ${region}${stuck ? ' failed selection blocks rental' : ' selection and rental ordering'}`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
