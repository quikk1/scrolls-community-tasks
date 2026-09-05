const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchGraph } = require('./build-oasis-details-fix.cjs');
const app = process.env.SCROLLS_APP_DIR || path.resolve(__dirname, '../../../scrolls-app/app');
const { runGraph, validateGraph } = require(path.join(app, 'dist-electron/graph-runtime'));
require(path.join(app, 'dist-electron/graph-nodes-core'));
const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../tasks/oasis.arcana-task.json'))).graph;
const patched = patchGraph(original);
async function main() {
  for (const start of ['n_entry_result', 'n_dup_end']) {
    // Execute only the success result; send nothing and open no browser.
    const nodes = patched.nodes.filter(n => n.id === start);
    const graph = { ...patched, start, variables: [], permissions: [], nodes,
      edges: patched.edges.filter(e => e.from === start) };
    assert.deepEqual(validateGraph(graph), []);
    const result = await runGraph(graph, {
      page: {}, context: {},
      profile: { id: 'offline-test', persona: { identity: { email: 'completed@example.test' } } },
      inputs: {}, vars: new Map(), signal: new AbortController().signal, log: () => {},
    });
    assert.deepEqual(result, { email: 'completed@example.test', site: 'oasis.os.fan', status: 'entered', suppressSuccessWebhook: true });
  }
  assert.equal(patched.nodes.find(n => n.id === 'n_pre_fail').kind, 'fail');
  assert.ok(!patched.edges.some(e => e.from === 'n_pre_fail'), 'duplicate precheck cannot reach the success result');
  console.log('PASS both confirmed-success exits return email, site and status; no browser, messages or submissions');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
