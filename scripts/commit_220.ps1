Set-Location D:\dev2\scrolls-community-tasks
git add tasks/outlook.arcana-task.json manifest.json scripts/build_outlook_v2.py
$msg = @"
outlook 2.2.0: generate usernames like solar, user-wise run modal

Stops asking for an email - this is a generator, so it mints its own
usernames the way solar2 does (GetRandomUsername). The prep script now
builds a human-looking local part from the SDK identity's first/last name
plus random digits (several shapes), and rotates solar2's regional outlook.*
domain table (outlook.com/.co.uk/.de/.es/.fr/.jp/.com.vn/.it/.my/.cz/.pt/.kr).

Solar2's knobs become run-modal inputs (metadata.inputs, riot-entry shape):
- hotmailDomain (bool): mint @hotmail.com instead of rotating outlook.*
- backupEmail (string, optional): fills the backup/verify-email page
- warmupInbox (bool): open the inbox once after creation

Dropped the internal variables for these; manifest requirements trimmed to
["proxy"] since no email source is needed anymore. Validator: PASS, 57
nodes / 53 edges.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
[System.IO.File]::WriteAllText("$env:TEMP\cmsg.txt", $msg, (New-Object System.Text.UTF8Encoding $false))
git commit -F $env:TEMP\cmsg.txt
git push origin main 2>&1 | Select-Object -Last 1
git log origin/main --format="%h %s" -1
