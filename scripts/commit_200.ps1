Set-Location D:\dev2\scrolls-community-tasks
git add tasks/outlook.arcana-task.json manifest.json scripts/build_outlook_v2.py scripts/probe_dom.js scripts/probe_opts.js scripts/click_opt_by_text.js scripts/set_fluent_option.js scripts/probe_blocked.js
$msg = @"
outlook 2.0.0: rebase the flow on the current fluent=2 signup surface

Rebuilt from the solar2 outlook_register flow and verified live against
signup.live.com/signup?...&fluent=2 (the page outlook.live.com/mail/?
prompt=create_account redirects to). Every selector was confirmed by
driving the real page, not reconstructed from the old DOM:

- entry: outlook.live.com/mail/?prompt=create_account (was signup.live.com/)
- email: input[name='email'], domain via button#domainDropdownId -> [role=option]
- password: input[type='password'] (no name attr on fluent=2)
- country + birth month/day: Fluent dropdown buttons #countryDropdownId /
  #BirthMonthDropdown / #BirthDayDropdown -> [role=option]; year is
  input[name='BirthYear']
- names: input#firstNameInput / input#lastNameInput
- every Next: button[data-testid='primaryButton']
- detects the "Account creation has been blocked" page at each step so a
  flagged exit fails fast with a clear message instead of timing out

Order matches the live page: email -> password -> country/DOB -> names ->
captcha. Keeps the Arkose data[blob] capture + cross-frame token submit and
the landed-early short-circuit. Validator: PASS, 56 nodes / 52 edges.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
"@
[System.IO.File]::WriteAllText("$env:TEMP\cmsg.txt", $msg, (New-Object System.Text.UTF8Encoding $false))
git commit -F $env:TEMP\cmsg.txt
git push origin main 2>&1 | Select-Object -Last 1
git log origin/main --format="%h %s" -1
