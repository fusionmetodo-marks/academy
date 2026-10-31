import os

files_to_fix = [
    'src/components/StudentLayout.tsx',
    'src/components/StudentProfile.tsx',
    'src/pages/VideoLibrary.tsx',
    'src/pages/StudentPortal.tsx'
]

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the handleReturnToAdmin or equivalent code
    content = content.replace("window.location.href = '/dashboard';", "navigate('/dashboard');")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed admin routing")
