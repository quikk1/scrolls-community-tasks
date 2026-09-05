const fs = require('node:fs');
const path = require('node:path');

const deliveryHelpers = `
function deliveryInputs() {
  return Array.from(document.querySelectorAll('.v-input')).filter(function(wrap) {
    return !!wrap.querySelector('.mdi-truck-delivery');
  }).flatMap(function(wrap) { return Array.from(wrap.querySelectorAll('input')); })
    .filter(function(el, i, all) { return all.indexOf(el) === i && vis(el) && !el.readOnly && el.type !== 'hidden'; });
}
`;

function patchGraph(source) {
  const graph = structuredClone(source);
  if (graph.metadata?.id === 'oasis' && graph.version === '1.3.11') { delete graph.author; delete graph.signature; return graph; }
  if (graph.metadata?.id !== 'oasis' || graph.version !== '1.3.8') throw new Error('Expected OASIS 1.3.8');
  const node = id => {
    const value = graph.nodes.find(n => n.id === id);
    if (!value) throw new Error('Missing OASIS node ' + id);
    return value;
  };
  const add = (id, kind, config) => graph.nodes.push({ id, kind, config, position: { x: 360, y: graph.nodes.length * 120 } });
  const edge = (from, fromPort, to) => graph.edges.push({ id: `e_${from}_${fromPort}_details`, from, fromPort, to });
  const reroute = (from, fromPort, to) => {
    const found = graph.edges.filter(e => e.from === from && e.fromPort === fromPort);
    if (found.length !== 1) throw new Error('Unexpected edge from ' + from);
    found[0].to = to;
  };
  add('n_details_data', 'setVar', { name: 'oasisDetails', value: {
    addresses: '{{addresses}}', identity: { firstName: '{{identity.firstName}}', lastName: '{{identity.lastName}}' },
  } });
  reroute('n_stepbranch', 'false', 'n_details_data');
  edge('n_details_data', 'next', 'n_names');
  const names = node('n_names');
  const guard = "if(i.name==='Email') return false;";
  if (!names.config.script.includes(guard)) throw new Error('Unexpected name matching implementation');
  names.config.script = names.config.script.replace(guard, guard + `
    // Delivery fields carry the site's truck icon in every locale. Never use them as names.
    if(i.closest('.v-input')?.querySelector('.mdi-truck-delivery')) return false;
    if(['address-line1','address-line2','address-level2','country','postal-code'].includes(i.autocomplete)) return false;
  `).replace("if(!loc&&f.length<2)", "if(!loc&&f.length!==2)")
    .replace('var first=String("{{identity.firstName}}"||\'\').trim();', 'var details={{vars.oasisDetails}};\nvar first=String(details.identity.firstName||\'\').trim();')
    .replace('var last=String("{{identity.lastName}}"||\'\').trim();', 'var last=String(details.identity.lastName||\'\').trim();');

  add('n_location_mode', 'evaluate', { into: 'oasisLocationMode', script: `
function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}
${deliveryHelpers}
const delivery=deliveryInputs();
if(delivery.length && delivery.length!==5) throw new Error('OASIS delivery form changed: expected five address fields.');
if(delivery.length===5) return 'delivery';
if(Array.from(document.querySelectorAll('input[autocomplete="no-thanks"]')).some(vis)) return 'autocomplete';
return 'none';
` });
  add('n_delivery_branch', 'branch', { left: '{{vars.oasisLocationMode}}', op: '==', right: 'delivery' });
  add('n_autocomplete_branch', 'branch', { left: '{{vars.oasisLocationMode}}', op: '==', right: 'autocomplete' });
  reroute('n_phone', 'next', 'n_location_mode');
  edge('n_location_mode', 'next', 'n_delivery_branch');
  edge('n_delivery_branch', 'true', 'n_delivery_fill');
  edge('n_delivery_branch', 'false', 'n_autocomplete_branch');
  edge('n_autocomplete_branch', 'true', 'n_selected_city');
  edge('n_autocomplete_branch', 'false', 'n_dobopen');
  add('n_selected_city', 'evaluate', { into: 'oasisSelectedCity', script: `
const details={{vars.oasisDetails}};
const addresses=Array.isArray(details.addresses)?details.addresses:[];
const address=addresses.find(a=>a.isDefault)||addresses[0];
const city=String(address?.city||'').trim();
if(!city) throw new Error('Choose an address with a city in the Addresses tab.');
return {city};
` });
  edge('n_selected_city', 'next', 'n_addrclear');
  node('n_addrtype').config.text = '{{vars.oasisSelectedCity.city}}';
  node('n_address').config.script = node('n_address').config.script.replace('var city=String("{{vars.geo.city}}"||\'\').trim();', 'var selectedCity={{vars.oasisSelectedCity}};\nvar city=String(selectedCity.city||\'\').trim();');

  add('n_delivery_fill', 'evaluate', { into: 'oasisDeliveryReady', script: `
function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}
${deliveryHelpers}
const details={{vars.oasisDetails}};
const addresses=Array.isArray(details.addresses)?details.addresses:[];
const address=addresses.find(a=>a.isDefault)||addresses[0];
if(!address) throw new Error('Choose a delivery address in the Addresses tab.');
const line=String(address.street1||'').trim();
// Split the saved street line into the two fields the site requires.
const first=line.match(/^(\\d[\\w/-]*(?:\\s*[-/]\\s*\\d[\\w/-]*)?)\\s+(.+)$/);
const last=line.match(/^(.+?)\\s+(\\d[\\w/-]*)$/);
const house=first?first[1]:last?last[2]:'';
const street=first?first[2]:last?last[1]:'';
if(!house||!street) throw new Error('The selected address needs a house number and street in Address line 1.');
const country=String(address.country||'').trim().toUpperCase();
if(!/^[A-Z]{2}$/.test(country)) throw new Error('The selected address needs a two-letter country code.');
const countryName=new Intl.DisplayNames(['en'],{type:'region'}).of(country);
const values=[ [house,String(address.street2||'').trim()].filter(Boolean).join(', '),street,String(address.city||'').trim(),countryName,String(address.postalCode||'').trim() ];
const labels=['House','Street','City','Country','ZIP'];
for(let i=0;i<values.length;i++) if(!values[i]) throw new Error('Selected delivery address is missing '+labels[i]+'.');
for(let i=0;i<values.length;i++) {
  const inputs=deliveryInputs();
  if(inputs.length!==5) throw new Error('OASIS delivery form changed while filling.');
  const el=inputs[i];
  if(el.disabled) throw new Error('OASIS delivery field is disabled: '+labels[i]);
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,values[i]);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  el.blur();
  await new Promise(resolve=>setTimeout(resolve,120));
}
const inputs=deliveryInputs();
if(inputs.length!==5 || values.some((value,i)=>inputs[i].value.trim()!==value)) throw new Error('OASIS did not retain the selected delivery address.');
return 'delivery-address-verified';
` });
  // A details page can contain BOTH delivery fields and City/Town. Recheck
  // after delivery filling instead of treating the form shapes as exclusive.
  add('n_remaining_location', 'evaluate', { into: 'oasisLocationMode', script: `
function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}
return Array.from(document.querySelectorAll('input[autocomplete="no-thanks"]')).some(vis) ? 'autocomplete' : 'none';
` });
  edge('n_delivery_fill', 'next', 'n_remaining_location');
  edge('n_remaining_location', 'next', 'n_autocomplete_branch');
  node('n_dobopen').config.script = node('n_dobopen').config.script.replace("var texts=textInputs();", "var texts=textInputs().filter(function(i){return !i.closest('.v-input')?.querySelector('.mdi-truck-delivery');});");
  // The new-entry path already returns an email. The successful final lookup
  // path used to end with a noop and return null to the monitor instead.
  if (node('n_entry_result').kind !== 'setResult') throw new Error('Expected OASIS result node');
  node('n_dup_end').kind = 'setResult';
  node('n_dup_end').config = structuredClone(node('n_entry_result').config);
  graph.version = '1.3.11';
  graph.metadata.description = 'OASIS signup with shared address/email selection. Uses the selected record for delivery address and City/Town, including pages that ask for both. Selects the town autocomplete suggestion and keeps shipping fields separate from names. Records confirmed signups only.';
  delete graph.signature;
  delete graph.author;
  return graph;
}

module.exports = { patchGraph };
if (require.main === module) {
  const output = process.argv[2];
  if (!output) throw new Error('Pass the output path for the unsigned development bundle.');
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../tasks/oasis.arcana-task.json'), 'utf8'));
  const bundle = { format: 'arcana-task/v1', exportedAt: new Date().toISOString(), graph: patchGraph(source.graph) };
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(bundle, null, 2) + '\n');
  console.log('Built OASIS ' + bundle.graph.version + ' development bundle');
}
