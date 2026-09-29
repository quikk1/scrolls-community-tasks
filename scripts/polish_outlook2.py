import json, io

p = r"D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json"
d = json.loads(io.open(p, encoding="utf-8").read())
g = d["graph"]

for n in g["nodes"]:
    if n["id"] == "n_prep":
        s = n["config"]["script"]
        assert '{{inputs.domain}}' in s
        s = s.replace(
            'var dom = ("{{inputs.domain}}" || "outlook.com").trim().toLowerCase();\nif (dom !== "hotmail.com") dom = "outlook.com";',
            'var dom = (email.indexOf("@hotmail.com") !== -1) ? "hotmail.com" : "outlook.com";'
        )
        s = s.replace(
            'country: ("{{inputs.country}}" || "{{addresses.0.country}}" || "").trim()',
            'country: ("{{addresses.0.country}}" || "").trim()'
        )
        s = s.replace(
            "// identity.* and addresses.0.* come from the scrolls SDK runtime.",
            "// identity.* and addresses.0.* come from the scrolls SDK runtime.\n// Domain comes from the identity email when present, else outlook.com."
        )
        n["config"]["script"] = s

    if n["id"] == "n_warmup_check":
        n["config"] = {"op": "==", "left": "{{warmupInbox}}", "right": "yes"}

    if n["id"] == "n_gate_rotate":
        n["config"] = {"level": "warn", "message": "signup.live.com gate failed - rotating proxy"}

g["variables"].append({"name": "warmupInbox", "value": "yes"})

io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(d, indent=2, ensure_ascii=False))

# revalidate everything
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
    blob = json.dumps(n["config"])
    for part in blob.split("{{")[1:]:
        refs.add(part.split("}}")[0].strip())
inputs_left = [r for r in refs if r.startswith("inputs.")]
print("nodes:", len(nodes), "edges:", len(g["edges"]), "dangling:", len(bad), "unreachable:", unreached)
print("refs to inputs.* (should be none):", inputs_left)
print("metadata:", json.dumps(g["metadata"]))
print("vars:", [v["name"] for v in g["variables"]])
