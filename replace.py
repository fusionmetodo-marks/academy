import re

with open('src/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the producer view main rendering logic

target_str = """        {/* 3 Main Interactive Buttons / Cards */}
        {currentUserRole === 'producer' ? (
          /* PAINEL DE CONFIGURAÇÕES DO PRODUTOR */
          <div className="space-y-8 max-w-4xl mb-12">"""

end_str = """            </div>
          </div>
        ) : ("""

# Find start and end indices
start_idx = content.find(target_str)
end_idx = content.find(end_str, start_idx) + len(end_str)

if start_idx == -1 or content.find(end_str, start_idx) == -1:
    print("Could not find the target block.")
    exit(1)

# Extract the old block to pull out the form components
old_block = content[start_idx:end_idx]

# Build the new UI block
new_ui_block = """        {/* 3 Main Interactive Buttons / Cards */}
        {currentUserRole === 'producer' ? (
          /* PAINEL DE CONFIGURAÇÕES DO PRODUTOR (Grid) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {/* BUTTON 1: Dados Bancários */}
            <section 
              onClick={() => setIsProducerBankModalOpen(true)}
              className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 1</span>
                  <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                    Meus Dados Bancários
                  </h3>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                    Configure as suas coordenadas de IBAN e Multicaixa Express para receber pagamentos.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/10">
                <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                  <span>Atualizar Dados Bancários</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </section>

            {/* BUTTON 2: Plano de Assinatura */}
            <section 
              onClick={() => setIsProducerPlanModalOpen(true)}
              className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 2</span>
                  <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                    Plano de Assinatura
                  </h3>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                    Acompanhe e configure a sua subscrição (mensal ou trimestral).
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/10">
                <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                  <span>Visualizar Assinatura</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </section>

            {/* BUTTON 3: Meu Contrato Digital */}
            <section 
              onClick={() => setIsContractModalOpen(true)}
              className="group relative bg-surface-container-low hover:bg-surface-container rounded-2xl p-6 sm:p-7 border border-outline-variant/10 hover:border-[#e9c349]/50 shadow-lg hover:shadow-[0_8px_30px_rgba(233,195,73,0.15)] transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[#e9c349]/10 group-hover:bg-[#e9c349] text-[#e9c349] group-hover:text-black flex items-center justify-center border border-[#e9c349]/20 transition-all">
                    <FileText className="w-6 h-6" />
                  </div>
                  <span className="p-2 rounded-xl bg-surface-container-highest group-hover:bg-[#e9c349]/20 text-stone-400 group-hover:text-[#e9c349] transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </div>
                <div className="mb-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#e9c349] block mb-1">Módulo 3</span>
                  <h3 className="font-headline text-xl font-bold text-white group-hover:text-[#e9c349] transition-colors">
                    Meu Contrato
                  </h3>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-5 leading-relaxed">
                    Consulte os termos legais celebrados com a CFA Cassaminha Financial Academy.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-outline-variant/10">
                <div className="w-full py-2.5 px-4 bg-surface-container-highest group-hover:bg-[#e9c349] text-stone-300 group-hover:text-black font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                  <span>Visualizar e Baixar PDF</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </section>
          </div>
        ) : ("""

content = content.replace(old_block, new_ui_block)

# Extract forms content
bank_form_match = re.search(r'(<form onSubmit=\{handleSaveProducerData\}.*?</form>)', old_block, re.DOTALL)
plan_form_match = re.search(r'(<div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6 md:p-8 shadow-xl space-y-6">\s*<div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">.*?</button>\s*<a.*?</a>\s*</div>\s*</div>\s*</div>)', old_block, re.DOTALL)

if not bank_form_match or not plan_form_match:
    print("Could not extract forms.")

bank_form_inner = bank_form_match.group(1).replace('className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6 md:p-8 shadow-xl space-y-6"', 'className="space-y-6"')
plan_form_inner = plan_form_match.group(1).replace('className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-6 md:p-8 shadow-xl space-y-6"', 'className="space-y-6"')

# Modify the plan form inner slightly to remove the parent div wrapper if any, but it's fine.

bank_form_cleaned = re.sub(r'<div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">.*?</div>', '', bank_form_inner, flags=re.DOTALL)
plan_form_cleaned = re.sub(r'<div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">.*?</div>', '', plan_form_inner, flags=re.DOTALL)

# Build modals
modals_safe = """
      {/* Producer Bank Modal */}
      {isProducerBankModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/20 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-lowest">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold border border-[#e9c349]/20">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-headline font-bold text-white">Seus Dados Bancários</h2>
                  <p className="text-xs text-stone-400">Quando um aluno comprar seu curso, o dinheiro vai direto para a sua conta.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProducerBankModalOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 md:p-8 max-h-[75vh] overflow-y-auto">
              {BANK_FORM_PLACEHOLDER}
            </div>
          </div>
        </div>
      )}

      {/* Producer Plan Modal */}
      {isProducerPlanModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/20 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-lowest">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center font-bold border border-[#e9c349]/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-headline font-bold text-white">Seu Plano de Assinatura</h2>
                  <p className="text-xs text-stone-400">Escolha o seu plano para publicar cursos e gerir seus alunos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProducerPlanModalOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 md:p-8 max-h-[75vh] overflow-y-auto">
              {PLAN_FORM_PLACEHOLDER}
            </div>
          </div>
        </div>
      )}
"""

modals_safe = modals_safe.replace('{BANK_FORM_PLACEHOLDER}', bank_form_cleaned)
modals_safe = modals_safe.replace('{PLAN_FORM_PLACEHOLDER}', plan_form_cleaned)

end_of_file_tag = "    </div>\n  );\n}\n"
if end_of_file_tag in content:
    content = content.replace(end_of_file_tag, modals_safe + "\n" + end_of_file_tag)
else:
    print("Could not find EOF tag.")

with open('src/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
