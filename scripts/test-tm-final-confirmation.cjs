// Real browser/control nodes, with account writes replaced by a fixture.
// Usage: node scripts/test-tm-final-confirmation.cjs <app-dir>
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
graph.start='n_oxam0g94';
const ids=new Set(['n_oxam0g94','n_xqa6szaz','n_3p7ytqzv','n_gpectape','n_dw22rs3k','n_unconf_branch','n_unconf_log']);
graph.nodes=graph.nodes.filter(node=>ids.has(node.id));
graph.edges=graph.edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to));
const jwt=claims=>`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    for(const [name,email,ok] of [
      ['id-token confirms account (case-insensitive)','Confirmed@Example.test',true],
      ['different account rejected','wrong@example.test',false],
      ['missing id-token still saves (codes were accepted)',null,'warn'],
    ]){
      const context=await browser.newContext();
      const page=await context.newPage();
      await page.route('https://www.ticketmaster.com/**',route=>route.fulfill({contentType:'text/html',body:'<main>home</main>'}));
      await page.route('https://identity.ticketmaster.com/**',route=>route.fulfill({status:401,body:''}));
      if(email) await context.addCookies([{name:'id-token',value:jwt({email,email_verified_at:1,phone_number_verified_at:1}),domain:'.ticketmaster.com',path:'/',secure:true}]);
      await page.goto('https://www.ticketmaster.com/');
      saves=[];
      const logs=[];
      const task={page,context,profile:{id:'fixture',persona:{identity:{email:'confirmed@example.test',password:'fixture-password'},addresses:[]}},inputs:{},vars:new Map(),log(level,text){logs.push({level,text});},signal:new AbortController().signal};
      if(ok){await runGraph(graph,task);assert.equal(saves.length,1);assert.equal(saves[0].status,'verified');assert.equal(saves[0].session,true);
        assert.equal(logs.some(l=>l.level==='warn'&&/Could not read the signed-in account/.test(l.text)),ok==='warn');}
      else {await assert.rejects(runGraph(graph,task),/did not confirm the account/);assert.equal(saves.length,0);}
      await context.close();
      console.log(`PASS ${name}`);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
