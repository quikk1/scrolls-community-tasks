import json, io
t = json.loads(io.open(r'D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json', encoding='utf-8').read())
g = t['graph']
adj = {}
indeg = {n['id']: 0 for n in g['nodes']}
kind = {n['id']: n['kind'] for n in g['nodes']}
for e in g['edges']:
    adj.setdefault(e['from'], []).append((e.get('port', ''), e['to']))
    indeg[e['to']] += 1
order = []
seen = set()
def walk(nid, depth):
    if nid in seen or depth > 80:
        return
    seen.add(nid)
    order.append('  ' * depth + nid + ' [' + kind[nid] + ']')
    for port, to in adj.get(nid, []):
        walk(to, depth + 1)
walk(g['start'], 0)
print('\n'.join(order))
print('---')
print('terminal (no out):', [n for n in indeg if not adj.get(n)])
print('no in-edge (non-start):', [n for n, d in indeg.items() if d == 0 and n != g['start']])
