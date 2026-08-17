#!/usr/bin/env node
// Structural check for every published task bundle.
//
//   node scripts/validate-tasks.cjs
//
// Catches the mistakes that are invisible in a diff but break a run:
//   - a branch with only one of its two ports wired (the run dead-ends)
//   - an edge pointing at a node that no longer exists
//   - a node nothing routes to
//   - an evaluate script that does not parse (it is injected into the page,
//     so a typo fails at runtime, on a real account)
//   - manifest version out of step with graph.version - install state compares
//     the manifest against the version INSIDE the installed graph, so a
//     mismatch leaves the Update button stuck forever
//
// Every one of these has shipped at least once.

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const entries = manifest.tasks || manifest.modules || [];

let failed = 0;
let warned = 0;
const fail = (id, msg) => { console.log(`  FAIL  ${id}: ${msg}`); failed++; };
const warn = (id, msg) => { console.log(`  WARN  ${id}: ${msg}`); warned++; };

for (const entry of entries) {
  const rel = entry.downloadPath;
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { fail(entry.id, `bundle missing at ${rel}`); continue; }

  let graph;
  try {
    graph = (JSON.parse(fs.readFileSync(file, "utf8")).graph) || null;
  } catch (e) {
    fail(entry.id, `bundle is not valid JSON: ${e.message}`);
    continue;
  }
  if (!graph) { fail(entry.id, "bundle has no .graph"); continue; }

  const problems = [];
  const warnings = [];

  if (graph.version !== entry.version) {
    problems.push(`manifest says ${entry.version} but graph.version is ${graph.version} - the Update button will never resolve`);
  }

  const ids = new Set((graph.nodes || []).map((n) => n.id));
  for (const e of graph.edges || []) {
    if (!ids.has(e.from)) problems.push(`edge ${e.id} comes from missing node ${e.from}`);
    if (!ids.has(e.to)) problems.push(`edge ${e.id} points at missing node ${e.to}`);
  }

  // Unreachable = nothing routes to it. Two legitimate exceptions: the entry
  // node (the first in the list; its id differs per module - n_start, n_1, ...)
  // and comment nodes, which are annotations and never wired.
  const entryId = (graph.nodes || [])[0]?.id;
  for (const n of graph.nodes || []) {
    if (n.id === entryId || n.kind === "comment") continue;
    // A leftover node is dead weight, not a broken run - warn, do not fail.
    if (!(graph.edges || []).some((e) => e.to === n.id)) warnings.push(`nothing routes to ${n.id} (${n.kind})`);
  }

  for (const n of (graph.nodes || []).filter((n) => n.kind === "branch")) {
    for (const port of ["true", "false"]) {
      if (!(graph.edges || []).some((e) => e.from === n.id && e.fromPort === port)) {
        problems.push(`branch ${n.id} has no "${port}" edge - the run dead-ends there`);
      }
    }
  }

  for (const n of (graph.nodes || []).filter((n) => n.kind === "evaluate")) {
    try {
      // evaluate scripts run as async function bodies
      new Function(`return (async () => {${n.config.script}})`);
    } catch (e) {
      problems.push(`evaluate ${n.id} does not parse: ${e.message}`);
    }
  }

  for (const w of warnings) warn(entry.id, w);
  if (problems.length) {
    for (const p of problems) fail(entry.id, p);
  } else {
    console.log(`  PASS  ${entry.id.padEnd(14)} v${entry.version}  ${(graph.nodes || []).length} nodes, ${(graph.edges || []).length} edges`);
  }
}

console.log(failed === 0 ? "\nall task bundles OK" : `\n${failed} problem(s) found`);
process.exit(failed === 0 ? 0 : 1);
