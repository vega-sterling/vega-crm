import os
path = "/root/vega-crm/src/app/deals/[id]/page.tsx"
print(os.path.abspath(path))
print(os.path.getsize(path))
with open(path, "r") as f:
    s = f.read()
print("RecordPageShell:", s.count("RecordPageShell"))
print("IconPin:", s.count("IconPin"))
print("ContactCard:", s.count("ContactCard"))
print("Lines:", s.count("\n"))
print("LINE 1:", s.splitlines()[0])
print("LINE 32:", s.splitlines()[31])
print("LINE 551:", s.splitlines()[550])
