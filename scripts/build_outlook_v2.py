import json, io, collections

# Build the fluent=2 (outlook.live.com/mail/?prompt=create_account) flow with
# selectors verified live against signup.live.com/signup?...&fluent=2.
# Order verified by driving the real page on 2026-09-30:
#   email + domain dropdown -> password -> country + DOB -> names -> captcha -> backup email -> landing

P = r"D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json"

def N(i, k, x, y, cfg):
    return {"id": i, "kind": k, "position": {"x": x, "y": y}, "config": cfg}

def C(i, x, y, text):
    return N(i, "comment", x, y, {"text": text})

NEXT = 'button[data-testid="primaryButton"]:visible'

# Resilient primary-Next click used where a strict ":visible" engine click can
# wait out its timeout on a disabled-while-validating or re-rendering button.
# Polls for any visible, ENABLED submit control and clicks it.
def resilient_next_script(label):
    return (
        "// Click the " + label + " page's primary Next, tolerating a\n"
        "// disabled->enabled transition and re-renders. Polls for any visible,\n"
        "// enabled submit control (testid primaryButton, type=submit, or a\n"
        "// button labelled Next/Continue/etc).\n"
        "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
        "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
        "function findNext(){\n"
        "  var cands = document.querySelectorAll(\"button[data-testid='primaryButton'], button[type='submit'], input[type='submit'], button\");\n"
        "  for (var i=0;i<cands.length;i++){var b=cands[i];if(!vis(b))continue;var dis=b.disabled||b.getAttribute('aria-disabled')==='true';var t=((b.innerText||b.value||'')+'').trim();var tid=b.getAttribute('data-testid')||'';if(dis)continue;if(tid==='primaryButton'||b.type==='submit'||/^(next|continue|submit|sign up|create account)$/i.test(t))return b;}\n"
        "  return null;\n"
        "}\n"
        "var deadline = Date.now() + 60000;\n"
        "while (Date.now() < deadline) {\n"
        "  if (/account creation has been blocked/i.test((document.title||'')+' '+(document.body&&document.body.innerText||''))) throw new Error('Account creation blocked at " + label + " step');\n"
        "  var b = findNext();\n"
        "  if (b) { try { b.scrollIntoView({block:'center'}); } catch(e){} await sleep(200); b.click(); return 'clicked'; }\n"
        "  await sleep(400);\n"
        "}\n"
        "throw new Error('" + label + " Next button never became clickable');"
    )

nodes = []
edges = []
eid = [0]
def E(frm, to, port="next"):
    eid[0] += 1
    edges.append({"id": "e%d" % eid[0], "from": frm, "fromPort": port, "to": to})

# ---- start (must be nodes[0] - the validator treats it as the entry node) ----
nodes.append(N("n_start", "noop", 40, 0, {}))

# ---- comments ----
nodes += [
    C("n_c_prep", -260, 120, "Identity prep: local part, full email, domain, DOB parts, country"),
    C("n_c_nav", -260, 420, "Navigate to create_account (fluent=2) + load gate"),
    C("n_c_email", -260, 700, "Email + domain dropdown + Next"),
    C("n_c_pw", -260, 900, "Password + Next"),
    C("n_c_geo", -260, 1120, "Country + DOB (Fluent dropdowns + year input) + Next"),
    C("n_c_names", -260, 1360, "First/last name + Next"),
    C("n_c_captcha", -260, 1600, "Arkose blob hook + FunCaptcha solve + token submit"),
    C("n_c_finish", -260, 1860, "Backup email / landing / dismiss / save / warm-up"),
]

E("n_start", "n_prep")

prep_script = (
    "// Build the identity pieces the form needs. Like solar2, we GENERATE the\n"
    "// email local part ourselves (human-looking: first+last+random digits) rather\n"
    "// than asking for an address - a generator mints its own usernames. Names and\n"
    "// password come from the SDK identity; domain rotates over solar2's regional\n"
    "// table unless hotmailDomain is set. identity.* / addresses.0.* come from the\n"
    "// scrolls SDK runtime.\n"
    "function rnd(n){ return Math.floor(Math.random() * n); }\n"
    "// solar2 GetRandomUsername: mint a human-looking local part. We do NOT inject\n"
    "// the identity name into this script - a name with a quote/apostrophe would\n"
    "// break the JS at parse time (raw {{}} substitution). Build from letter\n"
    "// syllables instead; names are filled separately via safe fill-node values.\n"
    "var syl = [\"an\",\"bel\",\"cor\",\"dan\",\"el\",\"fen\",\"gar\",\"han\",\"iv\",\"jo\",\"ka\",\"li\",\"mar\",\"nor\",\"os\",\"per\",\"qu\",\"ri\",\"sam\",\"tan\",\"ur\",\"vi\",\"wil\",\"ya\",\"zo\"];\n"
    "function word(){ return syl[rnd(syl.length)] + syl[rnd(syl.length)] + (Math.random()<0.5 ? syl[rnd(syl.length)] : \"\"); }\n"
    "var w1 = word(), w2 = word();\n"
    "var digits = String(rnd(900) + 100);\n"
    "var shapes = [\n"
    "  w1 + w2 + digits,\n"
    "  w1 + \".\" + w2 + digits,\n"
    "  w1 + w2.charAt(0) + digits,\n"
    "  w1.charAt(0) + w2 + digits,\n"
    "  w1 + digits + w2\n"
    "];\n"
    "var local = shapes[rnd(shapes.length)];\n"
    "// The live surface only offers a short domain list (e.g. @outlook.com,\n"
    "// @outlook.in, @hotmail.com) - solar2's 12-region table is from an older\n"
    "// surface and must NOT be pre-baked. We just express a preference: hotmail\n"
    "// toggle -> prefer @hotmail.com, else prefer @outlook.com. The domain step\n"
    "// picks from what's actually offered and falls back, never fails.\n"
    "var hotmail = String(\"{{inputs.hotmailDomain}}\").toLowerCase() === \"true\";\n"
    "var wantDom = hotmail ? \"hotmail.com\" : \"outlook.com\";\n"
    "// dob/country are engine-formatted (digits, ISO code) - safe to inline. Strip\n"
    "// anything that could break the literal anyway.\n"
    "var dob = (\"{{identity.dob}}\" || \"\").replace(/[^0-9\\-\\/.]/g, \"\");\n"
    "var y = \"\", m = \"\", d = \"\";\n"
    "var mm = dob.match(/(\\d{4})[-\\/.](\\d{1,2})[-\\/.](\\d{1,2})/);\n"
    "if (mm) { y = mm[1]; m = String(parseInt(mm[2], 10)); d = String(parseInt(mm[3], 10)); }\n"
    "else { var m2 = dob.match(/(\\d{1,2})[-\\/.](\\d{1,2})[-\\/.](\\d{4})/); if (m2) { d = String(parseInt(m2[1], 10)); m = String(parseInt(m2[2], 10)); y = m2[3]; } }\n"
    "if (!y) { y = \"1994\"; m = \"6\"; d = \"15\"; }\n"
    "var months = [\"January\",\"February\",\"March\",\"April\",\"May\",\"June\",\"July\",\"August\",\"September\",\"October\",\"November\",\"December\"];\n"
    "var mNum = Math.min(12, Math.max(1, parseInt(m, 10)));\n"
    "var monthName = months[mNum - 1];\n"
    "var year = parseInt(y, 10); if (year > 2007) year = 1994;\n"
    "return {\n"
    "  emailLocal: local,\n"
    "  wantDomain: wantDom,\n"
    "  month: monthName,\n"
    "  monthNum: String(mNum),\n"
    "  day: String(parseInt(d, 10) || 15),\n"
    "  year: String(year),\n"
    "  country: (\"{{addresses.0.country}}\" || \"\").replace(/[^A-Za-z ]/g, \"\").trim()\n"
    "};"
)
nodes.append(N("n_prep", "evaluate", 40, 120, {"into": "prep", "script": prep_script}))
E("n_prep", "n_s_local")

