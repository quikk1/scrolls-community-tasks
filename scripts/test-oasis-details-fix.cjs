const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {patchGraph}=require('./build-oasis-details-fix.cjs');
const app=process.env.SCROLLS_APP_DIR||path.resolve(__dirname,'../../../scrolls-app/app');
const {chromium}=require(path.join(app,'node_modules/playwright-core'));
const {runGraph,validateGraph}=require(path.join(app,'dist-electron/graph-runtime'));
require(path.join(app,'dist-electron/graph-nodes-core'));
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'../tasks/oasis.arcana-task.json'))).graph;
const patched=patchGraph(original);
const ids=['n_details_data','n_names','n_location_mode','n_delivery_branch','n_remaining_location','n_autocomplete_branch','n_selected_city','n_delivery_fill','n_addrclear','n_addrtype','n_address','n_addrpick','n_addrverify'];
const graph={schemaVersion:1,version:'test',metadata:{id:'oasis-test',name:'Oasis test'},start:'n_details_data',permissions:['browser','evaluate'],variables:[],nodes:patched.nodes.filter(n=>ids.includes(n.id)),edges:patched.edges.filter(e=>ids.includes(e.from))};
graph.edges.find(e=>e.from==='n_names').to='n_location_mode';
graph.nodes.push({id:'n_dobopen',kind:'noop',config:{},position:{x:0,y:0}});
assert.deepEqual(validateGraph(graph),[]);
const baseAddress={isDefault:true,street1:'123 Example St',street2:'Apt 4',city:'Phoenix',country:'US',postalCode:'85001'};
function fixture({delivery=true,count=5,names=false,location=false,reject=false,localized=false,noPredictions=false}={}){
 const labels=localized?['Haus','Straße','Stadt','Land','Postleitzahl']:['House / apartment number with Building Name','Street','City','Country','Postcode / ZIP / Area code'];
 return '<input type="tel">'+(names?'<input id="first"><input id="last">':'')+
 (location?'<div class="custom-location-input"><input autocomplete="no-thanks"></div><input readonly value="1975-08-19">':'')+
 (delivery?Array.from({length:count},(_,i)=>'<div class="v-input"><i class="mdi-truck-delivery"></i><label>'+labels[i]+'<input id="shipping'+i+'" '+(reject&&i===2?'oninput="this.value=\'\'"':'')+'></label></div>').join(''):'')+
 (location?`<script>
 const input=document.querySelector('[autocomplete="no-thanks"]');
 input.oninput=()=>{document.querySelector('[role="option"]')?.remove();if(${noPredictions})return;const option=document.createElement('div');option.setAttribute('role','option');option.textContent=input.value+', selected location';option.onclick=()=>{input.value=option.textContent;option.remove();document.body.dataset.locationSelected='true'};document.body.append(option)};
 </script>`:'');
}
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  async function scenario(name,options={}){
   const context=await browser.newContext();const page=await context.newPage();await page.setContent(fixture(options));
   const vars=new Map();const visited=[];
   const address={...baseAddress,...options.address};
   const addresses=options.noAddress?[]:options.defaultSecond?[{...address,isDefault:false,city:'Wrong City'},address]:[address];
   let error;
   const scenarioGraph=structuredClone(graph);
   if(options.noPredictions)scenarioGraph.nodes.find(n=>n.id==='n_address').config.script=scenarioGraph.nodes.find(n=>n.id==='n_address').config.script.replace('Date.now()+25000','Date.now()+1200');
   try{await runGraph(scenarioGraph,{page,context,profile:{id:'offline',name:'Offline',persona:{identity:{firstName:'Jane',lastName:"O'Neil"},addresses}},inputs:{},vars,signal:new AbortController().signal,log:()=>{},onNodeEnter:id=>visited.push(id)});}catch(e){error=e}
   try{
    if(options.error){assert.ok(error);assert.match(error.message,options.error);assert.ok(!visited.includes('n_dobopen'));}
    else{
     if(error)throw error;
     if(options.delivery!==false){
      const values=await page.locator('.v-input input').evaluateAll(els=>els.map(e=>e.value));
      assert.deepEqual(values,options.expected||['123, Apt 4','Example St',address.city,'United States','85001']);
      if(!options.location)assert.ok(!visited.includes('n_addrclear'),'plain delivery must skip autocomplete');
      assert.equal(vars.get('oasisDeliveryReady'),'delivery-address-verified');
     }
     if(options.location){assert.ok(visited.includes('n_addrclear'));assert.equal(vars.get('oasisSelectedCity').city,address.city);assert.equal(await page.locator('body').getAttribute('data-location-selected'),'true');assert.equal(await page.locator('[autocomplete="no-thanks"]').inputValue(),address.city+', selected location');}
     else if(options.delivery===false)assert.ok(!visited.includes('n_addrclear'),'names-only must skip autocomplete');
     if(options.names){assert.equal(await page.locator('#first').inputValue(),'Jane');assert.equal(await page.locator('#last').inputValue(),"O'Neil");}
    }
    console.log('PASS '+name);
   }finally{await context.close()}
  }
  await scenario('Delivery-only form maps all five fields and never uses them as names');
  await scenario('Names plus delivery stay separate',{names:true});
  await scenario('Full form fills delivery AND selects separate City/Town',{names:true,location:true});
  await scenario('Combined form supports a town with spaces',{names:true,location:true,address:{city:'West Hollywood'}});
  await scenario('Combined form cannot continue without town suggestions',{names:true,location:true,noPredictions:true,error:/predictions did not appear/});
  await scenario('Translated delivery labels use the same structural field mapping',{localized:true});
  await scenario('Default shipping address is preferred',{defaultSecond:true});
  await scenario('House number at the end of street line',{address:{street1:'Example Street 42',street2:''},expected:['42','Example Street','Phoenix','United States','85001']});
  await scenario('Apostrophe in city survives script interpolation',{address:{city:"L'Example"}});
  await scenario('No saved address gives a setup error',{noAddress:true,error:/Choose a delivery address/});
  await scenario('Missing city fails before continuing',{address:{city:''},error:/missing City/});
  await scenario('Unsplit street fails without inventing a house number',{address:{street1:'Example Street'},error:/house number and street/});
  await scenario('Unexpected address layout fails without positional guesses',{count:4,error:/expected five address fields/});
  await scenario('Rejected city value prevents continuation',{reject:true,error:/did not retain/});
  await scenario('Location-only form uses selected address city',{delivery:false,location:true});
  await scenario('Names and autocomplete remain supported',{delivery:false,names:true,location:true});
  await scenario('Autocomplete city with apostrophe is safely interpolated',{delivery:false,location:true,address:{city:"L'Example"}});
  await scenario('Names-only form skips absent location',{delivery:false,names:true});
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
