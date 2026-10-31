import re

with open('src/pages/StudentDirectory.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("onClick={() => setIsRegisterModalOpen(true); setGenerateInvoice(false); }", "onClick={() => { setIsRegisterModalOpen(true); setGenerateInvoice(false); }}")
content = content.replace("onClick={() => setSelectedStudentForCourses(student); setGenerateInvoice(false);}", "onClick={() => { setSelectedStudentForCourses(student); setGenerateInvoice(false); }}")

with open('src/pages/StudentDirectory.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
