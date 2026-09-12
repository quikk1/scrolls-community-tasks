// Oasis 1.3.12 phone source. Runs the REAL n_phone node through the app's graph
// runtime against a stub page, so the {{run.identity.phoneSource}} plumbing and
// the saved-number normalization are exercised exactly as a run would.
//
//   node scripts/test-oasis-phone.cjs
//   SCROLLS_APP_DIR=C:/dev/Scrolls/.worktrees/dev-1.9.2/scrolls-app/app node scripts/test-oasis-phone.cjs
//
// Needs the app compiled once (`tsc -p electron/tsconfig.json`) for dist-electron.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=process.env.SCROLLS_APP_DIR||path.resolve(__dirname,'../../../scrolls-app/app');
const {chromium}=require(path.join(app,'node_modules/playwright-core'));
const {runGraph,validateGraph}=require(path.join(app,'dist-electron/graph-runtime'));
require(path.join(app,'dist-electron/graph-nodes-core'));

const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../tasks/oasis.arcana-task.json'))).graph;
const phone=source.nodes.find(n=>n.id==='n_phone');
assert.ok(phone,'n_phone missing');
const graph={schemaVersion:1,version:'test',metadata:{id:'oasis-phone-test',name:'Oasis phone test'},
 start:'n_phone',permissions:['browser','evaluate'],variables:[],
 nodes:[{...phone,config:{...phone.config}}],edges:[]};
assert.deepEqual(validateGraph(graph),[]);

const GB=/^7[4789]\d{8}$/;
const US=/^[2-9]\d{2}[2-9]\d{2}\d{4}$/;

async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 let failed=0;
 try{
  async function scenario(name,{cc='GB',calling='44',phoneSource,savedAddress,savedIdentity,noField=false,expect,source:wantSource,match}){
   const context=await browser.newContext();const page=await context.newPage();
   await page.setContent(noField?'<p>location only</p>':'<input type="tel">');
   const vars=new Map([['geo',{cc,calling,city:'Testville'}]]);
   const persona={identity:{firstName:'Jane',lastName:'Doe',...(savedIdentity?{phone:savedIdentity}:{})},
    addresses:savedAddress===undefined?[]:[{isDefault:true,street1:'1 Example St',city:'Testville',country:cc,postalCode:'X1',phone:savedAddress}]};
   const runConfig=phoneSource===undefined?undefined:{runBy:'database',identity:{phoneSource}};
   try{
    const out=await runGraph(graph,{page,context,profile:{id:'offline',name:'Offline',persona},
     inputs:{},runConfig,vars,signal:new AbortController().signal,log:()=>{}});
    const got=vars.get('oasisPhone');
    if(noField){assert.equal(got,'no-phone');}
    else{
     assert.equal(got.source,wantSource,`${name}: source`);
     if(expect!==undefined)assert.equal(got.num,expect,`${name}: number`);
     if(match)assert.match(got.num,match,`${name}: shape`);
     assert.equal(await page.locator('input[type="tel"]').inputValue(),got.num,`${name}: filled value`);
    }
    void out;
    console.log('PASS '+name);
   }catch(e){failed++;console.log('FAIL '+name+': '+e.message);}
   finally{await context.close()}
  }

  // Legacy / opt-out: unchanged 1.3.11 behavior.
  await scenario('No run config at all still generates for the geo country',
   {savedAddress:'+44 7700 900123',source:'generated',match:GB});
  await scenario('Randomized ignores the saved number',
   {phoneSource:'random',savedAddress:'+44 7700 900123',source:'generated',match:GB});
  await scenario('Reduced location-only form still reports no-phone',
   {phoneSource:'profile',savedAddress:'+44 7700 900123',noField:true});

  // Opt-in: the record's own number.
  await scenario("Profile's own strips a declared +CC",
   {phoneSource:'profile',savedAddress:'+44 7700 900123',expect:'7700900123',source:'profile'});
  await scenario("Profile's own strips a 00 international prefix",
   {phoneSource:'profile',savedAddress:'0044 7700 900123',expect:'7700900123',source:'profile'});
  await scenario("Profile's own strips a national trunk 0",
   {phoneSource:'profile',savedAddress:'07700 900123',expect:'7700900123',source:'profile'});
  await scenario("Profile's own strips NANP trunk 1",
   {cc:'US',calling:'1',phoneSource:'profile',savedAddress:'1 (602) 555-0143',expect:'6025550143',source:'profile'});
  await scenario("Profile's own keeps a bare 10-digit NANP number intact",
   {cc:'US',calling:'1',phoneSource:'profile',savedAddress:'1234567890',expect:'1234567890',source:'profile'});
  await scenario("Profile's own falls back to the profile identity when the record has none",
   {cc:'US',calling:'1',phoneSource:'profile',savedAddress:'',savedIdentity:'(602) 555-0143',expect:'6025550143',source:'profile'});
  await scenario("Profile's own prefers the address record over the profile identity",
   {cc:'US',calling:'1',phoneSource:'profile',savedAddress:'602-555-0199',savedIdentity:'480-555-0100',expect:'6025550199',source:'profile'});

  // Opt-in with nothing to use: generate rather than stop the run.
  await scenario('Nothing saved anywhere falls back to a generated number',
   {cc:'US',calling:'1',phoneSource:'profile',source:'generated-fallback',match:US});
  await scenario('An unusable saved fragment falls back to a generated number',
   {phoneSource:'profile',savedAddress:'555',source:'generated-fallback',match:GB});
 }finally{await browser.close()}
 if(failed){console.log(`\n${failed} failure(s)`);process.exit(1);}
 console.log('\nall phone-source scenarios passed');
}
main().catch(e=>{console.error(e);process.exit(1)});
