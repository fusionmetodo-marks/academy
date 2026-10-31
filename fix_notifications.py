import re

with open('src/components/CourseEditor.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix notifyNewModule
content = content.replace("""      // Dispara notificação de Novo Módulo
      notifyNewModule({
        courseId,
        courseTitle: title || 'Curso CFA Academy',
        moduleTitle: cleanTitle
      }).catch(err => console.warn('Erro ao disparar notificação de módulo:', err));""", """      // Dispara notificação de Novo Módulo
      if (isPublished) {
        notifyNewModule({
          courseId,
          courseTitle: title || 'Curso CFA Academy',
          moduleTitle: cleanTitle
        }).catch(err => console.warn('Erro ao disparar notificação de módulo:', err));
      }""")

# Fix notifyNewLesson
content = content.replace("""          // Dispara notificação de Nova Aula para alunos
          notifyNewLesson({
            courseId,
            courseTitle: title || 'Curso CFA Academy',
            moduleTitle: mod.title,
            lessonTitle: cleanLessonTitle
          }).catch(err => console.warn('Erro ao disparar notificação de aula:', err));""", """          // Dispara notificação de Nova Aula para alunos
          if (isPublished) {
            notifyNewLesson({
              courseId,
              courseTitle: title || 'Curso CFA Academy',
              moduleTitle: mod.title,
              lessonTitle: cleanLessonTitle
            }).catch(err => console.warn('Erro ao disparar notificação de aula:', err));
          }""")

with open('src/components/CourseEditor.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed notifications in CourseEditor.tsx")
