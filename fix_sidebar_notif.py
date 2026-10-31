import re

with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<NotificationCenter userRole="admin" />', '<NotificationCenter userRole="admin" userId={auth.currentUser?.uid} />')

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Sidebar.tsx")
