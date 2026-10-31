with open('src/pages/StudentDirectory.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

leftover = """                  </label>
                );
              })}
            </div>"""

if leftover in content:
    content = content.replace(leftover, "")
    print("Replaced leftover")

with open('src/pages/StudentDirectory.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
