#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const taskPath = path.join(root, "tasks", "oasis.arcana-task.json");
const manifestPath = path.join(root, "manifest.json");
const bundle = JSON.parse(fs.readFileSync(taskPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const graph = bundle.graph;
const entry = (manifest.tasks || []).find((item) => item.id === "oasis");

if (graph?.version !== "1.3.3" || entry?.version !== "1.3.3") {
  throw new Error(`expected Oasis 1.3.3, found graph=${graph?.version} manifest=${entry?.version}`);
}

const node = (id) => graph.nodes.find((candidate) => candidate.id === id);
const focus = node("n_addrclear");
const type = node("n_addrtype");
const address = node("n_address");
if (focus?.kind !== "clearField" || type?.kind !== "typeText" || type.config?.nativeInsert !== true ||
    address?.kind !== "evaluate" || !address.config?.script?.includes("OASIS_NATIVE_CITY_INSERT_V5")) {
  throw new Error("Oasis City/Town focus sequence does not match 1.3.3");
}

graph.version = "1.3.4";
entry.version = "1.3.4";
focus.kind = "click";
focus.config = {
  selector: 'input[autocomplete="no-thanks"]:visible',
  timeoutMs: 30000,
  instant: true,
};
address.config.script = address.config.script
  .replace(
    "// OASIS_NATIVE_CITY_INSERT_V5",
    `// OASIS_NATIVE_CITY_INSERT_V5
// OASIS_NATIVE_CITY_REFOCUS_V11`,
  )
  .replace(
    "// clearField physically clicks the input. Keep that native focus: calling the\n" +
      "// shim's script-based page.focus() again can detach Chromium's input target.",
    "// Clearing this controlled Vuetify field can replace the focused input. Click\n" +
      "// the live replacement immediately before native insertion instead. Keep that\n" +
      "// native focus: page.focus() can detach Chromium's input target.",
  );

if (!address.config.script.includes("OASIS_NATIVE_CITY_REFOCUS_V11")) {
  throw new Error("failed to add the Oasis refocus marker");
}
if (bundle.graph.author) bundle.graph.author.signature = "";

fs.writeFileSync(taskPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("patched Oasis 1.3.4 City/Town live-input refocus");
