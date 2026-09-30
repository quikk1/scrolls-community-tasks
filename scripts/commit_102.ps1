Set-Location D:\dev2\scrolls-community-tasks
git add tasks/outlook.arcana-task.json manifest.json
$msg = @"
outlook 1.0.2: gate on page title, not form render

The proxy gate demanded the email input be visible within 30s, but on a
slow proxy the form JS renders well after the page loads - and the
proven health check waits only for "account" in the page title, which
is present from first paint. Match it: gate on the title (fast page-
loaded signal), let the fill step's own long timeout absorb slow form
render, widen the poll to 45s. Still throws after one reload so a dead
proxy rotates instead of looping.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
git commit -m $msg
git push origin main
git log origin/main --oneline -1
