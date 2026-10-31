import re

with open('src/components/CourseEditor.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
content = content.replace("ExternalLink\n} from 'lucide-react';", "ExternalLink,\n  Copy,\n  ClipboardPaste\n} from 'lucide-react';")

# 2. Add handleCopyLesson and handlePasteLesson
functions_to_add = """
  // Funções para copiar e colar aula
  const handleCopyLesson = (lesson: Lesson) => {
    try {
      localStorage.setItem('copied_lesson', JSON.stringify(lesson));
      alert(`Aula "${lesson.title}" copiada! Pode colá-la em qualquer módulo.`);
    } catch (e) {
      console.error(e);
      alert('Erro ao copiar aula.');
    }
  };

  const handlePasteLesson = (moduleId: string) => {
    try {
      const copiedRaw = localStorage.getItem('copied_lesson');
      if (!copiedRaw) {
        alert('Nenhuma aula copiada.');
        return;
      }
      const copiedLesson = JSON.parse(copiedRaw) as Lesson;
      
      setModules(modules.map(mod => {
        if (mod.id === moduleId) {
          const newLesson: Lesson = {
            ...copiedLesson,
            id: `l_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            moduleId,
            courseId,
            order: mod.lessons.length + 1
          };
          
          return {
            ...mod,
            lessons: [...mod.lessons, newLesson]
          };
        }
        return mod;
      }));
    } catch (e) {
      console.error(e);
      alert('Erro ao colar aula.');
    }
  };

"""

# Let's place it right before "// 8. Reordenação e Mover Módulos"
content = content.replace("  // 8. Reordenação e Mover Módulos (Troca de posição e renumeração automática)", functions_to_add + "  // 8. Reordenação e Mover Módulos (Troca de posição e renumeração automática)")


# 3. Add Colar Aula Button
colar_btn = """                        <button
                          onClick={() => handlePasteLesson(mod.id)}
                          className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 hover:border-[#e9c349] text-gray-300 hover:text-[#e9c349] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Colar aula previamente copiada"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5" /> Colar
                        </button>
"""

content = content.replace("""                        <button
                          id={`btn-add-lesson-mod-${mod.id}`}""", colar_btn + """                        <button
                          id={`btn-add-lesson-mod-${mod.id}`}""")


# 4. Add Copiar Aula Button
copiar_btn = """                              <button
                                onClick={() => handleCopyLesson(lesson)}
                                className="p-1.5 text-gray-400 hover:text-[#e9c349] hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                                title="Copiar Aula"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
"""
content = content.replace("""                              <button
                                id={`btn-edit-lesson-${lesson.id}`}""", copiar_btn + """                              <button
                                id={`btn-edit-lesson-${lesson.id}`}""")

with open('src/components/CourseEditor.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
