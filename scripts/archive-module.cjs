#!/usr/bin/env node
// Archive / restore graph modules in manifest.json.
//
//   node scripts/archive-module.cjs --archive la28,tm
//   node scripts/archive-module.cjs --restore la28
//   node scripts/archive-module.cjs --list
//
// The app lists only `tasks`; entries moved to `archived` keep their full
// manifest record (download path, author key, version) so restoring is a
// move back, not a re-publish. Installed copies stay on users' machines but no
// longer appear in the Library. Commit + push main for the change to go live:
// the app reads raw.githubusercontent.com/quikk1/scrolls-community-tasks/main.
const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "manifest.json");
const raw = fs.readFileSync(file, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const manifest = JSON.parse(raw);
if (manifest.format !== "arcana-marketplace/v1") throw new Error("unexpected manifest format");
manifest.tasks = Array.isArray(manifest.tasks) ? manifest.tasks : [];
manifest.archived = Array.isArray(manifest.archived) ? manifest.archived : [];

function ids(flag) {
  const i = process.argv.indexOf(`--${flag}`);
  if (i < 0) return null;
  return (process.argv[i + 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
}
function move(from, to, wanted, label) {
  for (const id of wanted) {
    const idx = from.findIndex((t) => t && t.id === id);
    if (idx < 0) throw new Error(`${label}: "${id}" is not in the source list (ids: ${from.map((t) => t.id).join(", ")})`);
    const [entry] = from.splice(idx, 1);
    to.push(entry);
    console.log(`[archive-module] ${label} ${id} (${entry.name} v${entry.version})`);
  }
}

const archive = ids("archive"), restore = ids("restore");
if (process.argv.includes("--list") || (!archive && !restore)) {
  console.log("listed:  " + manifest.tasks.map((t) => `${t.id}@${t.version}`).join(", "));
  console.log("archived: " + (manifest.archived.map((t) => `${t.id}@${t.version}`).join(", ") || "(none)"));
  if (!archive && !restore) process.exit(0);
}
if (archive) move(manifest.tasks, manifest.archived, archive, "archived");
if (restore) move(manifest.archived, manifest.tasks, restore, "restored");
if (!manifest.archived.length) delete manifest.archived;
manifest.updatedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(manifest, null, 2).replace(/\n/g, eol) + eol);
console.log(`[archive-module] wrote ${path.basename(file)} (${manifest.tasks.length} listed, ${(manifest.archived || []).length} archived)`);
