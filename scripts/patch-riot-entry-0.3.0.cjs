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

if (!entry) throw new Error("riot-entry is missing from manifest.json");
if (graph.metadata.id !== "riot-entry") throw new Error("unexpected task id");
const node = (id) => {
  const value = graph.nodes.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`missing node ${id}`);
  return value;
};

const addSuccessTextProbes = () => {
  const successNeedle = "  if(document.querySelector('[data-testid=\"product-selection-card\"][data-state=\"registered\"]')||\n     pick('[data-testid=\"success-primary-cta\"]'))return 'registered';";
  const successReplacement = "  if(document.querySelector('[data-testid=\"product-selection-card\"][data-state=\"registered\"]')||\n     pick('[data-testid=\"success-primary-cta\"]')||\n     /registration successful|thanks for registering for the convergence fest/i.test(text(document.querySelector('[data-testid=\"product-registration\"]'))))return 'registered';";
  for (const id of ["n_probe_reg", "n_probe_result"]) {
    const probe = node(id).config.script;
    if (probe.includes("thanks for registering for the convergence fest")) continue;
    if (!probe.includes(successNeedle)) throw new Error(`${id} success probe shape changed`);
    node(id).config.script = probe.replace(successNeedle, successReplacement);
  }
};

if (graph.version === "0.3.0" && entry.version === "0.3.0") {
  addSuccessTextProbes();
  fs.writeFileSync(taskPath, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log("Refreshed Convergence Fest success-state detection");
  process.exit(0);
}
if (graph.version !== "0.2.11" || entry.version !== "0.2.11") {
  throw new Error(`expected riot-entry 0.2.11, found graph=${graph.version} manifest=${entry.version}`);
}

const transformStrings = (value) => {
  if (Array.isArray(value)) return value.map(transformStrings);
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) value[key] = transformStrings(child);
    return value;
  }
  if (typeof value !== "string") return value;
  if (value === "31") return "30";
  return value
    .replaceAll("riot entry campaign 31: OPTED_IN | items RB3864-00-00", "riot entry campaign 30: OPTED_IN | items TICKET001")
    .replaceAll("Riftbound T1 Signature Edition", "Convergence Fest Fan First Access")
    .replaceAll("RB3864-00-00", "TICKET001")
    .replaceAll("campaign 31", "campaign 30")
    .replaceAll("Riftbound", "Convergence Fest")
    .replaceAll("playriftbound.com/en-us/preorder/registration/", "convergencefest.riotgames.com/en-us/tickets/")
    .replaceAll("playriftbound.com", "convergencefest.riotgames.com");
};

transformStrings(graph);

const description = "Signs eligible saved or manually supplied riotgames.com accounts into Riot and registers them for Convergence Fest Attendee Pass Fan First Access (campaign 30, item TICKET001). Users can select all eligible saved accounts, choose an email list, or paste transient username:password credentials (optionally username:password:email for MFA). The browser flow clears Riot and Osano cookie prompts before sign-in, handles Convergence Fest's two-step Riot sign-in modal, rotates immediately when Riot blocks a proxy, fails fast on an invalid CAPTCHA selection, handles email MFA and interactive login or registration CAPTCHA challenges, selects the 3-Day Attendee Pass, accepts the legal acknowledgment, and records the confirmed entry. Only a newly submitted entry emits a success webhook, including the exact proxy used; already-entered accounts are recorded without a duplicate success notification.";

bundle.exportedAt = "2026-08-18T00:00:00.000Z";
graph.version = "0.3.0";
graph.metadata.name = "Riot Entry - Convergence Fest (Browser)";
graph.metadata.description = description;
graph.metadata.tags = ["riot", "convergence-fest", "tickets", "entry", "raffle"];
graph.metadata.inputs.find((input) => input.id === "saveFolder").hint = "Names this run's Inventory rows. Entered accounts keep whichever Database folder they are already in.";
graph.metadata.inputs.find((input) => input.id === "recheckEntered").hint = "Off: an account already marked as entered for this campaign is skipped without opening a browser. On: open the page and confirm with Riot instead.";

