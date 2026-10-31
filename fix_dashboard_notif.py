import re

with open('src/pages/Dashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<NotificationCenter userRole="admin" />', '<NotificationCenter userRole="admin" userId={auth.currentUser?.uid} />')

with open('src/pages/Dashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Dashboard.tsx")
