// "Not Right Now" hands off to identity /exchange, which sets id-token and
// redirects to www. The graph must wait for that redirect instead of cancelling
// it with its own navigation.
// Usage: node scripts/test-tm-exchange-race.cjs <app-dir>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appDir = path.resolve(process.argv[2]);
const dist = path.join(appDir, 'dist-electron');
const { chromium } = require(path.join(appDir, 'node_modules/playwright-core'));
const childRegistry = require.resolve(path.join(dist, 'child-registry.js'));
require.cache[childRegistry] = { id:childRegistry, filename:childRegistry, loaded:true, exports:{registerChild(){throw Error('fixture forbids children');}} };
const { runGraph, registerNode } = require(path.join(dist,'graph-runtime.js'));
require(path.join(dist,'graph-nodes-core.js'));
let saves;
registerNode({kind:'accounts.save', execute:async ({config,resolve})=>{saves.push(resolve(config));return {};}});
const graph = JSON.parse(fs.readFileSync(path.join(__dirname,'../tasks/tm.arcana-task.json'),'utf8')).graph;
graph.start='n_p39zycof';
const ids=new Set(['n_p39zycof','n_pk_tc','n_n5bxd4po','n_home_tc','n_home_wait','n_glvj5zbl','n_oxam0g94','n_xqa6szaz','n_3p7ytqzv','n_gpectape','n_saved_log','n_dw22rs3k','n_unconf_branch','n_unconf_log']);
graph.nodes=graph.nodes.filter(node=>ids.has(node.id));
graph.edges=graph.edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to));
const jwt=`e30.${Buffer.from(JSON.stringify({email:'confirmed@example.test',email_verified_at:1,phone_number_verified_at:1})).toString('base64url')}.fixture`;
const auth=`<!doctype html><html><body><button data-bdd="next-button">Continue</button><script>
document.querySelector('button').onclick=()=>{document.body.innerHTML='<button>Not Right Now</button>';
  document.querySelector('button').onclick=()=>setTimeout(()=>{location.href='https://identity.ticketmaster.com/exchange?code=fixture';},4000);};
</script></body></html>`;
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext();
    const page=await context.newPage();
    await page.route('https://auth.ticketmaster.com/**',route=>route.fulfill({contentType:'text/html',body:auth}));
    await page.route('https://identity.ticketmaster.com/exchange**',route=>route.fulfill({status:302,headers:{location:'https://www.ticketmaster.com/','set-cookie':`id-token=${jwt}; Domain=ticketmaster.com; Path=/; Secure; SameSite=None`}}));
    await page.route('https://identity.ticketmaster.com/json/**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
    await page.route('https://www.ticketmaster.com/**',route=>route.fulfill({contentType:'text/html',body:'<main>home</main>'}));
    await page.goto('https://auth.ticketmaster.com/');
    saves=[];
    const logs=[];
    const task={page,context,profile:{id:'fixture',persona:{identity:{email:'confirmed@example.test',password:'fixture-password'},addresses:[]}},inputs:{},vars:new Map(),log(level,text){logs.push({level,text});},signal:new AbortController().signal};
    await runGraph(graph,task);
    assert.equal(saves.length,1);assert.equal(saves[0].status,'verified');
    assert.ok(logs.some(l=>/signed-in account: confirmed@example\.test/.test(l.text)),'account read from the exchanged id-token');
    assert.ok(!logs.some(l=>l.level==='warn'),'no unconfirmed-save warning: '+JSON.stringify(logs.filter(l=>l.level==='warn')));
    console.log('PASS waits for the identity exchange redirect before confirming the account');
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
