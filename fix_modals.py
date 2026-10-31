import re

with open('src/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to strip out the broken modals at the bottom and replace them with properly formatted ones.

modal_start = "      {/* Producer Bank Modal */}"

if modal_start in content:
    content = content[:content.find(modal_start)]
    
# Now, we will inject the exact correct modals at the bottom.

new_modals = """
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
              <form onSubmit={handleSaveProducerData} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Nome / Marca do Produtor
                    </label>
                    <input
                      type="text"
                      value={producerData.producerName}
                      onChange={(e) => setProducerData(p => ({ ...p, producerName: e.target.value }))}
                      placeholder="Ex: Prof. António Cassaminha"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      WhatsApp para Contacto
                    </label>
                    <input
                      type="text"
                      value={producerData.producerWhatsApp}
                      onChange={(e) => setProducerData(p => ({ ...p, producerWhatsApp: e.target.value }))}
                      placeholder="Ex: 923456789"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Titular da Conta Bancária
                    </label>
                    <input
                      type="text"
                      value={producerData.producerHolderName}
                      onChange={(e) => setProducerData(p => ({ ...p, producerHolderName: e.target.value }))}
                      placeholder="Ex: Nome Completo do Titular"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Banco
                    </label>
                    <input
                      type="text"
                      value={producerData.producerBankName}
                      onChange={(e) => setProducerData(p => ({ ...p, producerBankName: e.target.value }))}
                      placeholder="Ex: BFA, BAI, BIC, Atlântico"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      IBAN (Angola)
                    </label>
                    <input
                      type="text"
                      value={producerData.producerIban}
                      onChange={(e) => setProducerData(p => ({ ...p, producerIban: e.target.value }))}
                      placeholder="Ex: AO06 0040 0000 0000 0000 0"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs font-mono focus:border-[#e9c349] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
                      Multicaixa Express (Telefone)
                    </label>
                    <input
                      type="text"
                      value={producerData.producerExpressPhone}
                      onChange={(e) => setProducerData(p => ({ ...p, producerExpressPhone: e.target.value }))}
                      placeholder="Ex: 923456789"
                      className="w-full bg-[#0e0e0e] border border-stone-800 text-white rounded-xl px-4 py-3 text-xs font-mono focus:border-[#e9c349] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-between items-center border-t border-outline-variant/10">
                  <p className="text-[11px] text-stone-400 italic">
                    🔒 Seus dados serão exibidos no checkout dos seus cursos.
                  </p>
                  <button
                    type="submit"
                    disabled={isSavingProducerData}
                    className="px-6 py-3 bg-[#e9c349] hover:bg-[#d8b33c] text-stone-900 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingProducerData ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Guardar Dados Bancários</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
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
                  <h2 className="text-xl font-headline font-bold text-white">Seu Plano de Assinatura CFA</h2>
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
              <div className="space-y-6">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0 mt-0.5">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-emerald-300 block text-sm">
                      🎁 Cadastro Inicial 100% Gratuito! Pagamento Apenas no Fim do Período
                    </span>
                    <p className="text-stone-300 leading-relaxed">
                      A sua conta de produtor permite criar, organizar e publicar os seus cursos gratuitamente. O pagamento da taxa do plano escolhido (Mensal ou Trimestral) só é realizado no final do mês ou trimestre de utilização.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div 
                    onClick={() => setProducerData(p => ({ ...p, producerPlan: 'monthly' }))}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      producerData.producerPlan === 'monthly'
                        ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg'
                        : 'bg-[#0e0e0e] border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-base text-[#e9c349]">Plano Mensal</span>
                      {producerData.producerPlan === 'monthly' && (
                        <span className="text-[10px] bg-[#e9c349] text-black font-bold px-2 py-0.5 rounded-full">Ativo</span>
                      )}
                    </div>
                    <div className="text-xl font-black text-white font-mono mb-2">3.500 Kz <span className="text-xs text-stone-400 font-normal">/ mês</span></div>
                    <p className="text-xs text-stone-400 leading-relaxed">Publicação de cursos, monitoramento de alunos e recebimento direto.</p>
                  </div>

                  <div 
                    onClick={() => setProducerData(p => ({ ...p, producerPlan: 'quarterly' }))}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      producerData.producerPlan === 'quarterly'
                        ? 'bg-[#e9c349]/10 border-[#e9c349] text-white shadow-lg'
                        : 'bg-[#0e0e0e] border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-base text-[#e9c349]">Plano Trimestral</span>
                      {producerData.producerPlan === 'quarterly' && (
                        <span className="text-[10px] bg-[#e9c349] text-black font-bold px-2 py-0.5 rounded-full">Ativo</span>
                      )}
                    </div>
                    <div className="text-xl font-black text-white font-mono mb-2">7.000 Kz <span className="text-xs text-stone-400 font-normal">/ 3 meses</span></div>
                    <p className="text-xs text-stone-400 leading-relaxed">Economia e estabilidade de 3 meses de subscrição na plataforma CFA.</p>
                  </div>
                </div>

                <div className="p-4 bg-[#0e0e0e] border border-stone-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-white block">Suporte e Pagamento do Plano (Grupo Cassaminha)</span>
                    <span className="text-[11px] text-stone-400">Guarde o plano escolhido no seu contrato e envie o comprovativo ao Maestro pelo WhatsApp.</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveProducerPlan}
                      disabled={isSavingProducerData}
                      className="px-4 py-2.5 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                      title="Salvar método e plano selecionados para vinculação ao seu contrato"
                    >
                      <CheckCircle2 className="w-4 h-4 text-black" />
                      <span>{isSavingProducerData ? 'A guardar...' : 'Guardar Plano no Contrato'}</span>
                    </button>
                    <a
                      href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(`Olá Maestro, acabei de guardar o meu plano de produtor (${producerData.producerPlan === 'monthly' ? 'Mensal - 3.500 Kz' : 'Trimestral - 7.000 Kz'}). Segue o comprovativo.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Enviar Comprovativo</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
"""

with open('src/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.write(content + new_modals)

print("Done")
