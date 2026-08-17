#!/usr/bin/env node
// Reproducible 0.2.8 patch for the public browser-based Riot entry graph.

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const taskPath = path.join(root, "tasks", "riot-entry.arcana-task.json");
const manifestPath = path.join(root, "manifest.json");
const bundle = JSON.parse(fs.readFileSync(taskPath, "utf8"));
const graph = bundle.graph;

const node = (id) => {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing node ${id}`);
  return found;
};

bundle.exportedAt = "2026-08-16T22:00:00.000Z";
graph.version = "0.2.8";
graph.metadata.description =
  "Signs eligible saved riotgames.com accounts into the Riftbound XSSO client and enters them in the Riftbound T1 Signature Edition product-registration drawing (campaign 31, item RB3864-00-00). The browser flow clears cookie prompts before sign-in, rotates immediately when Riot blocks a proxy, fails fast on an invalid CAPTCHA selection, handles email MFA, product + legal consent, and confirmation, then writes the shared entry marker to the account and Inventory. Only a newly submitted entry emits a success webhook, including the exact proxy used; already-entered accounts are recorded without a duplicate success notification.";
if (!graph.permissions.includes("webhook")) graph.permissions.push("webhook");

const consentScript = `function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function visible(el){
  if(!el)return false;
  var r=el.getBoundingClientRect();
  if(r.width<=0||r.height<=0)return false;
  var s=getComputedStyle(el);
  return s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0';
}
function label(el){return ((el&&((el.innerText||el.textContent)||el.getAttribute('aria-label')||el.title))||'').replace(/\\s+/g,' ').trim();}
function bannerVisible(){
  var sels=['#onetrust-banner-sdk','#consent_blackbar','[data-testid*="cookie" i]','[id*="cookie" i][role="dialog"]','[class*="cookie" i][role="dialog"]'];
  for(var i=0;i<sels.length;i++){
    var list=document.querySelectorAll(sels[i]);
    for(var j=0;j<list.length;j++){if(visible(list[j]))return true;}
  }
  return false;
}
function findChoice(){
  var exact=/^(deny non-essential|reject non-essential|reject all|only necessary|necessary only|continue without accepting|accept all|allow all|accept cookies|accept|agree|close)$/i;
  var preferred=['#onetrust-reject-all-handler','#onetrust-accept-btn-handler','button[aria-label*="cookie" i]','button[aria-label="close" i]'];
  for(var p=0;p<preferred.length;p++){
    var preferredList=document.querySelectorAll(preferred[p]);
    for(var q=0;q<preferredList.length;q++){if(visible(preferredList[q]))return preferredList[q];}
  }
  var controls=document.querySelectorAll('button,[role="button"],a');
  for(var i=0;i<controls.length;i++){
    if(visible(controls[i])&&exact.test(label(controls[i])))return controls[i];
  }
  return null;
}
for(var attempt=0;attempt<4;attempt++){
  var choice=findChoice();
  if(!choice)return bannerVisible()?'blocked':'none';
  try{choice.scrollIntoView({block:'center',inline:'center'});}catch(e){}
  try{HTMLElement.prototype.click.call(choice);}catch(e){try{choice.click();}catch(ignore){}}
  await sleep(400);
  if(!bannerVisible())return 'cleared';
}
return bannerVisible()?'blocked':'cleared';`;
node("n_consent").config.script = consentScript;

const blockedGuard = `  var pageText=text(document.body);\n  if(/sorry,?\\s+you have been blocked/i.test(pageText))\n    throw new Error('Riot blocked this proxy: Sorry, you have been blocked - rotate proxy immediately.');\n`;
for (const id of ["n_probe_reg", "n_probe_auth", "n_probe_result"]) {
  const target = node(id);
  const needle = "for(var i=0;i<24;i++){\n";
  if (!target.config.script.includes(needle)) throw new Error(`${id} polling loop changed`);
  if (!target.config.script.includes("rotate proxy immediately")) {
    target.config.script = target.config.script.replace(needle, needle + blockedGuard);
  }
}

const auth = node("n_probe_auth");
const authGuard = `  if(/the captcha selection was invalid\\.?\\s*please try again\\.?/i.test(pageText))
    throw new Error('The CAPTCHA selection was invalid. Please try again. (no retry)');
`;
// Repair the malformed literal \\n emitted by the first local patch run, then
// keep subsequent executions idempotent.
auth.config.script = auth.config.script.replace(
  "  if(/the captcha selection was invalid\\.?\\s*please try again\\.?/i.test(pageText))\\n    throw new Error('The CAPTCHA selection was invalid. Please try again. (no retry)');\\n",
  authGuard,
);
if (!auth.config.script.includes("The CAPTCHA selection was invalid")) {
  auth.config.script = auth.config.script.replace(blockedGuard, blockedGuard + authGuard);
}

node("n_result_skip").config.value = {
  status: "already_opted_in",
  source: "account notes",
  campaign: "31",
  items: ["RB3864-00-00"],
  username: "{{account.username}}",
  email: "{{account.email}}",
  suppressSuccessWebhook: true,
};
node("n_result").config.value = {
  status: "{{entryStatus}}",
  campaign: "31",
  items: ["RB3864-00-00"],
  username: "{{account.username}}",
  email: "{{account.email}}",
  proxy: "{{proxy.label}}",
  suppressSuccessWebhook: true,
};

if (!graph.nodes.some((candidate) => candidate.id === "n_br_success_webhook")) {
  graph.nodes.push(
    {
      id: "n_br_success_webhook",
      kind: "branch",
      position: { x: 1440, y: 4320 },
      config: { left: "{{entryStatus}}", op: "==", right: "success" },
    },
    {
      id: "n_webhook_success",
      kind: "webhook.fire",
      position: { x: 1680, y: 4240 },
      config: {
        event: "task.succeeded",
        data: {
          tool: "riot-entry",
          status: "success",
          campaign: "31",
          items: ["RB3864-00-00"],
          username: "{{account.username}}",
          email: "{{account.email}}",
          proxy: "{{proxy.label}}",
        },
      },
    },
  );
}

const inventoryEdge = graph.edges.find((edge) => edge.from === "n_inventory" && (edge.to === "n_result" || edge.to === "n_br_success_webhook"));
if (!inventoryEdge) throw new Error("inventory-to-result edge changed");
inventoryEdge.to = "n_br_success_webhook";
inventoryEdge.id = "e_inventory__success_webhook";
for (const edge of [
  { id: "e_br_success_webhook__true", from: "n_br_success_webhook", fromPort: "true", to: "n_webhook_success" },
  { id: "e_br_success_webhook__false", from: "n_br_success_webhook", fromPort: "false", to: "n_result" },
  { id: "e_webhook_success__next", from: "n_webhook_success", fromPort: "next", to: "n_result" },
]) {
  if (!graph.edges.some((candidate) => candidate.id === edge.id)) graph.edges.push(edge);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.updatedAt = "2026-08-16";
const entry = manifest.tasks.find((candidate) => candidate.id === "riot-entry");
if (!entry) throw new Error("manifest riot-entry missing");
entry.version = "0.2.8";
entry.description = graph.metadata.description;
if (!entry.permissions.includes("webhook")) entry.permissions.push("webhook");
entry.emailMode = "account-list";
entry.accountSource = {
  site: "riotgames.com",
  enteredMarker: "riot entry campaign 31: OPTED_IN | items RB3864-00-00",
};
entry.publishedAt = "2026-08-17";

fs.writeFileSync(taskPath, JSON.stringify(bundle, null, 2) + "\n");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("riot-entry browser task patched to 0.2.8");