entry.name = graph.metadata.name;
entry.description = description;
entry.version = graph.version;
entry.tags = [...graph.metadata.tags];
entry.publishedAt = "2026-08-18";
entry.accountSource.enteredMarker = "riot entry campaign 30: OPTED_IN | items TICKET001";

node("n_goto_reg").config.url = "https://convergencefest.riotgames.com/en-us/tickets/";
node("n_goto_login").config.url = "https://xsso.riotgames.com/login?uri=https%3A%2F%2Fconvergencefest.riotgames.com%2Fen-us%2Ftickets%2F&product_id=convergencefest&locale=en_US";
node("n_click_item").config.selector = "label[for=\"TICKET001\"], [data-testid=\"product-selection-card\"] label, [data-testid=\"product-selection-card\"] button:text-is(\"SELECT\"), button:text-is(\"SELECT\")";
node("n_inventory").config.site = "convergencefest.riotgames.com";
node("n_inventory").config.productUrl = "https://convergencefest.riotgames.com/en-us/tickets/";

const authProbe = node("n_probe_auth").config.script;
const oldHostProbe = "  var host=location.hostname;\n  if(host.indexOf('convergencefest.riotgames.com')!==-1&&host.indexOf('xsso.')===-1)return 'registration';";
const newHostProbe = `  var host=location.hostname;
  // Convergence Fest opens RiotBar's RSO chooser first. Click its exact primary
  // Sign In control, then let the normal auth probe observe the redirected page.
  if(host==='convergencefest.riotgames.com'){
    var modal=document.querySelector('[data-testid="RiotBar-RsoModal"], [data-testid="lightbox"]');
    var modalSignIn=modal&&modal.querySelector('[data-testid="cta-primary"]');
    if(visible(modal)&&visible(modalSignIn)&&/^sign[ -]?in$/i.test(text(modalSignIn))){
      try{HTMLElement.prototype.click.call(modalSignIn);}catch(clickError){modalSignIn.click();}
      return 'wait';
    }
    return 'registration';
  }`;
if (!authProbe.includes(oldHostProbe)) throw new Error("auth host probe shape changed");
node("n_probe_auth").config.script = authProbe.replace(oldHostProbe, newHostProbe);

const consent = node("n_consent").config.script;
node("n_consent").config.script = consent
  .replace(
    "'#consent_blackbar',",
    "'#consent_blackbar','.osano-cm-dialog:not(.osano-cm-dialog--hidden)',"
  )
  .replace(
    "var preferred=['#onetrust-reject-all-handler',",
    "var preferred=['button[aria-label=\"Close this consent banner\"]','.osano-cm-button--type_deny','.osano-cm-button--type_accept','#onetrust-reject-all-handler',"
  );
if (!node("n_consent").config.script.includes("Close this consent banner")) {
  throw new Error("failed to add Osano cookie handling");
}

const resultProbe = node("n_probe_result");
const resultNeedle = "  if(/sorry,?\\s+you have been blocked/i.test(pageText))\n    throw new Error('Riot blocked this proxy: Sorry, you have been blocked - rotate proxy immediately.');";
const resultReplacement = `${resultNeedle}
  if(/the captcha selection was invalid\\.?\\s*please try again\\.?/i.test(pageText))
    return 'error:The CAPTCHA selection was invalid. Please try again.';
  var frames=document.querySelectorAll('iframe[src*="hcaptcha.com"]');
  for(var f=0;f<frames.length;f++){
    if(visible(frames[f])&&/challenge/i.test(frames[f].title||''))return 'captcha';
  }`;
if (!resultProbe.config.script.includes(resultNeedle)) throw new Error("result probe shape changed");
resultProbe.config.script = resultProbe.config.script.replace(resultNeedle, resultReplacement);

