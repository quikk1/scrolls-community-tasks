// Exercise the source graph's bounded resend/cancel routing with the real
// interpreter and browser/control nodes. SMS responses are offline fixtures.
// Usage: node scripts/test-tm-sms-recovery.cjs <app-dir>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dist = path.join(path.resolve(process.argv[2]), 'dist-electron');
const childRegistry = require.resolve(path.join(dist, 'child-registry.js'));
require.cache[childRegistry] = { id: childRegistry, filename: childRegistry, loaded: true, exports: { registerChild() { throw Error('fixture forbids children'); } } };
const { runGraph, registerNode } = require(path.join(dist, 'graph-runtime.js'));
require(path.join(dist, 'graph-nodes-core.js'));
const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../tasks/tm.arcana-task.json'), 'utf8')).graph;
let state;
registerNode({ kind: 'sms.waitForCode', execute: async () => {
  state.waits++;
  if (state.mode === 'abort') { state.controller.abort(); throw Error('aborted'); }
  if (state.mode === 'provider-error') throw Error('SMS key rejected');
  if (state.mode !== 'first-success' && (state.waits === 1 || state.mode === 'two-timeouts')) throw Error('sms.waitForCode: timeout after 180000ms');
  return { setVars: { smsCode: 'fixture-code' } };
} });
registerNode({ kind: 'sms.cancel', execute: async () => { state.cancelled++; return {}; } });
registerNode({ kind: 'sms.finish', execute: async () => { state.finished++; return {}; } });
const ids = new Set(['n_smswrap', 'n_sms_otp_ready', 'n_sms_wait_tc', 'n_npssvess', 'n_sms_resend_branch', 'n_sms_resend_log', 'n_sms_resend', 'n_sms_wait_retry', 'n_sms_wait_error', 'n_7gln5co0', 'n_smscancel', 'n_sms_evidence', 'n_smsfailcatch', 'n_smsfinish']);
const graph = structuredClone(original);
graph.start = 'n_smswrap';
graph.nodes = graph.nodes.filter(node => ids.has(node.id));
graph.nodes.find(node=>node.id==='n_7gln5co0').kind = 'noop';
graph.edges = graph.edges.filter(edge=>ids.has(edge.from) && ids.has(edge.to));
graph.edges.push({ id:'fixture_body', from:'n_smswrap', fromPort:'loop', to:'n_sms_otp_ready' }, { id:'fixture_done', from:'n_7gln5co0', fromPort:'next', to:'n_smswrap' });
(async () => {
  for (const mode of ['first-success', 'resend-success', 'two-timeouts', 'provider-error', 'resend-unavailable', 'abort']) {
    state = { mode, waits:0, resends:0, cancelled:0, finished:0, controller:new AbortController() };
    const page = { waitForSelector:async () => ({ boundingBox:async()=>null }), locator:() => ({ allTextContents:async () => ['', 'fixture phone rejected'] }), click:async () => { state.resends++; if(mode==='resend-unavailable') throw Error('resend control unavailable'); } };
    const context = { page, profile:{id:'fixture'}, inputs:{}, vars:new Map([['phoneRent',{provider:'fixture',activationId:'fixture'}]]), log(){}, signal:state.controller.signal };
    if (['first-success','resend-success'].includes(mode)) {
      await runGraph(graph,context);
      assert.equal(context.vars.get('smsCode'),'fixture-code');
      assert.equal(state.finished,1);
      assert.equal(state.cancelled,0);
    } else {
      await assert.rejects(runGraph(graph,context), mode==='abort' ? /aborted/ : /showed: .*fixture phone rejected.*Cause:.*(timeout|SMS key rejected|resend control unavailable)/);
      assert.equal(state.cancelled,mode==='abort'?0:1);
      assert.equal(state.finished,0);
    }
    assert.equal(state.resends,['resend-success','two-timeouts','resend-unavailable'].includes(mode)?1:0);
    assert(state.waits<=2,'at most two waits and one resend per rental');
    console.log(`PASS ${mode}`);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
