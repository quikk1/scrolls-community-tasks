#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const taskPath = path.join(root, "tasks", "riot-entry.arcana-task.json");
const manifestPath = path.join(root, "manifest.json");
const bundle = JSON.parse(fs.readFileSync(taskPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const graph = bundle.graph;
const entry = manifest.tasks.find((candidate) => candidate.id === "riot-entry");
if (!entry) throw new Error("riot-entry manifest card not found");

const description =
  "Signs eligible saved or manually supplied riotgames.com accounts into the Riftbound XSSO client and enters them in the Riftbound T1 Signature Edition product-registration drawing (campaign 31, item RB3864-00-00). Users can select all eligible saved accounts, choose an email list, or paste transient username:password credentials (optionally username:password:email for MFA). The browser flow clears cookie prompts before sign-in, rotates immediately when Riot blocks a proxy or reports the proxy-reputation login error, fails fast on an invalid CAPTCHA selection, handles email MFA when an address is available, product + legal consent, and confirmation, then writes the shared entry marker to the account and Inventory. Only a newly submitted entry emits a success webhook, including the exact proxy used; already-entered accounts are recorded without a duplicate success notification.";

graph.version = "0.2.9";
graph.metadata.description = description;
bundle.exportedAt = "2026-08-17T05:30:00.000Z";
entry.version = "0.2.9";
entry.description = description;
entry.accountSource = {
  ...(entry.accountSource || {}),
  site: "riotgames.com",
  manualCredentials: true,
};

const authProbe = graph.nodes.find((node) => node.id === "n_probe_auth");
if (!authProbe?.config?.script) throw new Error("n_probe_auth script not found");
const oldErrorProbe = "  var msg=text(err);\n  if(msg)return 'error:'+msg.slice(0,160);";
const newErrorProbe = "  var msg=text(err);\n  if(/your username or password may be incorrect\\.?\\s*check your details and try again\\.?/i.test(msg))\n    throw new Error('Riot rejected this login attempt due to proxy reputation: Your username or password may be incorrect. Check your details and try again. - rotate proxy immediately.');\n  if(msg)return 'error:'+msg.slice(0,160);";
// Inspect the whole visible page, not only Riot's current error-message test id;
// that component has changed containers before. Keep the msg-only insertion
// point normalized so re-running this patch is deterministic.
if (authProbe.config.script.includes(newErrorProbe)) {
  authProbe.config.script = authProbe.config.script.replace(newErrorProbe, oldErrorProbe);
}
const captchaProbe = "  if(/the captcha selection was invalid\\.?\\s*please try again\\.?/i.test(pageText))\n    throw new Error('The CAPTCHA selection was invalid. Please try again. (no retry)');\n";
const proxyReputationProbe = "  if(/your username or password may be incorrect\\.?\\s*check your details and try again\\.?/i.test(pageText))\n    throw new Error('Riot rejected this login attempt due to proxy reputation: Your username or password may be incorrect. Check your details and try again. - rotate proxy immediately.');\n";
if (!authProbe.config.script.includes(proxyReputationProbe)) {
  if (!authProbe.config.script.includes(captchaProbe)) throw new Error("auth page-text probe insertion point not found");
  authProbe.config.script = authProbe.config.script.replace(captchaProbe, captchaProbe + proxyReputationProbe);
}

fs.writeFileSync(taskPath, JSON.stringify(bundle, null, 2) + "\n");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("riot-entry patched to 0.2.9");
