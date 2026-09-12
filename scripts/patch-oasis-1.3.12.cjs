#!/usr/bin/env node
// Oasis 1.3.12 - honor the run dialog's Identity -> Phone choice.
//
// Until now n_phone ALWAYS minted a number, so the saved phone on an address
// record was never used by this module (v1.0.0 filled {{identity.phone}}; the
// country-aware generator replaced it in 1.3.2). The app now sends the user's
// choice as {{run.identity.phoneSource}}; "profile" means fill the saved
// number instead. Anything else - including an older app, which sends nothing -
// keeps generating, so this is a no-op for every run that does not opt in.

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const taskPath = path.join(root, "tasks", "oasis.arcana-task.json");
const manifestPath = path.join(root, "manifest.json");
const bundle = JSON.parse(fs.readFileSync(taskPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const graph = bundle.graph;
const entry = (manifest.tasks || []).find((item) => item.id === "oasis");

if (graph?.version !== "1.3.11" || entry?.version !== "1.3.11") {
  throw new Error(`expected Oasis 1.3.11, found graph=${graph?.version} manifest=${entry?.version}`);
}

const phone = graph.nodes.find((candidate) => candidate.id === "n_phone");
const anchor = "var num=(gens[cc]?gens[cc]():d(9));\nsetVal(el,num);\nawait sleep(150);\nreturn {cc:cc,num:num};";
if (phone?.kind !== "evaluate" || !phone.config?.script?.endsWith(anchor)) {
  throw new Error("Oasis n_phone does not end with the expected 1.3.11 generator tail");
}

// Saved number first, generator second. `profile.*` is the LENIENT mirror of
// the persona: a missing `identity.phone` / `addresses.0.phone` under the bare
// scope stops the run with "Profile data missing", which is the wrong outcome
// for a field we are happy to generate.
// String.raw: the injected script carries real regex escapes (\D, \s, \+).
const tail = String.raw`// Run dialog -> Identity -> Phone. "profile" fills the saved number (the
// address record's, else the profile identity's); anything else - including an
// older app, which sends nothing at all - generates one for the country this
// page is signing up in. profile.* is the lenient scope on purpose: a blank
// saved number has to fall through to the generator, not fail the run.
var want=String("{{run.identity.phoneSource}}"||"").toLowerCase();
var saved=String("{{profile.addresses.0.phone}}"||"").trim()||String("{{profile.identity.phone}}"||"").trim();
var source='generated';
var num='';
if(want==='profile'&&saved){
  var calling=String("{{vars.geo.calling}}"||"").replace(/\D/g,'');
  var digits=saved.replace(/\D/g,'');
  // Strip a country code the number actually DECLARES (+44..., 0044...) - never
  // a leading digit that merely happens to match one (1234567890 is not +1).
  if(/^\s*00/.test(saved)) digits=digits.replace(/^00/,'');
  if(/^\s*(\+|00)/.test(saved)&&calling&&digits.indexOf(calling)===0) digits=digits.slice(calling.length);
  if((cc==='US'||cc==='CA')&&digits.length===11&&digits.charAt(0)==='1') digits=digits.slice(1);
  else if(cc!=='US'&&cc!=='CA'&&digits.length>1&&digits.charAt(0)==='0') digits=digits.slice(1);
  // The country selector was set from the proxy's geo. A saved number that is
  // too short to be a subscriber number would only fail the site's validation.
  if(digits.length>=7){ num=digits; source='profile'; }
}
if(!num){
  num=(gens[cc]?gens[cc]():d(9));
  if(want==='profile') source='generated-fallback';
}
setVal(el,num);
await sleep(150);
return {cc:cc,num:num,source:source};`;

graph.version = "1.3.12";
entry.version = "1.3.12";
phone.config.script = phone.config.script.slice(0, -anchor.length) + tail;
// The Library listing and the graph carry the same description - keep them in
// step or the marketplace card and the installed module disagree.
const described = (text) => text.replace(
  "Records confirmed signups only.",
  "Phone follows the run dialog's Identity tab: generated for the signup country, or the record's own saved number. Records confirmed signups only.",
);
if (graph.metadata.description !== entry.description) {
  throw new Error("Oasis graph and manifest descriptions are already out of step");
}
graph.metadata.description = described(graph.metadata.description);
entry.description = described(entry.description);

if (!phone.config.script.includes("{{run.identity.phoneSource}}")) {
  throw new Error("failed to add the Oasis phone-source branch");
}
new Function(`return (async()=>{${phone.config.script.replace(/\{\{[^}]+\}\}/g, "X")}})`);
if (bundle.graph.author) bundle.graph.author.signature = "";

fs.writeFileSync(taskPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("patched Oasis 1.3.12 phone source (run dialog Identity -> Phone)");
