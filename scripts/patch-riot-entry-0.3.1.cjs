#!/usr/bin/env node
// Retarget the Riot browser entry from Convergence Fest (campaign 30, TICKET001)
// to the Riftbound Vendetta Booster Display drawing (campaign 32, item
// 810155275785) on playriftbound.com. This reverses the site-specific parts of
// patch-riot-entry-0.3.0.cjs while keeping every generic 0.3.0 improvement:
// Osano cookie handling, proxy-block rotation, invalid-CAPTCHA fast fail,
// interactive registration hCaptcha solving, and the raffle.entry.succeeded
// webhook.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const taskPath = path.join(root, "tasks", "riot-entry.arcana-task.json");
const manifestPath = path.join(root, "manifest.json");

const bundle = JSON.parse(fs.readFileSync(taskPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const graph = bundle.graph;
const entry = manifest.tasks.find((candidate) => candidate.id === "riot-entry");

if (!entry) throw new Error("riot-entry is missing from manifest.json");
if (graph.metadata.id !== "riot-entry") throw new Error("unexpected task id");
if (graph.version !== "0.3.0" || entry.version !== "0.3.0") {
  throw new Error(`expected riot-entry 0.3.0, found graph=${graph.version} manifest=${entry.version}`);
}
const node = (id) => {
  const value = graph.nodes.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`missing node ${id}`);
  return value;
};

const CAMPAIGN = "32";
const ITEM = "810155275785";
const EVENT = "Riftbound Vendetta Booster Display";
const REG_URL = "https://playriftbound.com/en-us/preorder/registration/";
const MARKER = `riot entry campaign ${CAMPAIGN}: OPTED_IN | items ${ITEM}`;

const transformStrings = (value) => {
  if (Array.isArray(value)) return value.map(transformStrings);
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) value[key] = transformStrings(child);
    return value;
  }
  if (typeof value !== "string") return value;
  if (value === "30") return CAMPAIGN;
  return value
    .replaceAll("riot entry campaign 30: OPTED_IN | items TICKET001", MARKER)
    .replaceAll("Convergence Fest Fan First Access", EVENT)
    .replaceAll("TICKET001", ITEM)
    .replaceAll("campaign 30", `campaign ${CAMPAIGN}`)
    .replaceAll("convergencefest.riotgames.com/en-us/tickets/", "playriftbound.com/en-us/preorder/registration/")
    .replaceAll("convergencefest.riotgames.com", "playriftbound.com")
    .replaceAll("Convergence Fest", "Riftbound");
};

transformStrings(graph);

const description = "Signs eligible saved or manually supplied riotgames.com accounts into the Riftbound XSSO client and registers them for the Riftbound: League of Legends Vendetta Booster Display preorder drawing on playriftbound.com (campaign 32, item 810155275785). Users can select all eligible saved accounts, choose an email list, or paste transient username:password credentials (optionally username:password:email for MFA). The browser flow clears Riot and Osano cookie prompts before sign-in, rotates immediately when Riot blocks a proxy, fails fast on an invalid CAPTCHA selection, handles email MFA and interactive login or registration CAPTCHA challenges, selects the Vendetta Booster Display, accepts the legal acknowledgment, and records the confirmed entry. Only a newly submitted entry emits a success webhook, including the exact proxy used; already-entered accounts are recorded without a duplicate success notification. Accounts entered in earlier Riot drawings are eligible again because the entry marker carries the campaign id.";

bundle.exportedAt = "2026-09-08T17:30:00.000Z";
graph.version = "0.3.1";
graph.metadata.name = "Riot Entry - Riftbound (Browser)";
graph.metadata.description = description;
graph.metadata.tags = ["riot", "riftbound", "vendetta", "entry", "drawing", "raffle"];

entry.name = graph.metadata.name;
entry.description = description;
entry.version = graph.version;
entry.tags = [...graph.metadata.tags];
entry.publishedAt = "2026-09-08";
entry.accountSource.enteredMarker = MARKER;

// Site-specific nodes: same values the Riftbound 0.2.11 bundle used, with the
// Vendetta item id.
node("n_goto_reg").config.url = REG_URL;
node("n_goto_login").config.url = `https://xsso.playriftbound.com/login?uri=${encodeURIComponent(REG_URL)}&product_id=riftbound&locale=en_US`;
node("n_click_item").config.selector = `label[for="${ITEM}"], [data-testid="product-selection-card"] label`;
node("n_inventory").config.site = "playriftbound.com";
node("n_inventory").config.productUrl = REG_URL;

// Riftbound has no RiotBar RSO chooser: its blade shows "SIGN IN TO REGISTER",
// which n_probe_reg already handles. Restore the plain host check from 0.2.11.
const authProbe = node("n_probe_auth").config.script;
const modalStart = authProbe.indexOf("  // Riftbound opens RiotBar's RSO chooser first.");
const modalEnd = authProbe.indexOf("    return 'registration';\n  }\n", modalStart);
if (modalStart === -1 || modalEnd === -1) throw new Error("auth host probe shape changed");
const modalBlockEnd = modalEnd + "    return 'registration';\n  }\n".length;
node("n_probe_auth").config.script =
  authProbe.slice(0, modalStart) +
  "  if(host.indexOf('playriftbound.com')!==-1&&host.indexOf('xsso.')===-1)return 'registration';\n" +
  authProbe.slice(modalBlockEnd);
if (node("n_probe_auth").config.script.includes("RiotBar-RsoModal")) {
  throw new Error("failed to remove the Convergence Fest RSO modal handling");
}

// Success text probe: keep the text fallback but make it site-neutral.
for (const id of ["n_probe_reg", "n_probe_result"]) {
  const probe = node(id).config.script;
  const needle = "/registration successful|thanks for registering for the convergence fest/i";
  if (!probe.includes(needle)) throw new Error(`${id} success probe shape changed`);
  node(id).config.script = probe.replace(needle, "/registration successful|thanks for registering|you're registered|you are registered/i");
}

const leftovers = JSON.stringify(bundle).match(/convergence|TICKET001|attendee|"30"|campaign 30/gi);
if (leftovers) throw new Error(`Convergence Fest strings remain: ${[...new Set(leftovers)].join(", ")}`);

fs.writeFileSync(taskPath, `${JSON.stringify(bundle, null, 2)}\n`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log("Patched riot-entry browser task to Riftbound Vendetta v0.3.1");
