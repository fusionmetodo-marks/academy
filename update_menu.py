import re

with open('src/components/CoursesList.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace buttons block with menu
old_buttons_regex = r'\{\/\*\s*Botões de Ação do Card: Editar e Eliminar\s*\*\/\}.*?<Trash2 className="w-4 h-4" />\s*</button>\s*</div>'

new_buttons = """{/* Menu de Ações (Copiar, Editar, Eliminar) */}
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
                            Excluir
                          </button>
                        </div>
                      </>
                    )}
                  </div>"""

content = re.sub(old_buttons_regex, new_buttons, content, flags=re.DOTALL)

with open('src/components/CoursesList.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

