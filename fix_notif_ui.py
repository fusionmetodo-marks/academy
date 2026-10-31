import re

with open('src/components/NotificationCenter.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the dropdown positioning for mobile
pattern = re.compile(r'<div className="absolute right-0 mt-3 w-80 sm:w-96 bg-\[#12141a\] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col text-stone-200 animate-fadeIn">')
new_classes = '<div className="fixed inset-x-2 top-20 sm:absolute sm:inset-auto sm:right-0 sm:mt-3 w-auto sm:w-96 bg-[#12141a] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col text-stone-200 animate-fadeIn origin-top">'

content = pattern.sub(new_classes, content)

with open('src/components/NotificationCenter.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated NotificationCenter UI")
