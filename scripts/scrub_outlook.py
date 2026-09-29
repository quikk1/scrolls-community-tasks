import io

p = r"D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json"
s = io.open(p, encoding="utf-8").read()

repls = [
    ("Ported from the HawkGen Outlook engine (Class178 flow).", "Outlook gen."),
    ("// Email-step gate (HawkGen Class178): one in-page retry", "// Email-step gate: one in-page retry"),
    ("// HawkGen scans for #usernameInputError across 3 passes, 2s apart.",
     "// Scan for #usernameInputError across 3 passes, 2s apart."),
    ("// HawkGen sniffs the Arkose blob via CDP; in-page we wrap fetch/XHR before the\\n// challenge loads and stash data[blob] off the POST body ourselves.",
     "// Wrap fetch/XHR before the challenge loads and stash data[blob] off the\\n// Arkose POST body ourselves."),
    ("__hgBlobHooked", "__scBlobHooked"),
    ("__hgUrl", "__scUrl"),
    ("// Pre-captcha SMS gate (HawkGen bails here) + captcha frame detection.",
     "// Pre-captcha SMS gate (bail here) + captcha frame detection."),
    ("// HawkGen's cross-frame trick: the enforcementFrame is cross-origin, so inject a",
     "// Cross-frame trick: the enforcementFrame is cross-origin, so inject a"),
]

for old, new in repls:
    if old not in s:
        print("MISS:", old[:60])
    s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)

import json
d = json.loads(s)
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
print("nodes:", len(nodes), "edges:", len(g["edges"]), "dangling:", len(bad), "unreachable:", sorted(nodes - seen))
leftover = [w for w in ("hawkgen", "HawkGen", "Class178", "__hg") if w in s]
print("leftover refs:", leftover)
