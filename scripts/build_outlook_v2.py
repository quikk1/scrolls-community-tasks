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
    "// Build the identity pieces the form needs.\n"
    "// identity.* and addresses.0.* come from the scrolls SDK runtime.\n"
    "var email = (\"{{identity.email}}\" || \"\").trim();\n"
    "var local = email.indexOf(\"@\") > 0 ? email.split(\"@\")[0] : email;\n"
    "var dom = (email.indexOf(\"@hotmail.com\") !== -1) ? \"hotmail.com\" : \"outlook.com\";\n"
    "var dob = \"{{identity.dob}}\";\n"
    "var y = \"\", m = \"\", d = \"\";\n"
    "var mm = dob.match(/(\\d{4})[-\\/.](\\d{1,2})[-\\/.](\\d{1,2})/);\n"
    "if (mm) { y = mm[1]; m = String(parseInt(mm[2], 10)); d = String(parseInt(mm[3], 10)); }\n"
    "else { var m2 = dob.match(/(\\d{1,2})[-\\/.](\\d{1,2})[-\\/.](\\d{4})/); if (m2) { d = String(parseInt(m2[1], 10)); m = String(parseInt(m2[2], 10)); y = m2[3]; } }\n"
    "if (!y) { y = \"1994\"; m = \"6\"; d = \"15\"; }\n"
    "var months = [\"January\",\"February\",\"March\",\"April\",\"May\",\"June\",\"July\",\"August\",\"September\",\"October\",\"November\",\"December\"];\n"
    "var monthName = months[Math.min(11, Math.max(0, parseInt(m, 10) - 1))];\n"
    "var year = parseInt(y, 10); if (year > 2007) year = 1994;\n"
    "return {\n"
    "  emailLocal: local,\n"
    "  fullEmail: local + \"@\" + dom,\n"
    "  domainText: \"@\" + dom,\n"
    "  month: monthName,\n"
    "  day: d,\n"
    "  year: String(year),\n"
    "  country: (\"{{addresses.0.country}}\" || \"\").trim()\n"
    "};"
)
nodes.append(N("n_prep", "evaluate", 40, 120, {"into": "prep", "script": prep_script}))
E("n_prep", "n_s_local")

