import re

with open('src/components/StudentLayout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace <NotificationCenter /> with <NotificationCenter userRole="student" userId={auth.currentUser?.uid} />
content = content.replace("<NotificationCenter />", "<NotificationCenter userRole=\"student\" userId={auth.currentUser?.uid} />")

with open('src/components/StudentLayout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed NotificationCenter in StudentLayout.tsx")