const basePosition = { x: 1800, y: 2100 };
graph.nodes.push(
  { id: "n_br_res_captcha", kind: "branch", position: { ...basePosition }, config: { left: "{{entryResult}}", op: "==", right: "captcha" } },
  { id: "n_log_entry_captcha", kind: "log", position: { x: 2000, y: 2100 }, config: { level: "warn", message: "Convergence Fest showed an interactive registration hCaptcha for {{account.username}} - solving it in-page with Scrolls Solver." } },
  { id: "n_try_entry_solve", kind: "tryCatch", position: { x: 2200, y: 2100 }, config: {} },
  { id: "n_solve_entry_vision", kind: "captcha.solveVision", position: { x: 2400, y: 2100 }, config: { timeoutMs: 180000, maxRounds: 8, into: "entryCaptchaToken" } },
  { id: "n_br_entry_solve_err", kind: "branch", position: { x: 2600, y: 2100 }, config: { left: "{{WAS_ERROR}}", op: "truthy" } },
  { id: "n_tick_entry_captcha", kind: "math.incVar", position: { x: 2800, y: 2100 }, config: { name: "entryCaptchaRounds", current: "{{entryCaptchaRounds}}", by: 1 } },
  { id: "n_br_entry_captcha_max", kind: "branch", position: { x: 3000, y: 2100 }, config: { left: "{{entryCaptchaRounds}}", op: ">", right: 2 } },
  { id: "n_fail_entry_captcha", kind: "fail", position: { x: 3200, y: 2000 }, config: { message: "Convergence Fest kept showing a registration captcha for {{account.username}}. (no retry)" } },
  { id: "n_dwell_entry_captcha", kind: "dwell", position: { x: 3200, y: 2200 }, config: { ms: 6000 } }
);

const doneFalse = graph.edges.find((edge) => edge.from === "n_br_res_done" && edge.fromPort === "false");
if (!doneFalse || doneFalse.to !== "n_br_res_err") throw new Error("result edge shape changed");
doneFalse.to = "n_br_res_captcha";
doneFalse.id = "e_br_res_done__captcha";
graph.edges.push(
  { id: "e_br_res_captcha__true", from: "n_br_res_captcha", fromPort: "true", to: "n_log_entry_captcha" },
  { id: "e_br_res_captcha__false", from: "n_br_res_captcha", fromPort: "false", to: "n_br_res_err" },
  { id: "e_log_entry_captcha__next", from: "n_log_entry_captcha", fromPort: "next", to: "n_try_entry_solve" },
  { id: "e_try_entry_solve__loop", from: "n_try_entry_solve", fromPort: "loop", to: "n_solve_entry_vision" },
  { id: "e_try_entry_solve__exit", from: "n_try_entry_solve", fromPort: "exit", to: "n_br_entry_solve_err" },
  { id: "e_br_entry_solve_err__true", from: "n_br_entry_solve_err", fromPort: "true", to: "n_tick_entry_captcha" },
  { id: "e_br_entry_solve_err__false", from: "n_br_entry_solve_err", fromPort: "false", to: "n_tick_entry_captcha" },
  { id: "e_tick_entry_captcha__next", from: "n_tick_entry_captcha", fromPort: "next", to: "n_br_entry_captcha_max" },
  { id: "e_br_entry_captcha_max__true", from: "n_br_entry_captcha_max", fromPort: "true", to: "n_fail_entry_captcha" },
  { id: "e_br_entry_captcha_max__false", from: "n_br_entry_captcha_max", fromPort: "false", to: "n_dwell_entry_captcha" },
  { id: "e_dwell_entry_captcha__next", from: "n_dwell_entry_captcha", fromPort: "next", to: "n_probe_result" }
);

addSuccessTextProbes();
fs.writeFileSync(taskPath, `${JSON.stringify(bundle, null, 2)}\n`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log("Patched riot-entry browser task to Convergence Fest v0.3.0");
