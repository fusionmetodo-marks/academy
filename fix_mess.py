with open('src/components/CoursesList.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("<Trash2, MoreVertical, Copy", "<Trash2")
content = content.replace("import { Plus, Edit, Trash2, MoreVertical, Copy, MoreVertical, Copy", "import { Plus, Edit, Trash2, MoreVertical, Copy")

with open('src/components/CoursesList.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
