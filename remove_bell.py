import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'\s*<div className="hidden lg:flex items-center">\s*<NotificationCenter userRole="admin" userId=\{auth\.currentUser\?\.uid\} />\s*</div>')
content = pattern.sub('', content)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Removed redundant NotificationCenter from Sidebar")
