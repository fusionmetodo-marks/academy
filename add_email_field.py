import re

logic = """                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      E-mail Vinculado (Identificador Oficial)
                    </label>
                    <input
                      type="email"
                      value={currentUserFullProfile?.email || auth.currentUser?.email || ''}
                      readOnly
                      disabled
                      className="w-full bg-[#0a0a0a] border border-stone-800 text-stone-500 rounded-xl px-4 py-3 text-xs focus:outline-none cursor-not-allowed font-mono"
                    />
                    <p className="text-[10px] text-stone-500 mt-1.5">Todos os seus cursos e cupões estão automaticamente associados a este e-mail.</p>
                  </div>
                  <div>"""

with open('src/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("                  <div>\n                    <label className=\"block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2\">\n                      Nome / Marca do Produtor", logic + "\n                    <label className=\"block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2\">\n                      Nome / Marca do Produtor")

with open('src/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added email field")
