# Travis Scott browser entry

Available in **Library → Travis Scott — Browser Entry**. Requires **Scrolls 1.6.0 or newer**.

1. Set up a Turnstile-capable service key in **Key Vault** and put it in the Turnstile solver order. Existing adapters include CapSolver, 2Captcha, Anti-Captcha, CapMonster and others.
2. On **Addresses**, choose **Profiles** (records with email) or **Generated addresses** (street-address records without email), then choose a group or individual address. On **Email**, use the selected records' own emails, an email list, or catch-all aliases. Generated addresses require a list or catch-all. Records and emails pair one-to-one; extra emails/addresses are not run or recycled.
3. Enter the store/product URL on `shop.travisscott.com` or `victorvictor.com` (with or without `www.`). Leave the product title blank when the page has a single draw; with several draws, enter the title exactly as shown (curly and straight apostrophes are equivalent). A wrong or missing title fails and lists the draws found on the page. Choose **Single size**, **Size range**, or **Random**. A range randomly selects an available size within inclusive bounds. Supported sizes are shoe sizes 3.5 through 13 in half sizes, 14 and 15, and apparel sizes XS through XXXL; store labels such as `Medium`, `X-Large` or `US 10.5` are recognized. A range uses two shoe sizes or two apparel sizes. Sizes missing or unavailable on the selected product are excluded; an empty selection fails without choosing outside it and lists the available sizes.
4. Choose the solver on the **API** tab. **Key Vault default** uses the Turnstile order. There is no separate provider input on Process.
5. The flow automatically checks all five draw acknowledgments individually, with a randomized pause before each, including the terms/privacy agreement and Email/SMS communications consent. It leaves already checked boxes checked and verifies all five. It accepts the cookie banner when present: Travis Scott's **OK** banner, Victor Victor's Consentmo banner (**Accept**), and closes Klaviyo sign-up popups. Inventory records the store the entry was made on. It fills and verifies the address form, solves Turnstile, submits, and records only a visible “You're entered!” confirmation.

Address filling supports both State text inputs and dropdowns (state code or full name). It removes an international phone prefix when the site already displays that prefix beside the phone field. Fields use native fill operations with input/change events; the module verifies the values before starting a paid solve. Missing, rejected or unmatched fields fail with the field name.

The solver reads the live verification frame's public site key and URL. Provider keys stay in the main app process; neither keys nor solver tokens are saved in the graph variables or inventory. The selected provider adapter receives the run proxy when available and applies its supported proxy behavior. Auto picks the first configured compatible service; it does not retry paid solves across providers on failure.

One-size drops (a single variant) have no size picker; the size setting is ignored unless the variant itself is a supported size. Drops with several option groups (for example Color / Size) are supported when only the size varies; the module picks each option chip and verifies the resolved variant. It never guesses a colour or style.

The flow supports no-payment (`pay_after`) shipping draws, and card-on-file (`standard`) draws when **Card draws** is on.

**Card draws.** Some SuperSwipe drops (for example the Victor Victor x Nike Air Force 1 '01 Deep Royal draw, October 2026) keep a card on file: after the acknowledgments, SuperSwipe puts the size in a cart with a deferred-payment plan and opens Shopify checkout. Nothing is due today; the store charges the card later only if the entry is selected. With **Card draws** off (the default) the run stops before checkout. With it on, the module:

- picks the Key Vault card (**Key Vault card ID**, blank for the default card) before checkout;
- waits in Shopify's checkout queue for up to 90 minutes;
- checks the cart shows the selected product and **$0.00 due today**, then fills contact and shipping details (ignoring Shopify's hidden autofill fields), waits for shipping options, and types the card into Shopify's secure card frames;
- re-checks $0.00 due today and field errors immediately before **Pay now**, and stops instead of paying if anything is due;
- records only a visible Shopify thank-you page, with its confirmation number and the deferred amount. A decline or checkout error is reported and not recorded.

Card number and CVV are typed from Key Vault into the card frames and are never placed in page scripts, logs or inventory. 3-D Secure and Shopify bot challenges are not solved; such checkouts time out without a recorded entry. It rejects payment-required draws, pickup-only draws, unavailable sizes, ambiguous products and an already-visible prior entry. A password-protected store (Shopify `/password`) fails immediately; run again once the draw page is live. It reports a visible site rejection and does not automatically resubmit. If a solver returns after cancellation or the verification frame changes, the token is discarded. A provider task already created may still complete remotely after cancellation.

The selected product's Enter Draw button may initially be disabled while SuperSwipe checks status. The flow waits up to 60 seconds for the site to make it visible and enabled. A button that stays disabled or hidden times out without a solve or submission.

Verification (card draws): the checkout layout and card-frame names were captured read-only from the live Victor Victor checkout on 22 October 2026; offline fixtures cover the queue, decoy autofill fields, cross-origin card frames, $0.00 checks, declines and missing shipping. No live order was placed.

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
