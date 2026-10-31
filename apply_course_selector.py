import re

with open('src/pages/StudentDirectory.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add states
state_target = "const [generateInvoice, setGenerateInvoice] = useState(false);"
state_replacement = """const [generateInvoice, setGenerateInvoice] = useState(false);
  const [courseSelectorTarget, setCourseSelectorTarget] = useState<'register' | 'manage' | null>(null);
  const [courseSelectorSearch, setCourseSelectorSearch] = useState('');"""

if "const [courseSelectorTarget" not in content:
    content = content.replace(state_target, state_replacement)

# 2. Modal 1: replace the inline courses list in "Cadastrar Novo Aluno"
modal1_old_regex = r'\{\/\*\s*Seleção de Cursos a Liberar\s*\*\/\}\s*<div className="pt-2">\s*<label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">\s*Cursos a Liberar Imediatamente para o Aluno\s*<\/label>\s*<div className="space-y-2 bg-\[#0e0e0e\] p-3\.5 rounded-xl border border-gray-800">.*?<\/div>\s*<\/div>'

modal1_new = """{/* Seleção de Cursos a Liberar */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                    Cursos a Liberar para o Aluno
                  </label>
                  <span className="text-xs font-bold text-[#e9c349]">
                    {formData.selectedCourses.length} {formData.selectedCourses.length === 1 ? 'curso selecionado' : 'cursos selecionados'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCourseSelectorSearch('');
                    setCourseSelectorTarget('register');
                  }}
                  className="w-full flex items-center justify-between p-3.5 bg-[#0e0e0e] hover:bg-[#181818] border border-[#353534] hover:border-[#e9c349]/60 rounded-xl transition-all group cursor-pointer text-left shadow-inner"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-[#e9c349] transition-colors">
                        {formData.selectedCourses.length === 0
                          ? 'Nenhum curso selecionado'
                          : `${formData.selectedCourses.length} ${formData.selectedCourses.length === 1 ? 'curso selecionado' : 'cursos selecionados'}`}
                      </p>
                      <p className="text-xs text-stone-400">
                        Clique para abrir a tela ampla e escolher os cursos
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1.5 bg-[#e9c349] text-black rounded-lg group-hover:bg-[#d4b03f] transition-all flex items-center gap-1.5 shadow-sm shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                    Selecionar Cursos
                  </span>
                </button>

                {/* Chips com os cursos selecionados */}
                {formData.selectedCourses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-28 overflow-y-auto p-1">
                    {formData.selectedCourses.map(id => {
                      const c = isolatedCourses.find(item => item.id === id);
                      return (
                        <span 
                          key={id} 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#e9c349]/15 border border-[#e9c349]/40 text-[#e9c349] text-xs font-medium"
                        >
                          <span className="truncate max-w-[200px]">{c ? c.title : id}</span>
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); toggleCourseSelection(id); }}
                            className="text-stone-400 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Opção de Faturamento / Contabilização */}
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 mt-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-400">Contabilizar como Venda Faturada</p>
                      <p className="text-[11px] text-emerald-500/80">
                        {generateInvoice 
                          ? 'Será registrada no Dashboard como venda aprovada' 
                          : 'Atribuição gratuita (não soma nas vendas do Dashboard)'}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      checked={generateInvoice} 
                      onChange={(e) => setGenerateInvoice(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>"""

content = re.sub(modal1_old_regex, modal1_new, content, flags=re.DOTALL)

# 3. Modal 2: replace the inline courses list in "Gerenciar Cursos do Aluno"
modal2_old_regex = r'<p className="text-xs text-gray-400 mb-4 leading-relaxed">\s*Marque os cursos que devem estar destrancados para este aluno na área de estudos:\s*<\/p>\s*<div className="space-y-2 mb-6 bg-\[#0e0e0e\] p-3\.5 rounded-xl border border-gray-800 max-h-60 overflow-y-auto">.*?<\/div>'

modal2_new = """<div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Defina os cursos com acesso liberado para este aluno:
                </p>
                <span className="text-xs font-bold text-[#e9c349]">
                  {studentEnrolledCourses.length} {studentEnrolledCourses.length === 1 ? 'curso liberado' : 'cursos liberados'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCourseSelectorSearch('');
                  setCourseSelectorTarget('manage');
                }}
                className="w-full flex items-center justify-between p-3.5 bg-[#0e0e0e] hover:bg-[#181818] border border-[#353534] hover:border-[#e9c349]/60 rounded-xl transition-all group cursor-pointer text-left shadow-inner"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-[#e9c349] transition-colors">
                      {studentEnrolledCourses.length === 0
                        ? 'Nenhum curso liberado'
                        : `${studentEnrolledCourses.length} ${studentEnrolledCourses.length === 1 ? 'curso liberado' : 'cursos liberados'}`}
                    </p>
                    <p className="text-xs text-stone-400">
                      Clique para abrir a tela ampla e gerenciar os cursos
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 bg-[#e9c349] text-black rounded-lg group-hover:bg-[#d4b03f] transition-all flex items-center gap-1.5 shadow-sm shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  Selecionar Cursos
                </span>
              </button>

              {/* Chips com os cursos liberados */}
              {studentEnrolledCourses.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                  {studentEnrolledCourses.map(id => {
                    const c = isolatedCourses.find(item => item.id === id);
                    return (
                      <span 
                        key={id} 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#e9c349]/15 border border-[#e9c349]/40 text-[#e9c349] text-xs font-medium"
                      >
                        <span className="truncate max-w-[200px]">{c ? c.title : id}</span>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); toggleStudentCourse(id); }}
                          className="text-stone-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Opção de Faturamento / Contabilização */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-400">Contabilizar como Venda Faturada</p>
                    <p className="text-[11px] text-emerald-500/80">
                      {generateInvoice 
                        ? 'Novos cursos adicionados serão registrados no Dashboard como venda' 
                        : 'Atribuição gratuita (não soma nas vendas do Dashboard)'}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    checked={generateInvoice} 
                    onChange={(e) => setGenerateInvoice(e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>"""

content = re.sub(modal2_old_regex, modal2_new, content, flags=re.DOTALL)

# 4. Insert the large full-screen responsive Course Selector Modal before the closing tag of component
selector_modal = """
      {/* MODAL AMPLO / EM TELA CHEIA: SELETOR DE CURSOS */}
      {courseSelectorTarget && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[300] flex items-center justify-center p-3 sm:p-6 md:p-8 animate-in fade-in">
          <div className="bg-[#131313] border border-[#353534] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Header do Seletor */}
            <div className="p-4 sm:p-6 border-b border-[#353534] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#181818]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold shrink-0">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white font-headline">
                    {courseSelectorTarget === 'register' ? 'Selecionar Cursos para o Novo Aluno' : 'Gerenciar Cursos do Aluno'}
                  </h3>
                  <p className="text-xs text-stone-400">
                    Marque ou desmarque os cursos para definir o acesso do aluno. A tela expande e redimensiona conforme o catálogo.
                  </p>
                </div>
              </div>

              {/* Botões Rápidos */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = isolatedCourses.map(c => c.id);
                    if (courseSelectorTarget === 'register') {
                      setFormData(prev => ({ ...prev, selectedCourses: allIds }));
                    } else {
                      setStudentEnrolledCourses(allIds);
                    }
                  }}
                  className="px-3 py-1.5 bg-[#e9c349]/10 hover:bg-[#e9c349]/20 text-[#e9c349] border border-[#e9c349]/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Selecionar Todos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (courseSelectorTarget === 'register') {
                      setFormData(prev => ({ ...prev, selectedCourses: [] }));
                    } else {
                      setStudentEnrolledCourses([]);
                    }
                  }}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Limpar Todos
                </button>
                <button
                  type="button"
                  onClick={() => setCourseSelectorTarget(null)}
                  className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer ml-1"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Barra de Pesquisa dentro do Seletor */}
            <div className="p-4 border-b border-[#353534]/60 bg-[#0e0e0e]/50">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
                <input
                  type="text"
                  value={courseSelectorSearch}
                  onChange={(e) => setCourseSelectorSearch(e.target.value)}
                  placeholder="Pesquisar por título do curso ou ID..."
                  className="w-full bg-[#181818] border border-[#353534] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#e9c349] transition-colors"
                />
              </div>
            </div>

            {/* Grade de Cursos Responsiva e Dinâmica */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0 bg-[#131313]">
              {isolatedCourses
                .filter(course => {
                  if (!courseSelectorSearch.trim()) return true;
                  const q = courseSelectorSearch.toLowerCase();
                  return course.title.toLowerCase().includes(q) || course.id.toLowerCase().includes(q);
                })
                .length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <p className="text-sm">Nenhum curso encontrado com essa pesquisa.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {isolatedCourses
                    .filter(course => {
                      if (!courseSelectorSearch.trim()) return true;
                      const q = courseSelectorSearch.toLowerCase();
                      return course.title.toLowerCase().includes(q) || course.id.toLowerCase().includes(q);
                    })
                    .map(course => {
                      const isSelected = courseSelectorTarget === 'register'
                        ? formData.selectedCourses.includes(course.id)
                        : studentEnrolledCourses.includes(course.id);

                      const handleToggle = () => {
                        if (courseSelectorTarget === 'register') {
                          toggleCourseSelection(course.id);
                        } else {
                          toggleStudentCourse(course.id);
                        }
                      };

                      return (
                        <div
                          key={course.id}
                          onClick={handleToggle}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-[0_0_15px_rgba(233,195,73,0.15)] ring-1 ring-[#e9c349]'
                              : 'bg-[#0e0e0e] border-[#353534] text-stone-300 hover:border-stone-600 hover:bg-[#181818]'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={handleToggle}
                                className="w-5 h-5 rounded text-[#e9c349] focus:ring-[#e9c349] cursor-pointer"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-white leading-snug line-clamp-2">
                                {course.title}
                              </h4>
                              <p className="text-[11px] text-stone-500 font-mono mt-1 truncate">
                                ID: {course.id}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                            <span className="font-bold text-[#e9c349]">
                              {course.price && course.price > 0
                                ? new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(course.price)
                                : 'Acesso Grátis'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSelected ? 'bg-[#e9c349] text-black' : 'bg-stone-800 text-stone-400'
                            }`}>
                              {isSelected ? 'SELECIONADO' : 'LIBERAR'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer do Seletor */}
            <div className="p-4 sm:p-5 border-t border-[#353534] bg-[#181818] flex items-center justify-between gap-4">
              <div className="text-xs text-stone-300">
                Total selecionado: <strong className="text-[#e9c349] text-sm">
                  {courseSelectorTarget === 'register' ? formData.selectedCourses.length : studentEnrolledCourses.length}
                </strong> de {isolatedCourses.length} cursos
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCourseSelectorTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-stone-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => setCourseSelectorTarget(null)}
                  className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#e9c349] text-black hover:bg-[#d4b03f] active:scale-95 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-[#e9c349]/20"
                >
                  <CheckCircle className="w-4 h-4" />
                  Concluir Seleção
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
"""

if "MODAL AMPLO / EM TELA CHEIA: SELETOR DE CURSOS" not in content:
    content = content.replace("    </div>\n  );\n}", selector_modal + "    </div>\n  );\n}")

with open('src/pages/StudentDirectory.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied course selector successfully")
