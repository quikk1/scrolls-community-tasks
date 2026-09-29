import json, io

MP = r"D:\dev2\scrolls-community-tasks\manifest.json"
d = json.loads(io.open(MP, encoding="utf-8").read())

entry = {
    "id": "outlook",
    "name": "Outlook Account Generator",
    "description": "Outlook/Hotmail account generator: signup.live.com email step (handles both the legacy MemberName and redesigned usernameInput signup DOMs) -> password -> name -> country/DOB -> FunCaptcha (Arkose) solve. Captures the Arkose data[blob] off the wire in-page, gets the token from the configured solver, and submits it through the challenge-complete postMessage the page listens for, so the cross-origin enforcement frame is never a problem. Fails fast on emails that already exist (database check plus live taken-error), bails when Microsoft demands SMS before the captcha, dismisses the privacy/stay-signed-in prompts, saves to the Database, and optionally opens the inbox once to warm the account. Needs an email source for the identity address, a captcha key in Key Vault, and proxies recommended.",
    "version": "1.0.0",
    "author": {
        "name": "Sete_",
        "publicKey": "4ltw2LkHbMaYDjfkzo/3tj1n7Z+Vdash/uG8AyhdUwM="
    },
    "downloadPath": "tasks/outlook.arcana-task.json",
    "tags": [
        "outlook",
        "hotmail",
        "microsoft",
        "account-generator",
        "signup"
    ],
    "permissions": [
        "accounts",
        "browser",
        "captcha",
        "evaluate"
    ],
    "requirements": [
        "email",
        "captcha"
    ],
    "identityMode": "generate",
    "category": "account-generator",
    "status": "ready",
    "publishedAt": "2026-09-30"
}

d["tasks"] = [t for t in d["tasks"] if t.get("id") != "outlook"]
d["tasks"].append(entry)
d["updatedAt"] = "2026-09-30"

io.open(MP, "w", encoding="utf-8", newline="\n").write(json.dumps(d, indent=2, ensure_ascii=False))
print("manifest tasks:", len(d["tasks"]), "- outlook listed:", any(t["id"] == "outlook" for t in d["tasks"]))
