import re

with open('src/pages/Dashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "{/* Grid Lines */}"
end_marker = "{/* CHART RENDERING: BARS OR AREA */}"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + content[end_idx:]
    with open('src/pages/Dashboard.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Old tooltip and grid removed.")
else:
    print("Could not find markers.")

