Set-Location D:\dev2\scrolls-community-tasks
git add tasks/outlook.arcana-task.json manifest.json scripts/build_outlook_v2.py
$msg = @"
outlook 2.1.0: close the remaining solar2 gaps (domain precheck, backup email)

Port the two solar2 behaviors 2.0.0 skipped:

- Domain precheck: open the domain dropdown and READ the offered
  [role=option] domains before picking. If the wanted domain is not
  offered, fail fast ("domain '...' is not available") instead of minting
  the wrong TLD - solar2's exact domainListJS behavior.
- Backup-email page: after the captcha, solar2 fills a backup/verify-email
  page (address + confirm). We now detect that page and fill it from a new
  optional backupEmail run variable; empty or page-absent = skip cleanly.
  Blocked-page detection here too.

The verify-request confirmation solar2 waits on is already covered by the
land step's mailbox/account.microsoft.com poll. Validator: PASS, 57 nodes
/ 53 edges.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
[System.IO.File]::WriteAllText("$env:TEMP\cmsg.txt", $msg, (New-Object System.Text.UTF8Encoding $false))
git commit -F $env:TEMP\cmsg.txt
git push origin main 2>&1 | Select-Object -Last 1
git log origin/main --format="%h %s" -1
