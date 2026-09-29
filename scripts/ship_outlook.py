import json, io, base64
from PIL import Image

SRC = r"C:\Users\Sete_\.factory\generated-images\flat-vector-app-icon-of-the-microsoft-outlook-lo.png"
MP = r"D:\dev2\scrolls-community-tasks\manifest.json"

# 1. resize icon to 96x96 (la28 icon header size) and base64 it
im = Image.open(SRC).convert("RGBA")
im = im.resize((96, 96), Image.LANCZOS)
tmp = r"D:\dev2\scrolls-community-tasks\scripts\outlook_icon_96.png"
im.save(tmp, optimize=True)
b64 = base64.b64encode(open(tmp, "rb").read()).decode()
uri = "data:image/png;base64," + b64
print("icon data-uri length:", len(uri))

# 2. manifest: add icon + minRole admin
m = json.loads(io.open(MP, encoding="utf-8").read())
o = [t for t in m["tasks"] if t["id"] == "outlook"][0]
o["icon"] = uri
o["minRole"] = "admin"
io.open(MP, "w", encoding="utf-8", newline="\n").write(json.dumps(m, indent=2, ensure_ascii=False))

# 3. verify
m = json.loads(io.open(MP, encoding="utf-8").read())
o = [t for t in m["tasks"] if t["id"] == "outlook"][0]
print("outlook keys now:", sorted(o.keys()))
print("minRole:", o["minRole"], "| icon len:", len(o["icon"]))
print("tasks count:", len(m["tasks"]))
