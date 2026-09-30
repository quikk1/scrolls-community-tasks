Set-Location D:\dev2\scrolls-community-tasks
python -c "
import json, io
p='tasks/outlook.arcana-task.json'
d=json.loads(io.open(p,encoding='utf-8').read())
d['graph']['version']='1.0.4'
io.open(p,'w',encoding='utf-8',newline='\n').write(json.dumps(d,indent=2,ensure_ascii=False))
m=json.loads(io.open('manifest.json',encoding='utf-8').read())
[t for t in m['tasks'] if t['id']=='outlook'][0]['version']='1.0.4'
io.open('manifest.json','w',encoding='utf-8',newline='\n').write(json.dumps(m,indent=2,ensure_ascii=False))
print('bumped to 1.0.4')
"
node scripts\validate-tasks.cjs 2>&1 | Select-String "outlook|problem"
git add tasks/outlook.arcana-task.json manifest.json
$msg = @"
outlook 1.0.4: resolve the email input before filling it

A fixed comma-selector fill timed out after 120s even though the input
had been visible - signup.live.com redirects and re-renders after first
paint, so the node the fill latched onto can flash and detach. Insert a
resolve step that waits for a stable #MemberName or #usernameInput (and
throws a clear error if the page bounced to a sign-in URL instead), then
hands the fill the exact selector that exists. Fill timeout drops to 60s
since the resolve already did the waiting.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
[System.IO.File]::WriteAllText("$env:TEMP\cmsg.txt", $msg, (New-Object System.Text.UTF8Encoding $false))
git commit -F $env:TEMP\cmsg.txt
git push origin main 2>&1 | Select-Object -Last 1
git log origin/main --format="%s" -1