for nid, name, val, x in [
    ("n_s_local", "emailLocal", "{{prep.emailLocal}}", 230),
    ("n_s_full", "fullEmail", "{{prep.fullEmail}}", 390),
    ("n_s_domain", "domainText", "{{prep.domainText}}", 550),
    ("n_s_dob", "dob", "{{prep.month}}|{{prep.day}}|{{prep.year}}", 710),
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
    "// .fui-Option / [role=option] with text like '@outlook.com'. Open it, pick\n"
    "// the wanted domain. If only outlook.com is offered and we wanted hotmail,\n"
    "// leave the default rather than fail - the email step still proceeds.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "var want = (\"{{domainText}}\" || \"@outlook.com\").trim().toLowerCase();\n"
    "var btn = document.querySelector(\"button#domainDropdownId\");\n"
    "if (!btn) return \"no-dropdown\";\n"
    "var cur = (btn.innerText || \"\").trim().toLowerCase();\n"
    "if (cur === want) return \"already:\" + cur;\n"
    "btn.click();\n"
    "var deadline = Date.now() + 8000; var picked = \"\";\n"
    "while (Date.now() < deadline) {\n"
    "  var opts = document.querySelectorAll(\"[role='option'], .fui-Option\");\n"
    "  for (var i = 0; i < opts.length; i++) {\n"
    "    if ((opts[i].innerText || \"\").trim().toLowerCase() === want) { opts[i].click(); picked = want; break; }\n"
    "  }\n"
    "  if (picked) break;\n"
    "  await sleep(250);\n"
    "}\n"
    "if (picked) return \"set:\" + picked;\n"
    "try { document.body.click(); } catch (e) {}\n"
    "return \"kept:\" + (document.querySelector(\"button#domainDropdownId\") || {}).innerText;"
)
nodes.append(N("n_domain", "evaluate", 260, 700, {"into": "domainSet", "script": domain_script}))
E("n_domain", "n_click_email_next")
nodes.append(N("n_click_email_next", "click", 480, 700, {"selector": NEXT, "timeoutMs": 60000}))
E("n_click_email_next", "n_email_err")

# taken-email / advance check
email_err_script = (
    "// After Next on the email step: scan for a taken/invalid error, else confirm\n"
    "// we reached the password box.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "for (var pass = 0; pass < 4; pass++) {\n"
    "  var err = document.querySelector(\"[role='alert'], .fui-Text[class*='error'], [id*='Error'], [id*='error']\");\n"
    "  if (vis(err) && (err.innerText || \"\").trim()) return \"taken:\" + (err.innerText || \"\").trim().slice(0, 160);\n"
    "  if (vis(document.querySelector(\"input[type='password']\"))) return \"ok\";\n"
    "  var body = (document.body && document.body.innerText || \"\");\n"
    "  if (/already have an account|already exists|someone already has|taken|try another/i.test(body)) return \"taken:\" + body.replace(/\\s+/g, \" \").slice(0, 140);\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\") + \" \" + body)) throw new Error(\"Account creation blocked after email step\");\n"
    "  await sleep(1500);\n"
    "}\n"
    "return vis(document.querySelector(\"input[type='password']\")) ? \"ok\" : \"unknown\";"
)
nodes.append(N("n_email_err", "evaluate", 40, 880, {"into": "emailErr", "script": email_err_script}))
E("n_email_err", "n_email_err_branch")
nodes.append(N("n_email_err_branch", "branch", 260, 880, {"op": "==", "left": "{{emailErr}}", "right": "ok"}))
E("n_email_err_branch", "n_fill_pw", "true")
nodes.append(N("n_email_taken", "fail", 260, 1010, {"message": "Email already exists or was rejected: {{emailErr}}"}))
E("n_email_err_branch", "n_email_taken", "false")

# ---- password ----
nodes.append(N("n_fill_pw", "fill", 40, 1010, {
    "selector": "input[type='password']:visible", "value": "{{identity.password}}",
    "speed": "natural", "typos": False, "instant": False, "timeoutMs": 60000
}))
E("n_fill_pw", "n_click_pw_next")
nodes.append(N("n_click_pw_next", "click", 260, 1010, {"selector": NEXT, "timeoutMs": 60000}))
E("n_click_pw_next", "n_geo")

# ---- country + DOB ----
geo_script = (
    "// Country + birthdate page (fluent=2). Country/Birth month/Birth day are\n"
    "// Fluent dropdown buttons; Birth year is a number input. Click a dropdown,\n"
    "// then click the matching [role=option]. Empty country leaves the geo default.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "async function pickOpt(btnSel, want) {\n"
    "  if (!want) return \"skip\";\n"
    "  var btn = document.querySelector(btnSel); if (!btn) return \"no-btn:\" + btnSel;\n"
    "  if ((btn.innerText || \"\").trim().toLowerCase() === String(want).toLowerCase()) return \"already\";\n"
    "  btn.click();\n"
    "  var deadline = Date.now() + 9000;\n"
    "  while (Date.now() < deadline) {\n"
    "    var opts = document.querySelectorAll(\"[role='option'], .fui-Option\");\n"
    "    for (var i = 0; i < opts.length; i++) {\n"
    "      if ((opts[i].innerText || \"\").trim().toLowerCase() === String(want).toLowerCase()) { opts[i].click(); return \"set\"; }\n"
    "    }\n"
    "    await sleep(250);\n"
    "  }\n"
    "  try { document.body.click(); } catch (e) {}\n"
    "  return \"no-opt:\" + want;\n"
    "}\n"
    "var parts = \"{{dob}}\".split(\"|\");\n"
    "var country = (\"{{countryPick}}\" || \"\").trim();\n"
    "if (country) await pickOpt(\"button#countryDropdownId\", country);\n"
    "await sleep(400 + Math.random() * 600);\n"
    "await pickOpt(\"button#BirthMonthDropdown\", parts[0]);\n"
    "await sleep(400 + Math.random() * 600);\n"
    "await pickOpt(\"button#BirthDayDropdown\", parts[1]);\n"
    "await sleep(300 + Math.random() * 400);\n"
    "var y = document.querySelector(\"input[name='BirthYear']\");\n"
    "if (y) { y.focus(); y.value = \"\"; y.dispatchEvent(new Event(\"input\", { bubbles: true })); y.value = parts[2]; y.dispatchEvent(new Event(\"input\", { bubbles: true })); y.dispatchEvent(new Event(\"change\", { bubbles: true })); }\n"
    "return \"done\";"
)
nodes.append(N("n_geo", "evaluate", 40, 1120, {"into": "geoSet", "script": geo_script}))
E("n_geo", "n_click_geo_next")
nodes.append(N("n_click_geo_next", "click", 260, 1120, {"selector": NEXT, "timeoutMs": 60000}))
E("n_click_geo_next", "n_names")

# ---- names ----
names_script = (
    "// Names page: firstNameInput + lastNameInput. Block page can appear here too.\n"
    "function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}\n"
    "function vis(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none';}\n"
    "var deadline = Date.now() + 45000;\n"
    "while (Date.now() < deadline) {\n"
    "  var f = document.querySelector(\"input#firstNameInput\");\n"
    "  if (vis(f)) {\n"
    "    var l = document.querySelector(\"input#lastNameInput\");\n"
    "    return \"ready\";\n"
    "  }\n"
    "  var body = (document.body && document.body.innerText || \"\");\n"
    "  if (/account creation has been blocked/i.test((document.title||\"\") + \" \" + body)) throw new Error(\"Account creation blocked before names step\");\n"
    "  // captcha may appear right after password instead of names\n"
    "  if (document.querySelector(\"#enforcementFrame, iframe[src*='arkoselabs'], iframe[src*='funcaptcha']\")) return \"captcha-early\";\n"
    "  await sleep(500);\n"
    "}\n"
    "throw new Error(\"name fields never appeared after country/DOB\");"
)
nodes.append(N("n_names", "evaluate", 40, 1360, {"into": "namesReady", "script": names_script}))
E("n_names", "n_fill_first")
nodes.append(N("n_fill_first", "fill", 260, 1360, {
    "selector": "input#firstNameInput:visible", "value": "{{identity.firstName}}",
    "speed": "natural", "typos": False, "instant": False, "timeoutMs": 60000
}))
E("n_fill_first", "n_fill_last")
nodes.append(N("n_fill_last", "fill", 480, 1360, {
    "selector": "input#lastNameInput:visible", "value": "{{identity.lastName}}",
    "speed": "natural", "typos": False, "instant": False, "timeoutMs": 60000
}))
E("n_fill_last", "n_click_names_next")
nodes.append(N("n_click_names_next", "click", 700, 1360, {"selector": NEXT, "timeoutMs": 60000}))
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
E("n_submit_token", "n_land")

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
nodes.append(N("n_warmup_check", "branch", 1360, 1740, {"op": "==", "left": "{{warmupInbox}}", "right": "yes"}))
E("n_warmup_check", "n_warmup", "true")
nodes.append(N("n_warmup", "goto", 1360, 1600, {"url": "https://outlook.live.com/mail/0/inbox", "waitUntil": "domcontentloaded", "timeoutMs": 120000}))
E("n_warmup", "n_warmup_dwell")
nodes.append(N("n_warmup_dwell", "dwell", 1560, 1600, {"ms": 4000}))
E("n_warmup_dwell", "n_done")
E("n_warmup_check", "n_done", "false")
nodes.append(N("n_done", "noop", 1780, 1740, {}))

# ---- assemble ----
meta_desc = (
    "Creates an Outlook/Hotmail account on the profile's own browser engine (proxy + "
    "fingerprint + human input, to pass Microsoft's Arkose signals). Uses the current "
    "create-account surface (outlook.live.com/mail/?prompt=create_account, fluent=2): "
    "email + domain dropdown -> password -> country/birthdate (Fluent dropdowns) -> "
    "first/last name -> FunCaptcha (Arkose) solve. Captures the Arkose data[blob] in-page, "
    "gets the token from the configured solver, and submits it through the "
    "challenge-complete postMessage so the cross-origin enforcement frame is never a "
    "problem. Fails fast on taken emails, SMS gates, and flagged exit IPs (blocked page). "
    "Saves to the Database and opens the inbox once to warm the account. Needs an email "
    "source for the identity address and a captcha key in Key Vault; proxies recommended. "
    "Outlook gen."
)

graph = collections.OrderedDict()
graph["schemaVersion"] = 1
graph["version"] = "2.0.0"
graph["metadata"] = {
    "id": "outlook",
    "name": "Outlook Account Generator",
    "description": meta_desc,
    "tags": ["outlook", "hotmail", "microsoft", "account-generator", "signup"]
}
graph["permissions"] = ["accounts", "browser", "captcha", "evaluate"]
graph["variables"] = [
    {"name": "gateTries", "value": "0"},
    {"name": "warmupInbox", "value": "yes"}
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
if bad or unreached or badbranch:
    raise SystemExit("graph invalid")

io.open(P, "w", encoding="utf-8", newline="\n").write(json.dumps(out, indent=2, ensure_ascii=False))
print("written 2.0.0")
