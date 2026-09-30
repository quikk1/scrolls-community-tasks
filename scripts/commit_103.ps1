Set-Location D:\dev2\scrolls-community-tasks
python -c "
import json, io
p='tasks/outlook.arcana-task.json'
d=json.loads(io.open(p,encoding='utf-8').read())
d['graph']['version']='1.0.3'
io.open(p,'w',encoding='utf-8',newline='\n').write(json.dumps(d,indent=2,ensure_ascii=False))
m=json.loads(io.open('manifest.json',encoding='utf-8').read())
[t for t in m['tasks'] if t['id']=='outlook'][0]['version']='1.0.3'
io.open('manifest.json','w',encoding='utf-8',newline='\n').write(json.dumps(m,indent=2,ensure_ascii=False))
print('bumped to 1.0.3')
"
node scripts\validate-tasks.cjs 2>&1 | Select-String "outlook|problem"
git add tasks/outlook.arcana-task.json manifest.json
$msg = @"
outlook 1.0.3: gate throws a page diagnostic on timeout

On direct connect (no proxy to rotate) the old gate just timed out into
a bare "never loaded" error, which says nothing about WHY signup.live.com
did not render. Now when the title never lands it throws with the real
title, url, readyState, and a body snippet, so the run log shows what the
page actually is (block page, redirect, blank shell) instead of a dead
timeout. The block-page regex now throws its own clearer message too.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
git commit -m $msg
git push origin main
git log origin/main --oneline -1
