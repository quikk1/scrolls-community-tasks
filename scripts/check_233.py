import json, io
m = json.loads(io.open(r'D:\dev2\scrolls-community-tasks\manifest.json', encoding='utf-8').read())
o = [t for t in m['tasks'] if t['id'] == 'outlook'][0]
o['version'] = '2.3.3'
io.open(r'D:\dev2\scrolls-community-tasks\manifest.json', 'w', encoding='utf-8', newline='\n').write(json.dumps(m, indent=2, ensure_ascii=False))
t = json.loads(io.open(r'D:\dev2\scrolls-community-tasks\tasks\outlook.arcana-task.json', encoding='utf-8').read())
g = t['graph']
dob = [n for n in g['nodes'] if n['id'] == 'n_s_dob'][0]['config']['value']
geo = [n for n in g['nodes'] if n['id'] == 'n_geo'][0]['config']['script']
prep = [n for n in g['nodes'] if n['id'] == 'n_prep'][0]['config']['script']
print('dob var:', dob)
print('monthNum emitted by prep:', 'monthNum' in prep)
print('index month pick:', 'pickIndex("button#BirthMonthDropdown", monthNum)' in geo)
print('index day pick:', 'pickIndex("button#BirthDayDropdown", dayNum)' in geo)
print('country text pick:', 'pickText("button#countryDropdownId", country)' in geo)
