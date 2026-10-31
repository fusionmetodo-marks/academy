import re

with open('src/types.ts', 'r', encoding='utf-8') as f:
    content = f.read()

if 'authorEmail?: string;' not in content:
    content = content.replace('authorId?: string;', 'authorId?: string;\n  authorEmail?: string;')
if 'producerEmail?: string;' not in content:
    content = content.replace('producerId?: string;', 'producerId?: string;\n  producerEmail?: string;')

with open('src/types.ts', 'w', encoding='utf-8') as f:
    f.write(content)

# Now Settings.tsx
with open('src/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
if 'newCoupon.producerEmail = currentUserFullProfile?.email;' not in content:
    content = content.replace(
        "newCoupon.producerId = currentUserFullProfile?.uid;",
        "newCoupon.producerId = currentUserFullProfile?.uid;\n        newCoupon.producerEmail = currentUserFullProfile?.email;"
    )
if 'base.producerEmail = currentUserFullProfile?.email;' not in content:
    content = content.replace(
        "base.producerId = currentUserFullProfile?.uid;",
        "base.producerId = currentUserFullProfile?.uid;\n          base.producerEmail = currentUserFullProfile?.email;"
    )
with open('src/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# Now CoursesList.tsx
with open('src/components/CoursesList.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
if 'authorEmail: currentUser?.email,' not in content:
    content = content.replace(
        "authorId,",
        "authorId,\n      authorEmail: currentUser?.email,"
    )
with open('src/components/CoursesList.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Models to include emails")
