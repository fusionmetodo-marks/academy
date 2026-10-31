import re

with open('src/pages/VideoLibrary.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("user?.uid || auth.currentUser?.uid", "auth.currentUser?.uid")

with open('src/pages/VideoLibrary.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed")
