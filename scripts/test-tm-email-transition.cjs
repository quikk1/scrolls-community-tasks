// Offline control-flow regression. Uses the app's actual graph interpreter;
// browser and inbox operations are fixtures and never contact a live service.
// Usage: node scripts/test-tm-email-transition.cjs <app/dist-electron/graph-runtime.js>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerNode, runGraph, validateGraph } = require(path.resolve(process.argv[2]));
const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../tasks/tm.arcana-task.json'), 'utf8')).graph;
let scenario;
for (const kind of new Set(original.nodes.map(node => node.kind))) {
  registerNode({ kind, execute: async ({ task, config }) => {
    scenario.events.push(kind);
    if (kind === 'tryCatch') return { tryCatch: true };
    if (kind === 'click') {
      scenario.clicks++;
      if (scenario.clicks === 1 && scenario.mode === 'cancel') {
        scenario.controller.abort();
        throw new Error('aborted');
      }
      if (scenario.clicks === 1 && scenario.mode === 'click-error') throw new Error('click timeout');
      if (scenario.mode === 'success' || scenario.clicks > 1 && scenario.mode !== 'stuck') scenario.otpVisible = true;
    }
    if (kind === 'goto') scenario.reloads++;
    if (kind === 'waitFor' && config.selector === 'input#otp-input-input' && !scenario.otpVisible) throw new Error('OTP form did not open');
    if (kind === 'imap.waitForMessage') {
      assert.equal(scenario.otpVisible, true, 'must open OTP form before waiting for email');
      scenario.inbox++;
    }
    return {};
  } });
}
assert.deepEqual(validateGraph(original), []);
// Exercise only the email transition using the source graph's exact nodes and
// edges, ending at the inbox. Earlier signup and later SMS nodes cannot run.
const graph = structuredClone(original);
graph.start = 'n_ve_tc';
graph.edges = graph.edges.filter(edge => edge.from !== 'n_hsne8h0q');
(async () => {
  for (const mode of ['success', 'silent-click', 'click-error', 'stuck', 'cancel']) {
    scenario = { mode, controller: new AbortController(), events: [], clicks: 0, reloads: 0, inbox: 0, otpVisible: false };
    const context = { page: {}, context: {}, profile: { id: 'fixture' }, inputs: {}, vars: new Map(), log() {}, signal: scenario.controller.signal };
    const execute = () => runGraph(graph, context);
    if (mode === 'stuck') await assert.rejects(execute, /OTP form did not open/);
    else if (mode === 'cancel') await assert.rejects(execute, /aborted/);
    else await execute();
    assert.equal(scenario.reloads, ['silent-click', 'click-error', 'stuck'].includes(mode) ? 1 : 0, mode);
    assert.equal(scenario.inbox, ['stuck', 'cancel'].includes(mode) ? 0 : 1, mode);
    console.log(`PASS ${mode}`);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
