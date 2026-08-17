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
  "Signs eligible saved riotgames.com accounts into the Riftbound XSSO client and enters them in the Riftbound T1 Signature Edition product-registration drawing (campaign 31, item RB3864-00-00). The browser flow clears cookie prompts before sign-in, rotates immediately when Riot blocks a proxy, fails fast on an invalid CAPTCHA selection, handles email MFA, product + legal consent, and confirmation, then writes the shared entry marker to the account and Inventory. Only a newly submitted entry emits a success webhook, including the exact proxy used; already-entered accounts are recorded without a duplicate success notification.";

graph.version = "0.2.10";
graph.metadata.description = description;
bundle.exportedAt = "2026-08-17T06:45:00.000Z";
entry.version = graph.version;
entry.description = description;
if (entry.accountSource) delete entry.accountSource.manualCredentials;

const authProbe = graph.nodes.find((node) => node.id === "n_probe_auth");
if (!authProbe?.config?.script) throw new Error("n_probe_auth script not found");
const proxyReputationProbe = "  if(/your username or password may be incorrect\\.?\\s*check your details and try again\\.?/i.test(pageText))\n    throw new Error('Riot rejected this login attempt due to proxy reputation: Your username or password may be incorrect. Check your details and try again. - rotate proxy immediately.');\n";
if (!authProbe.config.script.includes(proxyReputationProbe)) {
  throw new Error("browser proxy-reputation probe not found");
}
authProbe.config.script = authProbe.config.script.replace(proxyReputationProbe, "");

fs.writeFileSync(taskPath, JSON.stringify(bundle, null, 2) + "\n");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("riot browser entry corrected to 0.2.10");
