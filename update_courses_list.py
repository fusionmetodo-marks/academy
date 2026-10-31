import re

with open('src/components/CoursesList.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add MoreVertical, Copy to lucide-react imports
if "MoreVertical" not in content:
    content = content.replace("Trash2", "Trash2, MoreVertical, Copy")

# Add state for menu
if "const [openMenuId" not in content:
    content = content.replace("const [deletingCourse, setDeletingCourse]", "const [openMenuId, setOpenMenuId] = useState<string | null>(null);\n  const [deletingCourse, setDeletingCourse]")

# Add handleCopy function
copy_func = """
  const handleCopyLink = (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/checkout?courseId=${courseId}`;
    navigator.clipboard.writeText(link);
    setToastMessage({ text: 'Link copiado com sucesso!', type: 'success' });
    setOpenMenuId(null);
  };
"""
if "handleCopyLink" not in content:
    content = content.replace("const handleOpenEditModal", copy_func + "\n  const handleOpenEditModal")

# Replace the action buttons with the dropdown
old_buttons = """                  {/* Botões de Ação do Card: Editar e Eliminar */}
                  <div className="flex gap-1.5 text-gray-400">
                    <button 
                      id={`btn-edit-course-${course.id}`}
                      onClick={(e) => handleOpenEditModal(course, e)}
                      className="hover:text-[#e9c349] p-2 rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-all cursor-pointer text-gray-300"
                      title="Editar Configurações do Curso"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      id={`btn-delete-course-${course.id}`}
                      onClick={(e) => handleOpenDeleteModal(course, e)}
                      className="hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer text-gray-300"
                      title="Excluir Curso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>"""

new_buttons = """                  {/* Menu de Ações (Copiar, Editar, Eliminar) */}
                  <div className="relative">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === course.id ? null : course.id);
                      }}
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-all cursor-pointer focus:outline-none"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {openMenuId === course.id && (
                      <>
                        <div 
                          className="fixed inset-0 z-30" 
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} 
                        />
                        <div className="absolute right-0 mt-2 w-48 bg-[#181818] border border-gray-800 rounded-xl shadow-2xl py-1 z-40 overflow-hidden animate-in fade-in zoom-in-95">
                          <button 
                            onClick={(e) => handleCopyLink(course.id, e)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                          >
                            <Copy className="w-4 h-4" />
                            Copiar Link
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleOpenEditModal(course, e); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                            Editar Curso
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleOpenDeleteModal(course, e); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            Excluir Curso
                          </button>
                        </div>
                      </>
                    )}
                  </div>"""

content = content.replace(old_buttons, new_buttons)

with open('src/components/CoursesList.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

