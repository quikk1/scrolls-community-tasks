// One-shot: bump the manifest's riot-entry card to 0.2.0 (Scrolls Solver).
const fs = require("node:fs");
const file = "manifest.json";
let s = fs.readFileSync(file, "utf8");
const NL = s.includes("\r\n") ? "\r\n" : "\n";
const nl = (t) => (NL === "\r\n" ? t.replace(/\n/g, "\r\n") : t);

function swapInRiotBlock(from, to) {
  const start = s.indexOf('"id": "riot-entry"');
  if (start < 0) { console.error("riot-entry block missing"); process.exit(1); }
  const next = s.indexOf('"id":', start + 10);
  const scopeEnd = next > start ? next : s.length;
  const seg = s.slice(start, scopeEnd);
  const needle = nl(from);
  const i = seg.indexOf(needle);
  if (i < 0) { console.error("ANCHOR MISSING in riot block: " + from.slice(0, 60)); process.exit(1); }
  s = s.slice(0, start) + seg.slice(0, i) + nl(to) + seg.slice(i + needle.length) + s.slice(scopeEnd);
}

// 1. Version bump.
swapInRiotBlock('"version": "0.1.9"', '"version": "0.2.0"');

// 2. Permissions: the solver node requires the captcha grant.
swapInRiotBlock(
  `"permissions": [
        "accounts",
        "browser",
        "evaluate",`,
  `"permissions": [
        "accounts",
        "browser",
        "captcha",
        "evaluate",`,
);

// 3. Description: the skip line becomes the solve line.
swapInRiotBlock(
  "If Riot puts an interactive hCaptcha challenge on the sign-in form, that attempt is skipped rather than stalled on, so the batch keeps moving.",
  "If Riot puts an interactive hCaptcha challenge on the sign-in form, Scrolls Solver clears it in-page with AI vision and humanized mouse (checkbox, grids, drag-and-drop) - needs an OpenRouter key in Key Vault -> AI.",
);

fs.writeFileSync(file, s);
console.log("manifest riot-entry -> 0.2.0 (captcha perm + solver description)");
