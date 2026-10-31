import re

with open('src/components/NotificationCenter.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("await requestPushPermission();", "await requestPushPermission(userId);")

with open('src/components/NotificationCenter.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated NotificationCenter.tsx")
