// Test both block guards with the actual graph runtime and browser nodes.
// All content is a local fixture; there are no Ticketmaster requests.
// Usage: node scripts/test-tm-block-guard.cjs <app-dir> [chrome-exe]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appDir = path.resolve(process.argv[2]);
const dist = path.join(appDir, 'dist-electron');
const { chromium } = require(path.join(appDir, 'node_modules/playwright-core'));
const childRegistry = require.resolve(path.join(dist, 'child-registry.js'));
require.cache[childRegistry] = { id: childRegistry, filename: childRegistry, loaded: true, exports: { registerChild() { throw Error('fixture forbids child registration'); } } };
const { runGraph } = require(path.join(dist, 'graph-runtime.js'));
require(path.join(dist, 'graph-nodes-core.js'));
const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../tasks/tm.arcana-task.json'), 'utf8')).graph;
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div hidden>Access Denied</div><h1>Sign in</h1><input id="email-input">');
    assert(await page.locator('text=/Access Denied|browsing activity|Reference #/i').count(), 'old guard matches hidden block markup');
    for (const prefix of ['anti', 'anti2']) {
      const graph = structuredClone(original);
      graph.start = `n_${prefix}_check`;
      const ids = new Set([graph.start, `n_${prefix}_branch`, `n_${prefix}_evidence`, 'n_anti_fail']);
      graph.nodes = graph.nodes.filter(node => ids.has(node.id));
      graph.nodes.push({ id: 'passed', kind: 'noop', config: {}, position: { x: 0, y: 0 } });
      graph.edges = graph.edges.filter(edge => ids.has(edge.from)).map(edge => edge.fromPort === 'false' ? { ...edge, to: 'passed' } : edge);
      for (const node of graph.nodes) if (node.config.timeoutMs) node.config.timeoutMs = 100;
      for (const [name, html, blocked] of [
        ['normal sign-in', '<h1>Sign in</h1><input id="email-input">', false],
        ['hidden block template', '<div hidden>Access Denied</div><h1>Sign in</h1><input id="email-input">', false],
        ['script containing error copy', '<script type="application/json">{"error":"Access Denied"}</script><h1>Sign in</h1>', false],
        ['visible denial', '<h1>Access Denied</h1><p>Reference #fixture</p>', true],
        ['visible activity restriction', '<h1>Your browsing activity has been paused</h1>', true],
      ]) {
        await page.setContent(html);
        const context = { page, context: page.context(), profile: { id: 'fixture' }, inputs: {}, vars: new Map(), log() {}, signal: new AbortController().signal };
        if (blocked) {
          await assert.rejects(runGraph(graph, context), /Page evidence:.*(Access Denied|browsing activity)/);
          assert(context.vars.get('blockMessage').length, 'capture actual visible evidence');
        } else await runGraph(graph, context);
        console.log(`PASS ${prefix}: ${name}`);
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
