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

ok(graph.version === "0.3.0" && entry?.version === graph.version, "manifest and graph publish 0.3.0");
ok(graph.metadata.name === "Riot Entry - Convergence Fest (Browser)" && entry.name === graph.metadata.name, "task is branded for Convergence Fest");
ok(entry.emailMode === "account-list" && entry.accountSource?.site === "riotgames.com", "manifest enables eligible saved-account selection");
ok(entry.accountSource?.manualCredentials === true, "browser entry exposes transient username:password input");
ok(entry.accountSource?.enteredMarker === "riot entry campaign 30: OPTED_IN | items TICKET001", "saved-account selection uses the Convergence campaign marker");
ok(entry.permissions.includes("webhook") && graph.permissions.includes("webhook"), "webhook permission is declared");
ok(node("n_goto_reg").config.url === "https://convergencefest.riotgames.com/en-us/tickets/", "browser opens the Convergence tickets registration");
ok(node("n_goto_login").config.url.startsWith("https://xsso.riotgames.com/login?") && node("n_goto_login").config.url.includes("product_id=convergencefest"), "fallback authentication uses Riot's live Convergence XSSO client");
ok(node("n_consent").config.script.includes("onetrust-accept-btn-handler") && node("n_consent").config.script.includes("Close this consent banner") && node("n_consent").config.script.includes("osano-cm-button"), "cookie handler covers Riot, OneTrust, and Convergence's Osano banner");
for (const id of ["n_probe_reg", "n_probe_auth", "n_probe_result"]) {
  ok(node(id).config.script.includes("rotate proxy immediately"), `${id} rotates immediately on Riot's block page`);
}
ok(node("n_probe_auth").config.script.includes("RiotBar-RsoModal") && node("n_probe_auth").config.script.includes("cta-primary"), "authentication completes Convergence's two-click Riot sign-in handoff");
ok(node("n_probe_auth").config.script.includes("The CAPTCHA selection was invalid") && node("n_probe_auth").config.script.includes("(no retry)"), "invalid CAPTCHA fails immediately without a stale retry");
ok(!node("n_probe_auth").config.script.includes("Your username or password may be incorrect"), "request-only proxy-reputation message is absent from browser entry");
ok(node("n_click_item").config.selector.includes('label[for="TICKET001"]'), "entry selects the 3-Day Convergence attendee pass");
ok(node("n_probe_reg").config.script.includes("registration successful") && node("n_probe_result").config.script.includes("thanks for registering for the convergence fest"), "the Convergence success page is recognized even when it has no success CTA");
ok(node("n_probe_result").config.script.includes("return 'captcha'") && node("n_solve_entry_vision").kind === "captcha.solveVision", "registration CAPTCHA challenges are solved before confirmation polling resumes");
ok(edge("n_br_res_done", "false", "n_br_res_captcha") && edge("n_br_res_captcha", "true", "n_log_entry_captcha") && edge("n_dwell_entry_captcha", "next", "n_probe_result"), "registration CAPTCHA branch returns to confirmation polling");
ok(node("n_inventory").config.site === "convergencefest.riotgames.com" && node("n_inventory").config.notes.includes("campaign 30") && node("n_inventory").config.notes.includes("TICKET001"), "Inventory records the Convergence campaign and item");
ok(node("n_result_skip").config.value.suppressSuccessWebhook === true, "local already-entered skip suppresses generic success webhook");
ok(node("n_result").config.value.suppressSuccessWebhook === true, "terminal result suppresses duplicate generic success webhook");
ok(node("n_webhook_success").config.data.proxy === "{{proxy.label}}", "new-entry webhook includes the concrete proxy label");
ok(edge("n_br_success_webhook", "true", "n_webhook_success") && edge("n_br_success_webhook", "false", "n_result"), "only a newly submitted entry reaches the success webhook");
ok(!JSON.stringify(graph).includes("playriftbound.com") && !JSON.stringify(graph).includes("RB3864-00-00") && !JSON.stringify(entry).includes("Riftbound"), "Riftbound-specific runtime configuration was removed");
