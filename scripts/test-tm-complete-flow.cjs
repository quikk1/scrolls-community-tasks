// Full source graph against a local browser fixture. Domain responses are
// simulated: no Ticketmaster requests, accounts, inboxes, or paid rentals.
// Usage: node scripts/test-tm-complete-flow.cjs <app-dir>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appDir=path.resolve(process.argv[2]), dist=path.join(appDir,'dist-electron');
const {chromium}=require(path.join(appDir,'node_modules/playwright-core'));
const child=require.resolve(path.join(dist,'child-registry.js'));
require.cache[child]={id:child,filename:child,loaded:true,exports:{registerChild(){throw Error('fixture forbids child execution');}}};
const {runGraph,registerNode}=require(path.join(dist,'graph-runtime.js'));
require(path.join(dist,'graph-nodes-core.js'));
const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'../tasks/tm.arcana-task.json'),'utf8')).graph;
// Speed up the fixture without changing selectors, ports, or branch logic.
for(const node of graph.nodes){
  if(node.config.timeoutMs) node.config.timeoutMs=node.kind==='elementExists'?80:2000;
  if(['fill','click'].includes(node.kind)) node.config.instant=true;
  if(node.kind==='dwell') node.config.meanMs=1;
}
const calls={rents:0,waits:0,resends:0,finishes:0,cancels:0,saves:[]};
registerNode({kind:'accounts.pick',execute:async()=>{throw Error('no matching account');}});
registerNode({kind:'accounts.save',execute:async({config,resolve})=>{calls.saves.push(resolve(config));return {};}});
registerNode({kind:'imap.waitForMessage',execute:async()=>({setVars:{emailCode:'123456'}})});
registerNode({kind:'sms.rent',execute:async()=>{calls.rents++;return {setVars:{phoneRent:{provider:'fixture',activationId:'fixture',phoneNational:'541122222222'}}};}});
registerNode({kind:'sms.waitForCode',execute:async()=>{calls.waits++;if(calls.waits===1)throw Error('sms.waitForCode: timeout after 180000ms');return {setVars:{smsCode:'654321'}};}});
registerNode({kind:'sms.finish',execute:async()=>{calls.finishes++;return {};}});
registerNode({kind:'sms.cancel',execute:async()=>{calls.cancels++;return {};}});
const html=`<!doctype html><html><body><main></main><script>
const main=document.querySelector('main');let phase='';
const render=html=>main.innerHTML=html;
function home(){render('<button data-testid="accountLink">Sign In</button>');document.querySelector('button').onclick=email;}
function email(){render('<input id="email-input"><button type="submit">Continue</button>');document.querySelector('button').onclick=signup;}
function signup(){render('<input id="password-input" type="password"><input id="firstName-input"><input id="lastName-input"><input id="postalCode-input"><div id="privacyPolicyCheckbox-checkbox"><label><input type="checkbox">Terms</label></div><button type="submit">Next</button>');document.querySelector('button').onclick=()=>{phase='email';render('<button data-bdd="verify-email-button">Verify My Email</button>');document.querySelector('button').onclick=otp;};}
function otp(){render('<input id="otp-input-input"><button data-bdd="asvd-submit-button">Confirm Code</button><button data-bdd="asvd-request-code-link">Request a new code.</button>');document.querySelector('[data-bdd=asvd-request-code-link]').onclick=()=>window.fixtureResends=(window.fixtureResends||0)+1;document.querySelector('[data-bdd=asvd-submit-button]').onclick=()=>{const expected=phase==='email'?'123456':'654321';if(document.querySelector('input').value!==expected)throw Error('wrong fixture code');if(phase==='email'){phase='phone';render('<button data-bdd="verify-phone-button">Add My Phone</button>');document.querySelector('button').onclick=phone;}else{render('<button data-bdd="next-button">Next</button>');document.querySelector('button').onclick=()=>{document.cookie='id-token='+window.fixtureIdToken+'; path=/; secure';render('<p>signed in</p>');};}};}
function phone(){render('<input type="tel"><button aria-haspopup="listbox" aria-expanded="false">United States +1</button><div role="listbox" hidden><div role="option">United States +1</div><div role="option">Canada +1</div><div role="option">Other +</div></div><button data-bdd="asvd-submit-button">Add Number</button>');const toggle=document.querySelector('[aria-haspopup]'),menu=document.querySelector('[role=listbox]');toggle.onclick=()=>{menu.hidden=false;toggle.setAttribute('aria-expanded','true');};document.querySelectorAll('[role=option]').forEach(option=>option.onclick=()=>{toggle.textContent=option.textContent;toggle.setAttribute('aria-expanded','false');menu.hidden=true;});document.querySelector('[data-bdd=asvd-submit-button]').onclick=()=>{if(toggle.textContent!=='Other +')throw Error('wrong country');phase='sms';otp();};}
home();
</script></body></html>`;
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://www.ticketmaster.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
    const idToken=`e30.${Buffer.from(JSON.stringify({email:'confirmed@example.test',email_verified_at:1,phone_number_verified_at:1})).toString('base64url')}.fixture`;
    await page.addInitScript(token=>{window.fixtureIdToken=token;},idToken);
    // Keep the fixture resend count across its final navigation.
    let resendCount=0;
    await page.exposeFunction('fixtureResent',()=>resendCount++);
    await page.addInitScript(()=>Object.defineProperty(window,'fixtureResends',{set(){window.fixtureResent();},get(){return 0;}}));
    const task={page,context:page.context(),profile:{id:'fixture',persona:{identity:{email:'confirmed@example.test',password:'fixture-password',firstName:'Test',lastName:'Fixture'},addresses:[{postalCode:'10001'}]}},inputs:{smsRegion:'AR'},vars:new Map(),log(){},signal:new AbortController().signal};
    await runGraph(graph,task);
    assert.equal(calls.rents,1);assert.equal(calls.waits,2);assert.equal(resendCount,1);assert.equal(calls.finishes,1);assert.equal(calls.cancels,0);
    assert.equal(calls.saves.length,1);assert.equal(calls.saves[0].status,'verified');assert.equal(calls.saves[0].session,true);assert.equal(calls.saves[0].email,'confirmed@example.test');
    console.log('PASS complete graph: registration, email OTP, Other country, one rental/resend, SMS OTP, id-token account check, verified account save with session');
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
