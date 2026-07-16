const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.join(__dirname, "..", "tasks", "la28-entry.arcana-task.json");
const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const graph = bundle.graph;
const guard = graph.nodes.find((node) => node.id === "n_la28guard");
const privacyGate = graph.nodes.find((node) => node.id === "n_la28privacygate");
const privacyBranch = graph.nodes.find((node) => node.id === "n_la28privacybranch");
const privacyClick = graph.nodes.find((node) => node.id === "n_la28privacyclick");
const privacyVerify = graph.nodes.find((node) => node.id === "n_la28privacyverify");
const legalExact = graph.nodes.find((node) => node.id === "n_la28legalexact");
const legal = graph.nodes.find((node) => node.id === "n_la28legal");
const stateNode = graph.nodes.find((node) => node.id === "n_la28statevisible");
const waitBranch = graph.nodes.find((node) => node.id === "n_la28queuewait");
const presence = graph.nodes.find((node) => node.id === "n_la28presence");
const queuePoll = graph.nodes.find((node) => node.id === "n_la28queuepoll");
const profileBranch = graph.nodes.find((node) => node.id === "n_la28queueprofile");
const authState = graph.nodes.find((node) => node.id === "n_la28authstate");
const authProfile = graph.nodes.find((node) => node.id === "n_la28authprofile");
const authOtp = graph.nodes.find((node) => node.id === "n_la28authotp");
const authCaptcha = graph.nodes.find((node) => node.id === "n_la28authcaptcha");
const authWait = graph.nodes.find((node) => node.id === "n_la28authwait");
const saveAccount = graph.nodes.find((node) => node.id === "n_la28saveacct");