for nid, name, val, x in [
    ("n_s_local", "emailLocal", "{{prep.emailLocal}}", 230),
    # predicted address for the up-front dedupe; refined to the real picked
    # domain right after the domain step (n_s_full2)
    ("n_s_full", "fullEmail", "{{prep.emailLocal}}@{{prep.wantDomain}}", 390),
    ("n_s_domain", "wantDomain", "{{prep.wantDomain}}", 550),
    ("n_s_dob", "dob", "{{prep.month}}|{{prep.monthNum}}|{{prep.day}}|{{prep.year}}", 710),
    ("n_s_country", "countryPick", "{{prep.country}}", 870),
]:
    nodes.append(N(nid, "setVar", x, 20, {"name": name, "value": val}))
E("n_s_local", "n_s_full"); E("n_s_full", "n_s_domain"); E("n_s_domain", "n_s_dob"); E("n_s_dob", "n_s_country")
E("n_s_country", "n_dup_tc")

# ---- dedupe (tm pattern) ----
nodes.append(N("n_dup_tc", "tryCatch", 40, 220, {}))
E("n_dup_tc", "n_dup", "loop")
nodes.append(N("n_dup", "inventory.pick", 250, 300, {"site": "outlook.com", "email": "{{fullEmail}}", "into": "dupHit"}))
E("n_dup", "n_dup_tc")
E("n_dup_tc", "n_dup_branch", "exit")
nodes.append(N("n_dup_branch", "branch", 470, 300, {"op": "truthy", "left": "{{WAS_ERROR}}"}))
E("n_dup_branch", "n_goto", "true")     # error = not found = proceed
nodes.append(N("n_dup_fail", "fail", 470, 420, {"message": "Already generated - {{fullEmail}} is already in Inventory for outlook.com"}))
E("n_dup_branch", "n_dup_fail", "false")

# ---- navigate + load gate ----
nodes.append(N("n_goto", "goto", 40, 420, {
    "url": "https://outlook.live.com/mail/?prompt=create_account",
    "waitUntil": "domcontentloaded",
    "timeoutMs": 120000
}))
E("n_goto", "n_goto_dwell")
nodes.append(N("n_goto_dwell", "dwell", 240, 420, {"ms": 2500}))
E("n_goto_dwell", "n_gate_tc")

nodes.append(N("n_gate_tc", "tryCatch", 40, 560, {}))
E("n_gate_tc", "n_gate_form", "loop")

