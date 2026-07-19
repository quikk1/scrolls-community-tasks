const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const generator = JSON.parse(fs.readFileSync(path.join(root, "tasks", "la28.arcana-task.json"), "utf8")).graph;
const entry = JSON.parse(fs.readFileSync(path.join(root, "tasks", "la28-entry.arcana-task.json"), "utf8")).graph;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

const node = (graph, id) => graph.nodes.find((candidate) => candidate.id === id);
const edge = (from, port, to) => generator.edges.some(
  (candidate) => candidate.from === from && candidate.fromPort === port && candidate.to === to,
);

assert.equal(generator.version, "1.1.8");
assert.equal(manifest.tasks.find((task) => task.id === "la28")?.version, generator.version);

for (const [id, level, message] of [
  ["n_la28logqueue", "info", /waiting room/i],
  ["n_la28logregister", "info", /registration form/i],
  ["n_la28logsubmitwait", "info", /verification screen/i],
  ["n_la28logretry", "warn", /retrying/i],
  ["n_la28logotp", "info", /email code/i],
  ["n_la28logprofile", "info", /saving the account/i],
]) {
  assert.equal(node(generator, id)?.kind, "log", `${id} should use the 1.3.14-compatible log node`);
  assert.equal(node(generator, id)?.config?.level, level);
  assert.match(node(generator, id)?.config?.message ?? "", message);
}

for (const id of ["n_la28queuecaptcha", "n_la28statevisible", "n_la28presence"]) {
  assert.equal(node(generator, id)?.config?.script, node(entry, id)?.config?.script, `${id} should match LA28 Entry`);
}

assert.equal(node(generator, "n_la28queuewait")?.config?.right, "wait");
assert.equal(node(generator, "n_la28queueprofile")?.config?.right, "profile");
assert.match(node(generator, "n_la28queueprofilefail")?.config?.message ?? "", /fresh browser session/i);

assert.ok(edge("n_la28consent", "next", "n_la28logqueue"));
assert.ok(edge("n_la28logqueue", "next", "n_la28queuecaptcha"));
assert.ok(edge("n_la28queuecaptcha", "next", "n_la28statevisible"));
assert.ok(edge("n_la28statevisible", "next", "n_la28queuewait"));
assert.ok(edge("n_la28queuewait", "true", "n_la28presence"));
assert.ok(edge("n_la28presence", "next", "n_la28queuepoll"));
assert.ok(edge("n_la28queuepoll", "next", "n_la28queuecaptcha"));
assert.ok(edge("n_la28queuewait", "false", "n_la28queueprofile"));
assert.ok(edge("n_la28queueprofile", "true", "n_la28queueprofilefail"));
assert.ok(edge("n_la28queueprofile", "false", "n_la28logregister"));
assert.ok(edge("n_la28logregister", "next", "n_4snf2wqx"));

const submitState = node(generator, "n_la28submitstate");
assert.equal(submitState?.config?.into, "la28SubmitState");
assert.match(submitState?.config?.script ?? "", /visible otp field/i);
assert.match(submitState?.config?.script ?? "", /attempts<2/);
assert.equal(node(generator, "n_la28submitotp")?.config?.right, "otp");
assert.equal(node(generator, "n_la28submitretry")?.config?.right, "retry");
assert.equal(node(generator, "n_la28submitprofile")?.config?.right, "profile");
assert.ok(edge("n_rrs4vtxn", "next", "n_la28logsubmitwait"));
assert.ok(edge("n_la28logsubmitwait", "next", "n_la28submitstate"));
assert.ok(edge("n_la28submitstate", "next", "n_la28submitotp"));
assert.ok(edge("n_la28submitotp", "true", "n_la28logotp"));
assert.ok(edge("n_la28logotp", "next", "n_1z4bw39i"));
assert.ok(edge("n_la28submitotp", "false", "n_la28submitretry"));
assert.ok(edge("n_la28submitretry", "true", "n_la28logretry"));
assert.ok(edge("n_la28logretry", "next", "n_la28submitretryclick"));
assert.ok(edge("n_la28submitretryclick", "next", "n_la28submitstate"));
assert.ok(edge("n_la28submitretry", "false", "n_la28submitprofile"));
assert.ok(edge("n_la28submitprofile", "true", "n_la28logprofile"));
assert.ok(edge("n_la28logprofile", "next", "n_chlvu159"));
assert.ok(edge("n_la28submitprofile", "false", "n_la28submitfail"));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function submitScenario(mode, attempts = 1) {
  const visible = {
    textContent: "",
    getBoundingClientRect: () => ({ width: 100, height: 30 }),
  };
  const document = {
    title: mode === "profile" ? "Profile - Official LA28 Tickets" : "LA28 Registration",
    querySelectorAll(selector) {
      if (mode === "otp" && /gigya-textbox-code|otp-update-form/.test(selector)) return [visible];
      if (mode === "register" && /register-site-login|gigya-register-form/.test(selector)) return [visible];
      return [];
    },
  };
  const script = submitState.config.script
    .replace("{{la28SubmitState.attempts}}", String(attempts))
    .replace("Date.now()+45000", "Date.now()+0");
  const run = new AsyncFunction("document", "location", "getComputedStyle", "setTimeout", script);
  return run(
    document,
    { href: mode === "profile" ? "https://tickets.la28.org/mycustomerdata/" : "https://la28id.la28.org/register/" },
    () => ({ visibility: "visible", display: "block", opacity: "1" }),
    (callback) => callback(),
  );
}

(async () => {
  assert.equal((await submitScenario("otp")).state, "otp");
  assert.equal((await submitScenario("profile")).state, "profile");
  assert.deepEqual(await submitScenario("register", 1), { state: "retry", attempts: 2 });
  await assert.rejects(() => submitScenario("register", 2), /did not reach the email verification screen after 2 attempt/);
  console.log("LA28 generator queue tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