assert.equal(graph.version, "1.0.4");
assert.equal(privacyGate?.kind, "evaluate");
assert.equal(privacyGate?.config?.into, "la28PrivacyPresent");
assert.equal(privacyBranch?.kind, "branch");
assert.equal(privacyClick?.kind, "click");
assert.equal(privacyClick?.config?.selector, "#cmpwelcomebtnyes > a");
assert.equal(privacyVerify?.kind, "evaluate");
assert.equal(legalExact?.kind, "evaluate");
assert.match(legalExact?.config?.script ?? "", /#cmpwelcomebtnyes > a/);
assert.equal(legal?.kind, "evaluate");
assert.match(legal?.config?.script ?? "", /legal terms and privacy/i);
assert.equal(stateNode?.kind, "evaluate");
assert.equal(stateNode?.config?.into, "la28QueueState");
assert.equal(guard?.kind, "evaluate");
assert.equal(guard?.config?.into, "la28QueueState");
assert.equal(waitBranch?.kind, "branch");
assert.equal(waitBranch?.config?.left, "{{la28QueueState}}");
assert.equal(waitBranch?.config?.right, "wait");
assert.equal(presence?.kind, "evaluate");
assert.match(presence?.config?.script ?? "", /#buttonConfirmVisitorPresence/);
assert.equal(queuePoll?.kind, "dwell");
assert.equal(queuePoll?.config?.ms, 5000);
assert.equal(profileBranch?.kind, "branch");
assert.equal(profileBranch?.config?.left, "{{la28QueueState}}");
assert.equal(profileBranch?.config?.right, "profile");
assert.equal(authState?.kind, "evaluate");
assert.equal(authState?.config?.into, "capState");
assert.match(authState?.config?.script ?? "", /elapsed time alone/);
assert.equal(authProfile?.config?.right, "profile");
assert.equal(authOtp?.config?.right, "otp");
assert.equal(authCaptcha?.config?.right, "captcha");
assert.equal(authWait?.kind, "dwell");
assert.equal(authWait?.config?.ms, 5000);
assert.equal(saveAccount?.kind, "accounts.save");
assert.equal(saveAccount?.config?.password, "{{identity.password}}");
assert.equal(saveAccount?.config?.label, graph.metadata.name);

const edge = (from, port, to) => graph.edges.some(
  (item) => item.from === from && item.fromPort === port && item.to === to,
);
assert.ok(edge("n_la28access", "next", "n_la28privacyclick"));
assert.ok(edge("n_la28privacygate", "next", "n_la28privacybranch"));
assert.ok(edge("n_la28privacybranch", "true", "n_la28privacyclick"));
assert.ok(edge("n_la28privacybranch", "false", "n_la28statevisible"));
assert.ok(edge("n_la28privacyclick", "next", "n_la28privacyverify"));
assert.ok(edge("n_la28privacyverify", "next", "n_la28statevisible"));
assert.ok(edge("n_la28statevisible", "next", "n_la28queuewait"));
assert.ok(edge("n_la28queuewait", "true", "n_la28presence"));
assert.ok(edge("n_la28presence", "next", "n_la28queuepoll"));
assert.ok(edge("n_la28queuepoll", "next", "n_la28statevisible"));
assert.ok(edge("n_la28queuewait", "false", "n_la28queueprofile"));
assert.ok(edge("n_la28queueprofile", "true", "n_la28checkbox"));
assert.ok(edge("n_la28queueprofile", "false", "n_6iphto3c"));
assert.ok(edge("n_aiitnmxf", "next", "n_la28authstate"));
assert.ok(edge("n_la28authstate", "next", "n_la28authprofile"));
assert.ok(edge("n_la28authprofile", "true", "n_la28checkbox"));
assert.ok(edge("n_la28authprofile", "false", "n_la28authotp"));
assert.ok(edge("n_la28authotp", "true", "n_1z4bw39i"));
assert.ok(edge("n_la28authotp", "false", "n_la28authcaptcha"));
assert.ok(edge("n_la28authcaptcha", "true", "n_la28capsolve"));
assert.ok(edge("n_la28authcaptcha", "false", "n_la28authwait"));
assert.ok(edge("n_la28authwait", "next", "n_la28authstate"));
assert.ok(edge("n_la28relogin", "next", "n_la28authstate"));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runState = new AsyncFunction(
  "document",
  "location",
  "getComputedStyle",
  stateNode.config.script,
);
const runPresence = new AsyncFunction(
  "document",
  "getComputedStyle",
  presence.config.script,
);
const runLegal = new AsyncFunction(
  "document",
  "getComputedStyle",
  legal.config.script,
);
const runLegalExact = new AsyncFunction(
  "document",
  "getComputedStyle",
  legalExact.config.script,
);
const runPrivacyGate = new AsyncFunction(
  "document",
  "getComputedStyle",
  privacyGate.config.script,
);
const runAuthState = new AsyncFunction(
  "document",
  "location",
  "getComputedStyle",
  authState.config.script,
);

function visibleElement(onClick, text = "") {
  const target = {
    innerText: text,
    textContent: text,
    value: "",
    getBoundingClientRect: () => ({ width: 24, height: 24 }),
    getAttribute: () => "",
    scrollIntoView: () => {},
    click: () => onClick?.(),
    closest: () => target,
  };
  return target;
}

async function scenario({ initial, proceed = false, keepAlive = false }) {
  const state = initial;
  let proceedClicks = 0;
  let keepAliveClicks = 0;
  const loginUser = visibleElement();
  const loginPassword = visibleElement();
  const hiddenTemplate = {
    ...visibleElement(),
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
  };
  const profile = visibleElement();
  const proceedElement = visibleElement(() => { proceedClicks += 1; });
  const keepAliveButton = visibleElement(() => { keepAliveClicks += 1; }, "CONFIRM");

  const document = {
    get title() {
      if (state === "profile") return "Profile - Official LA28 Tickets";
      if (state === "blocked") return "Restricted Access";
      return state === "queue" ? "Queue-it Waiting Room" : "Official LA28 Tickets";
    },
    body: {
      get innerText() {
        if (state === "blocked") return "Your access has been restricted";
        if (state === "queue" && keepAlive) {
          return "Don't lose your spot! Please confirm you're still here so you don't lose your position in the queue. CONFIRM";
        }
        if (state === "queue") return "You are now in line. Estimated wait time";
        return "";
      },
    },
    querySelector(selector) {
      if (state === "queue" && keepAlive && selector === "#buttonConfirmVisitorPresence") return keepAliveButton;
      if (state === "queue" && proceed && selector === 'a[href*="/mycustomerdata"]') return proceedElement;
      if (state === "login" && selector === 'input[name="username"]') return loginUser;
      if (state === "login" && selector.includes('input[type="password"]')) return loginPassword;
      if (state === "profile" && selector === "app-sports-profile-lotteries") return profile;
      return null;
    },
    querySelectorAll(selector) {
      // Gigya places hidden template fields before the live form. The state
      // detector must continue through all matches to find the visible pair.
      if (state === "login" && selector === 'input[name="username"]') {
        return [hiddenTemplate, loginUser];
      }
      if (state === "login" && selector.includes('input[type="password"]')) {
        return [hiddenTemplate, loginPassword];
      }
      if (state === "profile" && selector === "app-sports-profile-lotteries") return [profile];
      if (state === "queue" && keepAlive && selector === "#buttonConfirmVisitorPresence") {
        return [keepAliveButton];
      }
      if (state === "queue" && proceed && selector === 'a[href*="/mycustomerdata"]') {
        return [proceedElement];
      }
      if (selector === "button,a,[role=button]") {
        if (state === "queue" && keepAlive) return [keepAliveButton];
        if (state === "queue" && proceed) return [proceedElement];
      }
      return [];
    },
    evaluate() {
      return { singleNodeValue: proceed && state === "queue" ? proceedElement : null };
    },
  };
  const location = {
    get href() {
      if (state === "blocked") return "https://next.tickets.la28.org/queue/error403";
      if (state === "queue") return "https://queue-it.net/waitingroom";
      if (state === "profile") return "https://tickets.la28.org/mycustomerdata/";
      return "https://public-api.eventim.com/login";
    },
  };
  const result = await runState(
    document,
    location,
    () => ({ visibility: "visible", display: "block", opacity: "1" }),
  );
  return { result, proceedClicks, keepAliveClicks };
}

(async () => {
  let privacyClicks = 0;
  const privacyAnchor = visibleElement(() => { privacyClicks += 1; });
  const privacyResult = await runPrivacyGate(
    {
      querySelector: (selector) => {
        return selector === "#cmpwelcomebtnyes > a" || selector === "#cmpwelcomebtnyes"
          ? privacyAnchor
          : null;
      },
    },
    () => ({ visibility: "visible", display: "block", opacity: "1" }),
  );
  assert.equal(privacyResult, "1");
  assert.equal(privacyClicks, 0);

  let exactClicks = 0;
  const exactAnchor = visibleElement(() => { exactClicks += 1; });
  const exactResult = await runLegalExact(
    { querySelector: (selector) => selector === "#cmpwelcomebtnyes > a" ? exactAnchor : null },
    () => ({ visibility: "visible", display: "block" }),
  );
  assert.equal(exactResult, "clicked");
  assert.equal(exactClicks, 1);

  let legalClicks = 0;
  const continueButton = visibleElement(() => { legalClicks += 1; }, "CONTINUE");
  const legalResult = await runLegal(
    {
      body: { innerText: "Legal Terms and Privacy Terms & Conditions Privacy Policy CONTINUE" },
      querySelectorAll: (selector) => {
        if (selector === "*" || selector === "iframe") return [];
        return [continueButton];
      },
    },
    () => ({ visibility: "visible", display: "block", opacity: "1" }),
  );
  assert.equal(legalResult, "clicked");
  assert.equal(legalClicks, 1);

  let directClicks = 0;
  const directButton = visibleElement(() => { directClicks += 1; }, "CONTINUE");
  const directResult = await runPresence(
    { querySelector: (selector) => selector === "#buttonConfirmVisitorPresence" ? directButton : null },
    () => ({ visibility: "visible", display: "block" }),
  );
  assert.equal(directResult, "clicked");
  assert.equal(directClicks, 1);

  assert.equal((await scenario({ initial: "login" })).result, "login");
  assert.equal((await scenario({ initial: "profile" })).result, "profile");

  const queued = await scenario({ initial: "queue" });
  assert.equal(queued.result, "wait");

  const proceed = await scenario({ initial: "queue", proceed: true });
  assert.equal(proceed.result, "wait");
  assert.equal(proceed.proceedClicks, 1);

  const keepAlive = await scenario({ initial: "queue", keepAlive: true });
  assert.equal(keepAlive.result, "wait");
  assert.equal(keepAlive.keepAliveClicks, 1);

  assert.equal((await scenario({ initial: "unknown" })).result, "wait");

  async function authScenario(mode) {
    const profile = visibleElement();
    const otp = visibleElement();
    const error = visibleElement(undefined, mode === "invalid" ? "Invalid login credentials" : "Please confirm you are not a robot");
    error.className = mode === "captcha"
      ? "gigya-error-msg-active gigya-error-code-401020"
      : "gigya-error-msg-active gigya-error-code-403042";
    const document = {
      title: mode === "profile" ? "Profile - Official LA28 Tickets" : "LA28ID Account | Login",
      querySelectorAll(selector) {
        if (mode === "profile" && selector === "app-sports-profile-lotteries") return [profile];
        if (mode === "otp" && selector === "input#gigya-textbox-code") return [otp];
        if ((mode === "captcha" || mode === "invalid") && selector.includes("gigya-error-msg-active")) return [error];
        return [];
      },
    };
    return runAuthState(
      document,
      { href: mode === "profile" ? "https://tickets.la28.org/mycustomerdata/" : "https://la28id.la28.org/login/" },
      () => ({ visibility: "visible", display: "block", opacity: "1" }),
    );
  }

  assert.equal((await authScenario("wait")).state, "wait");
  assert.equal((await authScenario("profile")).state, "profile");
  assert.equal((await authScenario("otp")).state, "otp");
  assert.equal((await authScenario("captcha")).state, "captcha");
  await assert.rejects(() => authScenario("invalid"), /LA28 login failed: Invalid login credentials/);

  await assert.rejects(
    () => scenario({ initial: "blocked" }),
    /LA28 blocked \(Akamai\/Queue-it\)/,
  );

  console.log("LA28 Entry queue-state tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
