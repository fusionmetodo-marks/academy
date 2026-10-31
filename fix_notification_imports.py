import re

with open('src/services/notificationService.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("serverTimestamp,", "serverTimestamp,\n  getDoc,")

with open('src/services/notificationService.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Added getDoc")
