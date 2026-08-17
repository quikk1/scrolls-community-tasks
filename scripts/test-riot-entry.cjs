#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const graph = JSON.parse(fs.readFileSync(path.join(root, "tasks", "riot-entry.arcana-task.json"), "utf8")).graph;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const entry = manifest.tasks.find((candidate) => candidate.id === "riot-entry");
const node = (id) => graph.nodes.find((candidate) => candidate.id === id);
const edge = (from, port, to) => graph.edges.some((candidate) => candidate.from === from && candidate.fromPort === port && candidate.to === to);
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
};

ok(graph.version === "0.2.9" && entry?.version === graph.version, "manifest and graph publish 0.2.9");
ok(entry.emailMode === "account-list" && entry.accountSource?.site === "riotgames.com", "manifest enables eligible saved-account selection");
ok(entry.accountSource?.manualCredentials === true, "manifest enables transient username:password input");
ok(entry.permissions.includes("webhook") && graph.permissions.includes("webhook"), "webhook permission is declared");
ok(node("n_consent").config.script.includes("onetrust-accept-btn-handler") && node("n_consent").config.script.includes("deny non-essential"), "cookie handler covers Riot and OneTrust controls");
for (const id of ["n_probe_reg", "n_probe_auth", "n_probe_result"]) {
  ok(node(id).config.script.includes("rotate proxy immediately"), `${id} rotates immediately on Riot's block page`);
}
ok(node("n_probe_auth").config.script.includes("The CAPTCHA selection was invalid") && node("n_probe_auth").config.script.includes("(no retry)"), "invalid CAPTCHA fails immediately without a stale retry");
ok(node("n_probe_auth").config.script.includes("Your username or password may be incorrect") && node("n_probe_auth").config.script.includes("test(pageText)") && node("n_probe_auth").config.script.includes("rotate proxy immediately"), "proxy-reputation credential page message rotates immediately");
ok(node("n_result_skip").config.value.suppressSuccessWebhook === true, "local already-entered skip suppresses generic success webhook");
ok(node("n_result").config.value.suppressSuccessWebhook === true, "terminal result suppresses duplicate generic success webhook");
ok(node("n_webhook_success").config.data.proxy === "{{proxy.label}}", "new-entry webhook includes the concrete proxy label");
ok(edge("n_br_success_webhook", "true", "n_webhook_success") && edge("n_br_success_webhook", "false", "n_result"), "only a newly submitted entry reaches the success webhook");
