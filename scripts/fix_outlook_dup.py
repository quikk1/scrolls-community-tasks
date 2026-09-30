import json, io

p = r"D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json"
d = json.loads(io.open(p, encoding="utf-8").read())
g = d["graph"]

# insert a tryCatch before n_dup, rewire exactly like tm's n_pre_tc pattern:
#   prev -> tc ; tc/loop -> pick ; pick/next -> tc ; tc/exit -> branch(WAS_ERROR)
#   branch true(=error=not found) -> goto (proceed) ; false -> dup_fail (found)
g["nodes"].insert(
    next(i for i, n in enumerate(g["nodes"]) if n["id"] == "n_dup"),
    {"id": "n_dup_tc", "kind": "tryCatch", "position": {"x": 40, "y": 140}, "config": {}},
)

# branch on WAS_ERROR like tm does, not on the pick output
for n in g["nodes"]:
    if n["id"] == "n_dup_branch":
        n["config"] = {"op": "truthy", "left": "{{WAS_ERROR}}"}

edges = g["edges"]
for e in edges:
    if e.get("to") == "n_dup" and e["from"] == "n_s_country":
        e["to"] = "n_dup_tc"
    if e["id"] == "e8":  # dup -> branch becomes dup -> tc
        e["to"] = "n_dup_tc"
    if e["id"] == "e9":  # error (not found) -> proceed
        e["fromPort"] = "true"
    if e["id"] == "e10":  # no error (found) -> fail as duplicate
        e["fromPort"] = "false"

edges.append({"id": "e_dup_tc_loop", "from": "n_dup_tc", "fromPort": "loop", "to": "n_dup"})
edges.append({"id": "e_dup_tc_exit", "from": "n_dup_tc", "fromPort": "exit", "to": "n_dup_branch"})

g["version"] = "1.0.1"

io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(d, indent=2, ensure_ascii=False))

# validate
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
print("nodes:", len(nodes), "edges:", len(g["edges"]), "dangling:", len(bad), "unreachable:", unreached)
print("dup wiring:", [(e["from"], e["fromPort"], e["to"]) for e in g["edges"] if "dup" in e["from"] or "dup" in e["to"]])
