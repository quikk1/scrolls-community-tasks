import json, io, collections

p = r"D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json"
d = json.loads(io.open(p, encoding="utf-8").read())
g = d["graph"]

# 1. metadata: drop inputs (unproven schema in this repo, runtime identity covers it),
#    drop "class" (proven only inside riot's "metadata"? no - nowhere). Keep la28 shape.
md = g["metadata"]
md.pop("inputs", None)
md.pop("class", None)

# 2. graph key order to match exports: schemaVersion, version, metadata, permissions, variables, start, nodes, edges, author
newg = collections.OrderedDict()
newg["schemaVersion"] = g["schemaVersion"]
newg["version"] = g.get("version", "1.0.0")
newg["metadata"] = md
newg["permissions"] = g["permissions"]
newg["variables"] = g["variables"]
newg["start"] = g["start"]
newg["nodes"] = g["nodes"]
newg["edges"] = g["edges"]
newg["author"] = g["author"]

# 3. fix the gate tryCatch wiring to canonical semantics (tm pattern):
#    entry -> tc ; tc/loop -> body ; body/next -> tc ; tc/exit -> after ; tc/catch -> fail
edges = [e for e in newg["edges"] if e["id"] not in ("e13", "e13b", "e13c", "e15b", "e15c")]
# remove now-unused gate_err/gate_fail nodes
newg["nodes"] = [n for n in newg["nodes"] if n["id"] not in ("n_gate_err", "n_gate_fail")]
edges.append({"id": "e13", "from": "n_gate_email", "fromPort": "next", "to": "n_gate_tc"})
edges.append({"id": "e13b", "from": "n_gate_tc", "fromPort": "exit", "to": "n_gate_branch"})
edges.append({"id": "e13c", "from": "n_gate_tc", "fromPort": "catch", "to": "n_gate_rotate"})
# rotate node: log then fail -> engine rotates proxy on run failure
newg["nodes"].append({
    "id": "n_gate_rotate",
    "kind": "log",
    "position": {"x": 250, "y": 860},
    "config": {"message": "signup.live.com gate failed: {{WAS_ERROR}} - rotating proxy"}
})
edges.append({"id": "e13d", "from": "n_gate_rotate", "fromPort": "next", "to": "n_gate_dead"})
newg["nodes"].append({
    "id": "n_gate_dead",
    "kind": "fail",
    "position": {"x": 470, "y": 860},
    "config": {"message": "Signup page blocked or proxy dead"}
})
newg["edges"] = edges

# 4. dwell config to the fixed-ms majority form
for n in newg["nodes"]:
    if n["kind"] == "dwell" and "minMs" in n["config"]:
        lo, hi = n["config"].pop("minMs"), n["config"].pop("maxMs")
        n["config"]["ms"] = int((lo + hi) / 2)

# 5. gate script: tries survive only if gate persists - persist via setVar.
#    simpler correct: on reload return we navigate again; tries read from a var node.
for n in newg["nodes"]:
    if n["id"] == "n_gate_email":
        n["config"]["script"] = n["config"]["script"].replace(
            'var tries = Number("{{gate.tries}}") || 0;',
            'var tries = Number("{{gateTries}}") || 0;'
        )
# add setVar gateTries increment after gate when state==reload:
# branch false(reload) path currently goes straight to goto. Insert increment first.
edges2 = []
for e in newg["edges"]:
    if e["id"] == "e15":  # gate_branch false -> n_goto
        continue
    edges2.append(e)
newg["edges"] = edges2
newg["nodes"].append({
    "id": "n_gate_retry",
    "kind": "math.incVar",
    "position": {"x": 470, "y": 780},
    "config": {"name": "gateTries", "current": "{{gateTries}}", "by": 1}
})
newg["edges"].append({"id": "e15", "from": "n_gate_branch", "fromPort": "false", "to": "n_gate_retry"})
newg["edges"].append({"id": "e15z", "from": "n_gate_retry", "fromPort": "next", "to": "n_goto"})
newg["variables"].append({"name": "gateTries", "value": "0"})

# 6. accounts.save: align with la28-entry generator shape (site/label/status), keep notes off
for n in newg["nodes"]:
    if n["id"] == "n_save":
        n["config"] = {
            "email": "{{fullEmail}}",
            "password": "{{identity.password}}",
            "site": "outlook.com",
            "status": "active",
            "label": "Outlook"
        }

# 7. exportedAt fresh
d["exportedAt"] = "2026-09-30T00:00:00.000Z"
d["graph"] = newg

# validate
nodes = {n["id"] for n in newg["nodes"]}
bad = [e for e in newg["edges"] if e["from"] not in nodes or e["to"] not in nodes]
adj = {}
for e in newg["edges"]:
    adj.setdefault(e["from"], []).append(e["to"])
seen, stack = set(), [newg["start"]]
while stack:
    x = stack.pop()
    if x in seen:
        continue
    seen.add(x)
    stack.extend(adj.get(x, []))
unreached = [n for n in (nodes - seen) if not n.startswith("n_c_")]
# cycle check on the tc loop body
print("nodes:", len(nodes), "edges:", len(newg["edges"]), "dangling:", len(bad), "unreachable:", unreached)
print("metadata keys:", list(md.keys()))
print("graph keys:", list(newg.keys()))
tc_edges = [(e["from"], e["fromPort"], e["to"]) for e in newg["edges"] if e["from"] == "n_gate_tc" or e["to"] == "n_gate_tc"]
print("tryCatch wiring:", tc_edges)

io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(d, indent=2, ensure_ascii=False))
print("written")