gate_script = (
    "// Load gate for the fluent=2 signup surface. The mail app redirects to\n"
    "// signup.live.com/signup?...&fluent=2 and renders 'Create your Microsoft\n"
    "// account'. Wait for the email box or the heading, detect a block/redirect.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "var tries = Number(\"{{gateTries}}\") || 0;\n"
    "var deadline = Date.now() + 45000;\n"
    "while (Date.now() < deadline) {\n"
    "  var t = (document.title || \"\").toLowerCase();\n"
    "  if (t.indexOf(\"blocked\") !== -1) throw new Error(\"Account creation blocked at load - exit IP is flagged\");\n"
    "  if (document.querySelector(\"input[name='email']\")) return { state: \"ready\", tries: 0 };\n"
    "  if (t.indexOf(\"create your microsoft account\") !== -1 || t.indexOf(\"account\") !== -1) {\n"
    "    if (document.querySelector(\"input[name='email'], input[type='email']\")) return { state: \"ready\", tries: 0 };\n"
    "  }\n"
    "  var body = (document.body && (document.body.innerText || \"\"));\n"
    "  if (/unusual activity|temporarily blocked|try again later|verify your identity/i.test(body)) throw new Error(\"Microsoft served a block page - rotate the exit IP\");\n"
    "  await sleep(500);\n"
    "}\n"
    "if (tries >= 1) {\n"
    "  var ti = (document.title || \"\").slice(0, 80); var u = \"\"; try { u = location.href.slice(0, 80); } catch (e) {}\n"
    "  throw new Error(\"create_account page never rendered the email box. title='\" + ti + \"' url=\" + u);\n"
    "}\n"
    "return { state: \"reload\", tries: tries + 1 };"
)
nodes.append(N("n_gate_form", "evaluate", 250, 640, {"into": "gate", "script": gate_script}))
E("n_gate_form", "n_gate_tc")
E("n_gate_tc", "n_gate_branch", "exit")
E("n_gate_tc", "n_gate_rotate", "catch")
nodes.append(N("n_gate_rotate", "log", 250, 800, {"level": "warn", "message": "create_account load failed - retrying once, then the run fails so the engine rotates"}))
E("n_gate_rotate", "n_gate_dead")
nodes.append(N("n_gate_dead", "fail", 470, 800, {"message": "Signup page blocked or connection dead"}))

nodes.append(N("n_gate_branch", "branch", 470, 640, {"op": "==", "left": "{{gate.state}}", "right": "ready"}))
E("n_gate_branch", "n_arm_blob", "true")
nodes.append(N("n_gate_retry", "math.incVar", 470, 720, {"name": "gateTries", "current": "{{gateTries}}", "by": 1}))
E("n_gate_branch", "n_gate_retry", "false")
E("n_gate_retry", "n_goto")

# ---- arm the Arkose blob hook before the challenge can load ----
arm_script = (
    "// Wrap fetch/XHR early and stash the Arkose data[blob] off the POST body.\n"
    "if (!window.__scBlobHooked) {\n"
    "  window.__scBlobHooked = true; window.__arkoseBlob = \"\";\n"
    "  var pick = function (body) { if (!body) return \"\"; try { var s = typeof body === \"string\" ? body : \"\"; var m = s.match(/data%5Bblob%5D=([^&]+)/) || s.match(/data\\[blob\\]=([^&]+)/); return m ? decodeURIComponent(m[1]) : \"\"; } catch (e) { return \"\"; } };\n"
    "  var of = window.fetch;\n"
    "  window.fetch = function (url, opts) { try { if (String(url).indexOf(\"client-api.arkoselabs.com/fc/gt2/public_key/\") !== -1) { var b = pick(opts && opts.body); if (b) window.__arkoseBlob = b; } } catch (e) {} return of.apply(this, arguments); };\n"
    "  var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;\n"
    "  XMLHttpRequest.prototype.open = function (m, u) { this.__scUrl = u; return oo.apply(this, arguments); };\n"
    "  XMLHttpRequest.prototype.send = function (body) { try { if (String(this.__scUrl).indexOf(\"client-api.arkoselabs.com/fc/gt2/public_key/\") !== -1) { var b = pick(body); if (b) window.__arkoseBlob = b; } } catch (e) {} return os.apply(this, arguments); };\n"
    "}\n"
    "return \"armed\";"
)
nodes.append(N("n_arm_blob", "evaluate", 700, 560, {"into": "blobArmed", "script": arm_script}))
E("n_arm_blob", "n_fill_email")

# ---- email + domain ----
nodes.append(N("n_fill_email", "fill", 40, 700, {
    "selector": "input[name='email']:visible", "value": "{{emailLocal}}",
    "speed": "natural", "typos": False, "instant": False, "timeoutMs": 60000
}))
E("n_fill_email", "n_domain")

domain_script = (
    "// Domain is a Fluent dropdown (button#domainDropdownId) whose options are\n"
    "// .fui-Option / [role=option] with text like '@outlook.com'. The live surface\n"
    "// offers only a short list (e.g. @outlook.com, @outlook.in, @hotmail.com), so\n"
    "// we pick from what is ACTUALLY offered: prefer the wanted domain, else fall\n"
    "// back to the first offered option. Never fails on domain. Returns the picked\n"
    "// domain (no @) so the full address is built from reality.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "var want = (\"@\" + ((\"{{wantDomain}}\" || \"outlook.com\").trim().toLowerCase()));\n"
    "var btn = document.querySelector(\"button#domainDropdownId\");\n"
    "if (!btn) return (\"outlook.com\");\n"
    "var cur = (btn.innerText || \"\").trim().toLowerCase();\n"
    "if (cur.indexOf(\"@\") === 0 && cur === want) return cur.slice(1);\n"
    "btn.click();\n"
    "var deadline = Date.now() + 9000; var offered = []; var pickEl = null;\n"
    "while (Date.now() < deadline) {\n"
    "  var opts = document.querySelectorAll(\"[role='option'], .fui-Option\");\n"
    "  offered = []; pickEl = null;\n"
    "  for (var i = 0; i < opts.length; i++) {\n"
    "    var tx = (opts[i].innerText || \"\").trim().toLowerCase();\n"
    "    if (!tx || tx.indexOf(\"@\") !== 0) continue;\n"
    "    offered.push(tx);\n"
    "    if (tx === want) pickEl = opts[i];\n"
    "  }\n"
    "  if (offered.length) break;\n"
    "  await sleep(250);\n"
    "}\n"
    "if (!offered.length) { try { document.body.click(); } catch (e) {} return cur.indexOf(\"@\") === 0 ? cur.slice(1) : \"outlook.com\"; }\n"
    "var chosenTx = pickEl ? want : offered[0];\n"
    "if (!pickEl) {\n"
    "  var all = document.querySelectorAll(\"[role='option'], .fui-Option\");\n"
    "  for (var k = 0; k < all.length; k++) { var t2 = (all[k].innerText || \"\").trim().toLowerCase(); if (t2 === chosenTx) { pickEl = all[k]; break; } }\n"
    "}\n"
    "if (pickEl) pickEl.click();\n"
    "return chosenTx.slice(1);"
)
nodes.append(N("n_domain", "evaluate", 260, 700, {"into": "pickedDomain", "script": domain_script}))
E("n_domain", "n_s_full2")
nodes.append(N("n_s_full2", "setVar", 480, 560, {"name": "fullEmail", "value": "{{emailLocal}}@{{pickedDomain}}"}))
E("n_s_full2", "n_click_email_next")
nodes.append(N("n_click_email_next", "click", 480, 700, {"selector": NEXT, "timeoutMs": 60000}))
E("n_click_email_next", "n_email_err")

# taken-email / advance check
email_err_script = (
    "// After Next on the email step: scan for a taken/invalid error, else confirm\n"
    "// we reached the password box.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "// Reaching the password box = the email was ACCEPTED. Check that FIRST so a\n"
    "// transient/lingering alert can never be misread as 'taken'. Only treat an\n"
    "// alert as a real rejection when its text matches a taken/invalid pattern.\n"
    "function takenTxt(s){ return /already have an account|already exists|someone already|already taken|is taken|try another|pick a different|not available|can't use|cannot use|invalid/i.test(s||\"\"); }\n"
    "for (var pass = 0; pass < 5; pass++) {\n"
    "  if (vis(document.querySelector(\"input[type='password']\"))) return \"ok\";\n"
    "  var err = document.querySelector(\"[role='alert'], .fui-Text[class*='error'], [id*='Error'], [id*='error']\");\n"
    "  var et = err ? (err.innerText || \"\").trim() : \"\";\n"
    "  if (vis(err) && et && takenTxt(et)) return \"taken:\" + et.slice(0, 160);\n"
    "  var body = (document.body && document.body.innerText || \"\");\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\") + \" \" + body)) throw new Error(\"Account creation blocked after email step\");\n"
    "  await sleep(1200);\n"
    "  // re-check password each pass; only a persistent taken-pattern alert counts\n"
    "  if (vis(document.querySelector(\"input[type='password']\"))) return \"ok\";\n"
    "  if (vis(err) && et && takenTxt(et)) return \"taken:\" + et.slice(0, 160);\n"
    "  if (takenTxt(body)) return \"taken:\" + body.replace(/\\s+/g, \" \").slice(0, 140);\n"
    "}\n"
    "return vis(document.querySelector(\"input[type='password']\")) ? \"ok\" : \"unknown\";"
)
nodes.append(N("n_email_err", "evaluate", 40, 880, {"into": "emailErr", "script": email_err_script}))
E("n_email_err", "n_email_err_branch")
nodes.append(N("n_email_err_branch", "branch", 260, 880, {"op": "==", "left": "{{emailErr}}", "right": "ok"}))
E("n_email_err_branch", "n_fill_pw", "true")

# taken -> regenerate the local part and retry (solar2 regenerates on collision
# instead of dying). Mints a higher-entropy name, refills the field, clicks
# Next, and loops back through the taken-check. Capped at 4 regens per run.
regen_script = (
    "// The minted username collided. Like solar2, regenerate instead of failing:\n"
    "// build a fresh higher-entropy local part from first/last + more digits,\n"
    "// clear and refill the email box, click Next, and hand the new local back so\n"
    "// fullEmail/emailLocal can be updated before the taken-check runs again.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function setVal(el,val){el.focus();el.value=\"\";el.dispatchEvent(new Event(\"input\",{bubbles:true}));el.value=val;el.dispatchEvent(new Event(\"input\",{bubbles:true}));el.dispatchEvent(new Event(\"change\",{bubbles:true}));el.dispatchEvent(new Event(\"blur\",{bubbles:true}));}\n"
    "window.__scRegenN = (window.__scRegenN || 0) + 1;\n"
    "if (window.__scRegenN > 4) throw new Error(\"Username keeps colliding after 4 regenerations - pick a different profile or run again\");\n"
    "function rnd(n){ return Math.floor(Math.random() * n); }\n"
    "// No identity name injection (parse-safe); mint a fresh higher-entropy local\n"
    "// part from syllables + 6 digits.\n"
    "var syl = [\"an\",\"bel\",\"cor\",\"dan\",\"el\",\"fen\",\"gar\",\"han\",\"iv\",\"jo\",\"ka\",\"li\",\"mar\",\"nor\",\"os\",\"per\",\"qu\",\"ri\",\"sam\",\"tan\",\"ur\",\"vi\",\"wil\",\"ya\",\"zo\"];\n"
    "function word(){ return syl[rnd(syl.length)] + syl[rnd(syl.length)] + (Math.random()<0.5 ? syl[rnd(syl.length)] : \"\"); }\n"
    "var w1 = word(), w2 = word();\n"
    "var digits = String(rnd(900000) + 100000);\n"
    "var shapes = [\n"
    "  w1 + w2 + digits,\n"
    "  w1 + \".\" + w2 + digits,\n"
    "  w1.charAt(0) + w2 + digits,\n"
    "  w1 + w2.charAt(0) + digits,\n"
    "  w2 + w1 + digits\n"
    "];\n"
    "var local = shapes[rnd(shapes.length)];\n"
    "// If the email box is gone we already ADVANCED (password page) - the prior\n"
    "// 'taken' was a stale/lingering alert. Don't refill or click; hand back the\n"
    "// current local so the taken-check re-runs and sees the password box -> ok.\n"
    "var em = document.querySelector(\"input[name='email']\");\n"
    "if (!em || document.querySelector(\"input[type='password']\")) return \"{{emailLocal}}\";\n"
    "setVal(em, local);\n"
    "await sleep(400 + Math.random() * 500);\n"
    "var next = document.querySelector(\"button[data-testid='primaryButton']:not([disabled]), button[type='submit']:not([disabled])\");\n"
    "if (next) next.click();\n"
    "// give the availability check a moment so the old alert is gone before the\n"
    "// taken-check reads the page again\n"
    "await sleep(3000);\n"
    "return local;"
)
nodes.append(N("n_regen_email", "evaluate", 260, 1010, {"into": "regenLocal", "script": regen_script}))
E("n_email_err_branch", "n_regen_email", "false")
nodes.append(N("n_s_regen", "setVar", 480, 1010, {"name": "emailLocal", "value": "{{regenLocal}}"}))
E("n_regen_email", "n_s_regen")
nodes.append(N("n_s_regen_full", "setVar", 700, 1010, {"name": "fullEmail", "value": "{{regenLocal}}@{{pickedDomain}}"}))
E("n_s_regen", "n_s_regen_full")
E("n_s_regen_full", "n_email_err")

# ---- password ----
nodes.append(N("n_fill_pw", "fill", 40, 1010, {
    "selector": "input[type='password']:visible", "value": "{{identity.password}}",
    "speed": "natural", "typos": False, "instant": False, "timeoutMs": 60000
}))
E("n_fill_pw", "n_click_pw_next")
nodes.append(N("n_click_pw_next", "evaluate", 260, 1010, {"into": "pwNext", "script": resilient_next_script("password")}))
E("n_click_pw_next", "n_geo")

# ---- country + DOB ----
geo_script = (
    "// Country + birthdate page (fluent=2). Country/Birth month/Birth day are\n"
    "// Fluent dropdown buttons; Birth year is a number input. Click a dropdown,\n"
    "// then click the matching [role=option]. Empty country leaves the geo default.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "// Fluent v9 comboboxes (role=combobox, aria-expanded, a portaled listbox).\n"
    "// Clicking the portaled [role=option] node is unreliable - it mounts in a\n"
    "// body-level layer and the click can miss. The locale- and markup-proof way\n"
    "// is KEYBOARD, exactly how a human uses it: focus the button, open with\n"
    "// Enter/ArrowDown, ArrowDown to the index, Enter to commit. Verify via the\n"
    "// button's value/aria-invalid clearing; fall back to clicking the option.\n"
    "function key(el, type, k){ el.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, bubbles: true, cancelable: true })); }\n"
    "function press(el, k){ key(el,'keydown',k); key(el,'keyup',k); }\n"
    "function getVal(btn){ var s = btn.querySelector(\"[data-testid='truncatedSelectedText']\"); var t = ((s && s.innerText) || btn.innerText || \"\").trim(); var v = btn.getAttribute(\"value\") || \"\"; return (v || t); }\n"
    "async function openCombo(btn){\n"
    "  btn.focus(); await sleep(150);\n"
    "  btn.click(); await sleep(300);\n"
    "  if (btn.getAttribute(\"aria-expanded\") !== \"true\") { press(btn, \"Enter\"); await sleep(300); }\n"
    "  if (btn.getAttribute(\"aria-expanded\") !== \"true\") { press(btn, \"ArrowDown\"); await sleep(300); }\n"
    "  var deadline = Date.now() + 8000;\n"
    "  while (Date.now() < deadline) {\n"
    "    var lb = document.querySelector(\"[role='listbox']\");\n"
    "    if (lb) return lb;\n"
    "    if (btn.getAttribute(\"aria-expanded\") === \"true\") return document.querySelector(\"[role='listbox']\") || btn;\n"
    "    await sleep(200);\n"
    "  }\n"
    "  return null;\n"
    "}\n"
    "async function pickByIndex(btnSel, idx1, isSet){\n"
    "  var btn = document.querySelector(btnSel); if (!btn) return \"no-btn:\" + btnSel;\n"
    "  for (var attempt = 0; attempt < 2; attempt++) {\n"
    "    var before = getVal(btn);\n"
    "    var lb = await openCombo(btn);\n"
    "    if (lb) {\n"
    "      // keyboard: ArrowDown idx1 times from the top, then Enter\n"
    "      var i; for (i = 0; i < idx1; i++) { press(btn, \"ArrowDown\"); await sleep(90); }\n"
    "      press(btn, \"Enter\"); await sleep(300);\n"
    "      if (getVal(btn) !== before && getVal(btn) !== \"\") return \"kbd:\" + getVal(btn);\n"
    "      // fallback: click the nth option in the open listbox (portal-safe query)\n"
    "      var opts = document.querySelectorAll(\"[role='listbox'] [role='option'], [role='option'], .fui-Option\");\n"
    "      if (opts.length) {\n"
    "        var j = Math.max(1, Math.min(opts.length, idx1)) - 1;\n"
    "        try { opts[j].scrollIntoView({block:'nearest'}); } catch(e){}\n"
    "        opts[j].click(); await sleep(300);\n"
    "        if (getVal(btn) !== before && getVal(btn) !== \"\") return \"click:\" + getVal(btn);\n"
    "      }\n"
    "      // close any open list before retrying\n"
    "      press(btn, \"Escape\"); try { document.body.click(); } catch(e){} await sleep(300);\n"
    "    }\n"
    "  }\n"
    "  return \"failed:\" + btnSel;\n"
    "}\n"
    "async function pickByText(btnSel, want){\n"
    "  if (!want) return \"skip\";\n"
    "  var btn = document.querySelector(btnSel); if (!btn) return \"no-btn:\" + btnSel;\n"
    "  if (getVal(btn).toLowerCase() === String(want).toLowerCase()) return \"already\";\n"
    "  var lb = await openCombo(btn); if (!lb) return \"no-list:\" + btnSel;\n"
    "  var w = String(want).trim().toLowerCase();\n"
    "  var opts = document.querySelectorAll(\"[role='listbox'] [role='option'], [role='option'], .fui-Option\");\n"
    "  for (var i = 0; i < opts.length; i++) {\n"
    "    var t = (opts[i].innerText || \"\").trim().toLowerCase();\n"
    "    if (t === w || t.indexOf(w) !== -1 || w.indexOf(t) !== -1) { opts[i].click(); await sleep(250); return \"set:\" + getVal(btn); }\n"
    "  }\n"
    "  press(btn, \"Escape\"); try { document.body.click(); } catch (e) {}\n"
    "  return \"no-opt:\" + want;\n"
    "}\n"
    "var parts = \"{{dob}}\".split(\"|\");\n"
    "// parts: [monthName, monthNum, day, year]\n"
    "var monthNum = parseInt(parts[1], 10) || 6;\n"
    "var dayNum = parseInt(parts[2], 10) || 15;\n"
    "var country = (\"{{countryPick}}\" || \"\").trim();\n"
    "var results = {};\n"
    "// Wait for the birthdate page to settle first - the fields mount\n"
    "// progressively after the password Next, so querying country the instant we\n"
    "// land can race and return no-btn. Poll until the month dropdown exists.\n"
    "var readyDeadline = Date.now() + 30000;\n"
    "while (Date.now() < readyDeadline) {\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\")+\" \"+(document.body&&document.body.innerText||\"\"))) throw new Error(\"Account creation blocked at birthdate step\");\n"
    "  if (document.querySelector(\"button#BirthMonthDropdown\") || document.querySelector(\"input[name='BirthYear']\")) break;\n"
    "  await sleep(400);\n"
    "}\n"
    "// Country is OPTIONAL and is often pre-filled from the exit IP's geo (e.g.\n"
    "// value=ES) or absent entirely. Only set it when the dropdown is present AND\n"
    "// empty-ish; never fail the step over it. Month/day are the required fields.\n"
    "var cBtn = document.querySelector(\"button#countryDropdownId\");\n"
    "if (country && cBtn) {\n"
    "  var curCountry = getVal(cBtn);\n"
    "  if (curCountry && curCountry.toLowerCase() === String(country).toLowerCase()) { results.country = \"already:\" + curCountry; }\n"
    "  else { results.country = await pickByText(\"button#countryDropdownId\", country); }\n"
    "}\n"
    "await sleep(400 + Math.random() * 600);\n"
    "results.month = await pickByIndex(\"button#BirthMonthDropdown\", monthNum);\n"
    "await sleep(400 + Math.random() * 600);\n"
    "results.day = await pickByIndex(\"button#BirthDayDropdown\", dayNum);\n"
    "await sleep(300 + Math.random() * 400);\n"
    "var y = document.querySelector(\"input[name='BirthYear']\");\n"
    "if (y) { y.focus(); y.value = \"\"; y.dispatchEvent(new Event(\"input\", { bubbles: true })); y.value = parts[3]; y.dispatchEvent(new Event(\"input\", { bubbles: true })); y.dispatchEvent(new Event(\"change\", { bubbles: true })); y.dispatchEvent(new Event(\"blur\", { bubbles: true })); }\n"
    "// only month/day are mandatory here; surface a failure on either loudly\n"
    "var bad = []; [\"month\", \"day\"].forEach(function (k) { var v = String(results[k] || \"\"); if (v.indexOf(\"failed\") === 0 || v.indexOf(\"no-btn\") === 0 || v.indexOf(\"no-list\") === 0) bad.push(k + \"=\" + v); });\n"
    "if (bad.length) throw new Error(\"birthdate fields not set: \" + bad.join(\", \"));\n"
    "return \"done:\" + JSON.stringify(results);"
)
nodes.append(N("n_geo", "evaluate", 40, 1120, {"into": "geoSet", "script": geo_script}))
E("n_geo", "n_click_geo_next")
nodes.append(N("n_click_geo_next", "evaluate", 260, 1120, {"into": "geoNext", "script": resilient_next_script("birthdate")}))
E("n_click_geo_next", "n_names")

# ---- names ----
names_script = (
    "// Names page. The field IDs (firstNameInput/lastNameInput) are NOT stable\n"
    "// across locales - a non-English exit can render different ids, so resolve\n"
    "// the two name inputs locale-agnostically and hand exact selectors back.\n"
    "// Priority: known ids -> autocomplete given/family-name -> name/aria hints ->\n"
    "// the only two visible text inputs on the page (first = first name).\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'&&el.offsetParent!==null;}\n"
    "function uniq(el, base){ if(!el) return \"\"; if(el.id) return \"#\" + el.id; var nm=el.getAttribute(\"name\"); if(nm) return \"input[name='\" + nm + \"']\"; return base; }\n"
    "function findNames(){\n"
    "  var f = document.querySelector(\"input#firstNameInput, input[autocomplete='given-name'], input[name*='first' i], input[id*='first' i]\");\n"
    "  var l = document.querySelector(\"input#lastNameInput, input[autocomplete='family-name'], input[name*='last' i], input[id*='last' i]\");\n"
    "  if (vis(f) && vis(l)) return { f: f, l: l };\n"
    "  // fallback: the two visible text inputs (exclude email/password/hidden)\n"
    "  var all = document.querySelectorAll(\"input[type='text'], input:not([type])\");\n"
    "  var vis2 = [];\n"
    "  for (var i=0;i<all.length;i++){var e=all[i];if(!vis(e))continue;var t=(e.type||'').toLowerCase();if(t==='email'||t==='password'||t==='hidden'||t==='checkbox')continue;vis2.push(e);}\n"
    "  if (vis2.length >= 2) return { f: vis2[0], l: vis2[1] };\n"
    "  return null;\n"
    "}\n"
    "var deadline = Date.now() + 45000;\n"
    "while (Date.now() < deadline) {\n"
    "  var body = (document.body && document.body.innerText || \"\");\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\") + \" \" + body)) throw new Error(\"Account creation blocked before names step\");\n"
    "  var r = findNames();\n"
    "  if (r) {\n"
    "    return { first: uniq(r.f, \"input[autocomplete='given-name']\"), last: uniq(r.l, \"input[autocomplete='family-name']\") };\n"
    "  }\n"
    "  await sleep(500);\n"
    "}\n"
    "throw new Error(\"name fields never appeared after country/DOB\");"
)
nodes.append(N("n_names", "evaluate", 40, 1360, {"into": "namesReady", "script": names_script}))
E("n_names", "n_s_firstsel")
nodes.append(N("n_s_firstsel", "setVar", 260, 1250, {"name": "firstSel", "value": "{{namesReady.first}}"}))
E("n_s_firstsel", "n_s_lastsel")
nodes.append(N("n_s_lastsel", "setVar", 480, 1250, {"name": "lastSel", "value": "{{namesReady.last}}"}))
E("n_s_lastsel", "n_fill_first")
nodes.append(N("n_fill_first", "fill", 260, 1360, {
    "selector": "{{firstSel}}", "value": "{{identity.firstName}}",
    "speed": "natural", "typos": False, "instant": False, "timeoutMs": 60000
}))
E("n_fill_first", "n_fill_last")
nodes.append(N("n_fill_last", "fill", 480, 1360, {
    "selector": "{{lastSel}}", "value": "{{identity.lastName}}",
    "speed": "natural", "typos": False, "instant": False, "timeoutMs": 60000
}))
E("n_fill_last", "n_click_names_next")
nodes.append(N("n_click_names_next", "evaluate", 700, 1360, {"into": "namesNext", "script": resilient_next_script("names")}))
E("n_click_names_next", "n_sms_gate")

# ---- pre-captcha gate / blocked / captcha frame ----
sms_gate_script = (
    "// After names: detect a block, an SMS/identity gate, the captcha frame, or a\n"
    "// straight-through landing.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "var deadline = Date.now() + 30000;\n"
    "while (Date.now() < deadline) {\n"
    "  var body = (document.body && document.body.innerText || \"\");\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\") + \" \" + body)) throw new Error(\"Account creation blocked after names step\");\n"
    "  if (/When you need to prove|verify your phone|enter.*phone number|text you a code/i.test(body)) return \"sms-gate\";\n"
    "  if (location.href.indexOf(\"account.microsoft.com\") !== -1 || location.href.indexOf(\"outlook.live.com/mail\") !== -1) return \"landed\";\n"
    "  if (vis(document.querySelector(\"#enforcementFrame\"))) return \"captcha\";\n"
    "  if (document.querySelector(\"iframe[src*='arkoselabs'], iframe[src*='funcaptcha']\")) return \"captcha\";\n"
    "  await sleep(500);\n"
    "}\n"
    "return \"timeout\";"
)
nodes.append(N("n_sms_gate", "evaluate", 40, 1600, {"into": "gateState", "script": sms_gate_script}))
E("n_sms_gate", "n_gate2_branch")
nodes.append(N("n_gate2_branch", "branch", 250, 1600, {"op": "==", "left": "{{gateState}}", "right": "captcha"}))
E("n_gate2_branch", "n_get_blob", "true")
# landed-early path skips captcha straight to landing confirm
nodes.append(N("n_gate2_landed_branch", "branch", 250, 1740, {"op": "==", "left": "{{gateState}}", "right": "landed"}))
E("n_gate2_branch", "n_gate2_landed_branch", "false")
E("n_gate2_landed_branch", "n_land", "true")
nodes.append(N("n_sms_gate_fail", "fail", 250, 1880, {"message": "Stopped before captcha: state={{gateState}} (SMS verification demanded or challenge never appeared)"}))
E("n_gate2_landed_branch", "n_sms_gate_fail", "false")

# ---- captcha ----
get_blob_script = (
    "// Read the stashed Arkose data[blob]; give the challenge a moment to POST.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "var deadline = Date.now() + 20000;\n"
    "while (Date.now() < deadline) { if (window.__arkoseBlob) return window.__arkoseBlob; await sleep(400); }\n"
    "return \"\";"
)
nodes.append(N("n_get_blob", "evaluate", 40, 1740, {"into": "arkoseBlob", "script": get_blob_script}))
E("n_get_blob", "n_captcha")
nodes.append(N("n_captcha", "captcha.waitForSolved", 260, 1740, {
    "captchaType": "funcaptcha",
    "websiteURL": "https://signup.live.com",
    "websitePublicKey": "B7D8911C-5CC8-A9A3-35B0-554ACEE604DA",
    "subdomain": "https://client-api.arkoselabs.com",
    "data": "{{arkoseBlob}}",
    "timeoutMs": 240000,
    "intervalMs": 2000,
    "into": "captchaToken"
}))
E("n_captcha", "n_submit_token")

submit_script = (
    "// Cross-frame token submit: inject a submitter into the cross-origin\n"
    "// enforcementFrame, else postMessage the token up to the page listener.\n"
    "var token = \"{{captchaToken}}\";\n"
    "if (!token) return \"skipped-no-challenge\";\n"
    "var enc = document.getElementById(\"enforcementFrame\");\n"
    "var posted = false;\n"
    "try {\n"
    "  var encWin = enc && (enc.contentWindow || enc);\n"
    "  var encDoc = enc && (enc.contentDocument || (encWin && encWin.document));\n"
    "  if (encDoc) {\n"
    "    var s = encDoc.createElement(\"SCRIPT\");\n"
    "    s.textContent = \"function CaptchaSubmit(token){ var j = JSON.stringify({ eventId:'challenge-complete', payload:{ sessionToken: token } }); parent.postMessage(j, '*'); }\";\n"
    "    encDoc.documentElement.appendChild(s);\n"
    "    encWin.CaptchaSubmit(token);\n"
    "    posted = true;\n"
    "  }\n"
    "} catch (e) {}\n"
    "if (!posted) {\n"
    "  var j = JSON.stringify({ eventId: \"challenge-complete\", payload: { sessionToken: token } });\n"
    "  if (enc && enc.contentWindow) enc.contentWindow.postMessage(j, \"*\");\n"
    "  window.postMessage(j, \"*\");\n"
    "}\n"
    "return posted ? \"injected\" : \"posted\";"
)
nodes.append(N("n_submit_token", "evaluate", 480, 1740, {"into": "tokenSubmitted", "script": submit_script}))
E("n_submit_token", "n_backup")

# ---- backup email page (solar2: backupEmailInput + confirm, after captcha) ----
backup_script = (
    "// solar2 fills a backup/verify-email page after the captcha. It may or may\n"
    "// not appear. If it does and a backupEmail variable is set, fill the address\n"
    "// (and its confirm box) and click Next; empty backupEmail or no page = skip.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "function setVal(el,val){el.focus();el.value=val;el.dispatchEvent(new Event(\"input\",{bubbles:true}));el.dispatchEvent(new Event(\"change\",{bubbles:true}));el.dispatchEvent(new Event(\"blur\",{bubbles:true}));}\n"
    "// NOTE: no backupEmail text is injected into this script (raw {{}} into a\n"
    "// JS string would break on quotes). The value is written by the fill node\n"
    "// downstream; this script only DETECTS the backup-email page.\n"
    "var deadline = Date.now() + 15000;\n"
    "while (Date.now() < deadline) {\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\") + \" \" + (document.body && document.body.innerText || \"\"))) throw new Error(\"Account creation blocked at backup-email step\");\n"
    "  if (location.href.indexOf(\"account.microsoft.com\") !== -1 || location.href.indexOf(\"outlook.live.com/mail\") !== -1) return \"no-page-landed\";\n"
    "  var em = document.querySelector(\"input[type='email'], input[name*='mail' i], input[id*='mail' i], input[aria-label*='email' i]\");\n"
    "  if (vis(em)) return \"present\";\n"
    "  await sleep(600);\n"
    "}\n"
    "return \"no-page\";"
)
nodes.append(N("n_backup", "evaluate", 480, 1860, {"into": "backupPage", "script": backup_script}))
E("n_backup", "n_backup_branch")
# fill the backup email only if the page is present AND a backupEmail was set;
# both the page check and the value flow through parse-safe paths.
nodes.append(N("n_backup_branch", "branch", 700, 1860, {"op": "==", "left": "{{backupPage}}", "right": "present"}))
E("n_backup_branch", "n_backup_have", "true")
E("n_backup_branch", "n_land", "false")
nodes.append(N("n_backup_have", "branch", 920, 1860, {"op": "!=", "left": "{{inputs.backupEmail}}", "right": ""}))
E("n_backup_have", "n_backup_fill", "true")
E("n_backup_have", "n_land", "false")
nodes.append(N("n_backup_fill", "fill", 1140, 1860, {
    "selector": "input[type='email']:visible",
    "value": "{{inputs.backupEmail}}", "speed": "natural", "typos": False,
    "instant": False, "timeoutMs": 20000
}))
E("n_backup_fill", "n_backup_click")
nodes.append(N("n_backup_click", "evaluate", 1360, 1860, {"into": "backupNext", "script": resilient_next_script("backup-email")}))
E("n_backup_click", "n_land")

# ---- landing (re-post while waiting), tolerates empty token ----
land_script = (
    "// Wait for the account to land (mail app or account.microsoft.com), re-posting\n"
    "// the token in case the first submit raced the listener. Empty token means the\n"
    "// challenge never appeared and Microsoft let us straight through.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "var token = \"{{captchaToken}}\";\n"
    "var j = token ? JSON.stringify({ eventId: \"challenge-complete\", payload: { sessionToken: token } }) : \"\";\n"
    "var deadline = Date.now() + 120000;\n"
    "while (Date.now() < deadline) {\n"
    "  var u = \"\";\n"
    "  try { u = location.href; } catch (e) {}\n"
    "  if (u.indexOf(\"account.microsoft.com\") !== -1 || u.indexOf(\"outlook.live.com/mail\") !== -1) return \"landed\";\n"
    "  var body = (document.body && document.body.innerText || \"\");\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\") + \" \" + body)) throw new Error(\"Account creation blocked after captcha\");\n"
    "  if (j) {\n"
    "    var f = document.getElementById(\"enforcementFrame\");\n"
    "    if (f) { try { if (f.contentWindow) f.contentWindow.postMessage(j, \"*\"); window.postMessage(j, \"*\"); } catch (e) {} }\n"
    "  }\n"
    "  await sleep(3000);\n"
    "}\n"
    "throw new Error(\"Signup never completed - no redirect to the mailbox\");"
)
nodes.append(N("n_land", "evaluate", 700, 1740, {"into": "landState", "script": land_script}))
E("n_land", "n_dismiss")

# ---- dismiss prompts ----
dismiss_script = (
    "// Click through privacy / stay-signed-in / welcome prompts.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "var deadline = Date.now() + 20000;\n"
    "while (Date.now() < deadline) {\n"
    "  var hit = false;\n"
    "  var btns = document.querySelectorAll(\"button, a[role='button'], input[type='submit']\");\n"
    "  for (var i = 0; i < btns.length; i++) {\n"
    "    if (!vis(btns[i])) continue;\n"
    "    var t = ((btns[i].innerText || btns[i].value || \"\")).trim();\n"
    "    if (/^(accept|next|yes|ok|continue|get started|done|skip)$/i.test(t)) { btns[i].click(); hit = true; break; }\n"
    "  }\n"
    "  var stay = document.querySelector(\"#idBtn_Back, [name='DontShowAgain']\");\n"
    "  if (vis(stay)) { stay.click(); hit = true; }\n"
    "  if (!hit) break;\n"
    "  await sleep(1500);\n"
    "}\n"
    "return \"done\";"
)
nodes.append(N("n_dismiss", "evaluate", 920, 1740, {"into": "dismissed", "script": dismiss_script}))
E("n_dismiss", "n_save")

# ---- save + warmup ----
nodes.append(N("n_save", "accounts.save", 1140, 1740, {
    "email": "{{fullEmail}}", "password": "{{identity.password}}",
    "site": "outlook.com", "status": "active", "label": "Outlook"
}))
E("n_save", "n_warmup_check")
nodes.append(N("n_warmup_check", "branch", 1360, 1740, {"op": "==", "left": "{{inputs.warmupInbox}}", "right": "true"}))
E("n_warmup_check", "n_warmup", "true")
nodes.append(N("n_warmup", "goto", 1360, 1600, {"url": "https://outlook.live.com/mail/0/inbox", "waitUntil": "domcontentloaded", "timeoutMs": 120000}))
E("n_warmup", "n_warmup_dwell")
nodes.append(N("n_warmup_dwell", "dwell", 1560, 1600, {"ms": 4000}))
E("n_warmup_dwell", "n_done")
E("n_warmup_check", "n_done", "false")
nodes.append(N("n_done", "noop", 1780, 1740, {}))

# ---- assemble ----
meta_desc = (
    "Creates Outlook/Hotmail accounts on the profile's own browser engine (proxy + "
    "fingerprint + human input, to pass Microsoft's Arkose signals). A generator, not an "
    "entry tool: it mints its own human-looking usernames (first+last+random digits) - "
    "no email list needed. Uses the "
    "current create-account surface (outlook.live.com/mail/?prompt=create_account, "
    "fluent=2): email + domain dropdown -> password -> country/birthdate (Fluent "
    "dropdowns) -> first/last name -> FunCaptcha (Arkose) solve. Captures the Arkose "
    "data[blob] in-page, gets the token from the configured solver, and submits it "
    "through the challenge-complete postMessage so the cross-origin enforcement frame is "
    "never a problem. Fails fast on taken emails, SMS gates, and flagged exit IPs. "
    "Optionally fills a backup email, saves to the Database, and opens the inbox once to "
    "warm the account. Needs a captcha key in Key Vault; proxies recommended. Outlook gen."
)

graph = collections.OrderedDict()
graph["schemaVersion"] = 1
graph["version"] = "2.3.7"
graph["metadata"] = {
    "id": "outlook",
    "name": "Outlook Account Generator",
    "description": meta_desc,
    "tags": ["outlook", "hotmail", "microsoft", "account-generator", "signup"],
    "inputs": [
        {
            "id": "hotmailDomain",
            "label": "Mint @hotmail.com instead of outlook.*",
            "type": "boolean",
            "defaultValue": False,
            "hint": "Off: prefer @outlook.com (the surface offers a short list like @outlook.com / @outlook.in / @hotmail.com; falls back to what's offered). On: prefer @hotmail.com."
        },
        {
            "id": "backupEmail",
            "label": "Backup email (optional)",
            "type": "string",
            "defaultValue": "",
            "placeholder": "recovery@your-catchall.com",
            "hint": "Filled on the backup/verify-email page when Microsoft asks for one. Leave empty to skip that page."
        },
        {
            "id": "warmupInbox",
            "label": "Open inbox after generation",
            "type": "boolean",
            "defaultValue": True,
            "hint": "Open the mailbox once after the account is created to warm the session."
        }
    ]
}
graph["permissions"] = ["accounts", "browser", "captcha", "evaluate"]
graph["variables"] = [
    {"name": "gateTries", "value": "0"}
]
graph["start"] = "n_start"
graph["nodes"] = nodes
graph["edges"] = edges
graph["author"] = {"name": "Sete_", "publicKey": "4ltw2LkHbMaYDjfkzo/3tj1n7Z+Vdash/uG8AyhdUwM="}

out = {"format": "arcana-task/v1", "exportedAt": "2026-09-30T00:00:00.000Z", "graph": graph}

# validate
ids = {n["id"] for n in nodes}
bad = [e for e in edges if e["from"] not in ids or e["to"] not in ids]
adj = {}
for e in edges:
    adj.setdefault(e["from"], []).append(e["to"])
seen, stack = set(), ["n_start"]
while stack:
    x = stack.pop()
    if x in seen:
        continue
    seen.add(x)
    stack.extend(adj.get(x, []))
unreached = [i for i in (ids - seen) if not i.startswith("n_c_")]
# branch ports
branches = [n["id"] for n in nodes if n["kind"] == "branch"]
badbranch = [b for b in branches for port in ("true", "false") if not any(e["from"] == b and e["fromPort"] == port for e in edges)]
print("nodes:", len(nodes), "edges:", len(edges), "dangling:", len(bad), "unreachable:", unreached, "badbranch:", badbranch)
refs = set()
for n in nodes:
    for part in json.dumps(n["config"]).split("{{")[1:]:
        refs.add(part.split("}}")[0].strip())
stale = [r for r in refs if r in ("backupEmail", "warmupInbox", "hotmailDomain", "msDomain", "domainText", "prep.fullEmail", "prep.domainText")]
nodes = [n for n in nodes if n["id"] != "n_email_taken"]
print("stale refs (should be none):", stale)
if bad or unreached or badbranch or stale:
    raise SystemExit("graph invalid")

io.open(P, "w", encoding="utf-8", newline="\n").write(json.dumps(out, indent=2, ensure_ascii=False))
print("written " + graph["version"])
