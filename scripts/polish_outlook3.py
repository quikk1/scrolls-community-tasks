import json, io

p = r"D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json"
d = json.loads(io.open(p, encoding="utf-8").read())
g = d["graph"]

# 1. description: mirror target's "profile's own browser engine" trust note
g["metadata"]["description"] = (
    "Creates an Outlook/Hotmail account on the profile's own browser engine "
    "(proxy + fingerprint + human input, to pass Microsoft's Arkose signals). "
    "signup.live.com email step (handles both the legacy MemberName and redesigned "
    "usernameInput signup DOMs) -> password -> name -> country/DOB -> FunCaptcha "
    "(Arkose) solve. Captures the Arkose data[blob] in-page, gets the token from the "
    "configured solver, and submits it through the challenge-complete postMessage the "
    "page listens for, so the cross-origin enforcement frame is never a problem. "
    "Fails fast on emails that already exist (database check plus live taken-error), "
    "bails when Microsoft demands SMS before the captcha, dismisses the "
    "privacy/stay-signed-in prompts, saves to the Database, and opens the inbox once "
    "to warm the account. Outlook gen."
)

# 2. variables: keep only what a run could meaningfully tune; internals live in-node
keep = {"warmupInbox", "gateTries"}
g["variables"] = [v for v in g["variables"] if v["name"] in keep]
for v in g["variables"]:
    if v["name"] == "warmupInbox":
        v["value"] = "yes"

# 3. fill typos: true -> false to match every other generator in the repo
for n in g["nodes"]:
    if n["kind"] == "fill" and n["config"].get("typos") is True:
        n["config"]["typos"] = False

io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(d, indent=2, ensure_ascii=False))

# revalidate
d = json.loads(io.open(p, encoding="utf-8").read())
g = d["graph"]
nodes = {n["id"] for n in g["nodes"]}
bad = [e for e in g["edges"] if e["from"] not in nodes or e["to"] not in nodes]
adj = {}
for e in g["edges"]:
    adj.setdefault(e["from"], []).append(e["to"])
seen, stack = set(), [g["start"]]
while stack:
    x = stack.pop()
    if x in seen:
        continue
    seen.add(x)
    stack.extend(adj.get(x, []))
unreached = [n for n in (nodes - seen) if not n.startswith("n_c_")]
refs = set()
for n in g["nodes"]:
    for part in json.dumps(n["config"]).split("{{")[1:]:
        refs.add(part.split("}}")[0].strip())
dead_vars = [v["name"] for v in g["variables"] if not any(r == v["name"] or r.startswith(v["name"] + ".") for r in refs)]
print("nodes:", len(nodes), "edges:", len(g["edges"]), "dangling:", len(bad), "unreachable:", unreached)
print("vars kept:", [v["name"] for v in g["variables"]], "| unreferenced:", dead_vars)
print("typos flags:", [n["config"].get("typos") for n in g["nodes"] if n["kind"] == "fill"])
print("desc len:", len(g["metadata"]["description"]))
