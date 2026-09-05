# Travis Scott browser entry

Available in **Library → Travis Scott — Browser Entry**. Requires **Scrolls 1.6.0 or newer**.

1. Set up a Turnstile-capable service key in **Key Vault** and put it in the Turnstile solver order. Existing adapters include CapSolver, 2Captcha, Anti-Captcha, CapMonster and others.
2. On **Addresses**, choose **Profiles** (records with email) or **Generated addresses** (street-address records without email), then choose a group or individual address. On **Email**, use the selected records' own emails, an email list, or catch-all aliases. Generated addresses require a list or catch-all. Records and emails pair one-to-one; extra emails/addresses are not run or recycled.
3. Enter the store/product URL and exact product title. The recorded adult product title is `AIR FORCE 1 '07 LOW CACTUS JACK`. Choose **Single size**, **Size range**, or **Random**. A range randomly selects an available size within inclusive bounds. The supported list is 3.5 through 13 in half sizes, then 14 and 15. Sizes missing or unavailable on the selected product are excluded; an empty selection fails without choosing outside it.
4. Choose the solver on the **API** tab. **Key Vault default** uses the Turnstile order. There is no separate provider input on Process.
5. The flow automatically checks all five draw acknowledgments individually, with a randomized pause before each, including the terms/privacy agreement and Email/SMS communications consent. It leaves already checked boxes checked and verifies all five. It accepts the cookie banner's **OK** button when present. It fills and verifies the address form, solves Turnstile, submits, and records only a visible “You're entered!” confirmation.

Address filling supports both State text inputs and dropdowns (state code or full name). It removes an international phone prefix when the site already displays that prefix beside the phone field. Fields use native fill operations with input/change events; the module verifies the values before starting a paid solve. Missing, rejected or unmatched fields fail with the field name.

The solver reads the live verification frame's public site key and URL. Provider keys stay in the main app process; neither keys nor solver tokens are saved in the graph variables or inventory. The selected provider adapter receives the run proxy when available and applies its supported proxy behavior. Auto picks the first configured compatible service; it does not retry paid solves across providers on failure.

The flow supports the recorded single-size-option, no-payment draw format. It rejects payment-required draws, unavailable sizes, ambiguous products and an already-visible prior entry. It reports a visible site rejection and does not automatically resubmit. If a solver returns after cancellation or the verification frame changes, the token is discarded. A provider task already created may still complete remotely after cancellation.

The selected product's Enter Draw button may initially be disabled while SuperSwipe checks status. The flow waits up to 60 seconds for the site to make it visible and enabled. A button that stays disabled or hidden times out without a solve or submission.

Verification: local Chromium tests exercise the actual graph runtime and token delivery across origins with a mock solver, including delayed draw readiness, permanently disabled buttons, checkbox timing, cookie banners, State dropdowns, phone prefixes and rejected fields. A live form check with synthetic details passed through field verification and stopped before CAPTCHA/submission. Provider API contract tests use mocked responses. No live entry or paid solve was performed. The supplied HAR is reference data only; captured cookies, personal details and tokens are not included.

Development commands (from `C:\dev\Scrolls`):

```powershell
node scrolls-community-tasks/scripts/build-travis-scott.cjs
node scrolls-app/app/node_modules/typescript/bin/tsc -p scrolls-app/app/electron/tsconfig.json
node scrolls-community-tasks/scripts/test-travis-scott-browser.cjs
node scrolls-app/app/dist-electron/__tests__/captcha-turnstile.smoke.js
```

The browser test accepts `SCROLLS_APP_DIR` and `CHROME_PATH` overrides. Otherwise it uses the sibling Scrolls source build and the standard Windows Chrome installation.

Provider references: [CapSolver Turnstile API](https://docs.capsolver.com/en/guide/captcha/cloudflare_turnstile/) and [2Captcha Turnstile API](https://2captcha.com/api-docs/cloudflare-turnstile). The module reuses Scrolls' existing provider adapters.
