Set-Location D:\dev2\scrolls-community-tasks
git add tasks/outlook.arcana-task.json manifest.json scripts/build_outlook_v2.py
$msg = @"
outlook 2.2.1: pick from the offered domains, never fail on domain

2.2.0 pre-baked solar2's 12-region domain table and failed fast when the
surface didn't offer the pick - but the live fluent=2 surface only offers a
short list (@outlook.com, @outlook.in, @hotmail.com), so it errored on the
very first run. The regional table is from an older solar2 surface.

The domain step now reads the offered [role=option] list and picks from
reality: prefer the wanted domain (hotmail toggle -> @hotmail.com, else
@outlook.com), fall back to the first offered option. It returns the picked
domain so the saved full address reflects what was actually minted
(n_domain -> pickedDomain, then n_s_full2 rebuilds fullEmail). Dedupe still
runs up front on the predicted address.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
[System.IO.File]::WriteAllText("$env:TEMP\cmsg.txt", $msg, (New-Object System.Text.UTF8Encoding $false))
git commit -F $env:TEMP\cmsg.txt
git push origin main 2>&1 | Select-Object -Last 1
git log origin/main --format="%h %s" -1
