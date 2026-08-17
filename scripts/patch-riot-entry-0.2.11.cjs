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
  "Signs eligible saved or manually supplied riotgames.com accounts into the Riftbound XSSO client and enters them in the Riftbound T1 Signature Edition product-registration drawing (campaign 31, item RB3864-00-00). Users can select all eligible saved accounts, choose an email list, or paste transient username:password credentials (optionally username:password:email for MFA). The browser flow clears cookie prompts before sign-in, rotates immediately when Riot blocks a proxy, fails fast on an invalid CAPTCHA selection, handles email MFA when an address is available, product + legal consent, and confirmation, then writes the shared entry marker to the account and Inventory. Only a newly submitted entry emits a success webhook, including the exact proxy used; already-entered accounts are recorded without a duplicate success notification.";

graph.version = "0.2.11";
graph.metadata.description = description;
bundle.exportedAt = "2026-08-17T06:15:00.000Z";
entry.version = graph.version;
entry.description = description;
entry.accountSource = {
  ...(entry.accountSource || {}),
  site: "riotgames.com",
  manualCredentials: true,
};

fs.writeFileSync(taskPath, JSON.stringify(bundle, null, 2) + "\n");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("riot browser entry restored to 0.2.11");
