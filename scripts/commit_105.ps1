Set-Location D:\dev2\scrolls-community-tasks
python -c "
import json, io
p='tasks/outlook.arcana-task.json'
d=json.loads(io.open(p,encoding='utf-8').read())
d['graph']['version']='1.0.5'
io.open(p,'w',encoding='utf-8',newline='\n').write(json.dumps(d,indent=2,ensure_ascii=False))
m=json.loads(io.open('manifest.json',encoding='utf-8').read())
[t for t in m['tasks'] if t['id']=='outlook'][0]['version']='1.0.5'
io.open('manifest.json','w',encoding='utf-8',newline='\n').write(json.dumps(m,indent=2,ensure_ascii=False))
print('bumped to 1.0.5')
"
node scripts\validate-tasks.cjs 2>&1 | Select-String "outlook|problem"
git add tasks/outlook.arcana-task.json manifest.json
$msg = @"
outlook 1.0.5: type the full email on the modern signup page

The modern "Enter your email address" variant has no domain dropdown and
wants the full address typed into #usernameInput, but the fill was sending
only the local part - and it latched onto the hidden legacy #MemberName
that also sits in the modern DOM, hanging the fill. The resolve step now
checks visibility strictly (offsetParent included), prefers the modern
input, and returns both the exact selector and the right value for that
variant (full email for modern, local part for legacy). Next click also
matches the modern submit button.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
[System.IO.File]::WriteAllText("$env:TEMP\cmsg.txt", $msg, (New-Object System.Text.UTF8Encoding $false))
git commit -F $env:TEMP\cmsg.txt
git push origin main 2>&1 | Select-Object -Last 1
git log origin/main --format="%s" -1
