import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Lock } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] antialiased selection:bg-primary/30 selection:text-primary">
      {/* Glow ambient background */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#e9c349]/5 blur-[120px] rounded-full pointer-events-none"></div>

      <header className="border-b border-[#353534]/30 bg-[#131313]/90 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/sales" className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#e9c349] transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar ao Início
          </Link>
          <div className="text-sm font-black tracking-tighter text-[#e9c349]">CFA Academy</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 relative z-10">
        <div className="space-y-4 mb-12">
          <div className="w-12 h-12 rounded-xl bg-[#e9c349]/10 text-[#e9c349] flex items-center justify-center border border-[#e9c349]/20">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white font-headline">Política de Privacidade</h1>
          <p className="text-sm text-stone-400 font-mono">Última atualização: 22 de Agosto de 2026</p>
        </div>

        <div className="prose prose-invert prose-stone max-w-none space-y-8 text-stone-300 text-sm md:text-base leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">1. Compromisso com a sua Segurança</h2>
            <p>
              A <strong>Marks o Monstro - ACADEMY</strong> tem como prioridade absoluta a proteção, privacidade e segurança de todos os dados pessoais coletados de nossos estudantes, visitantes e assinantes. Esta política descreve como tratamos suas informações de maneira transparente, legal e em conformidade com as diretrizes internacionais de segurança de dados.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">2. Informações que Coletamos</h2>
            <p>
              Durante seu cadastro ou processo de inscrição, nós coletamos dados essenciais para personalizar sua jornada acadêmica e processar transações com segurança:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Dados Cadastrais:</strong> Nome completo, endereço de e-mail, número de telefone e dados de login.</li>
              <li><strong>Informações de Pagamento:</strong> Dados de cobrança e histórico de compras. Informações críticas de cartão de crédito não são salvas em nossos servidores, mas sim processadas por gateways de pagamento em conformidade com os padrões PCI-DSS.</li>
              <li><strong>Dados de Utilização:</strong> Aulas assistidas, progresso dos cursos, comentários, logs de acesso e interações com a plataforma para fins de melhoria de usabilidade e suporte personalizado.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">3. Finalidade do Tratamento de Dados</h2>
            <p>
              Seus dados pessoais são utilizados de forma responsável para:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Fornecer e gerenciar o acesso às videoaulas, materiais didáticos e certificados.</li>
              <li>Processar as operações financeiras e liberar as assinaturas contratadas de forma imediata.</li>
              <li>Enviar atualizações importantes de cursos, comunicados acadêmicos e novidades da plataforma.</li>
              <li>Oferecer suporte ativo através de e-mail ou do nosso atendimento direto via WhatsApp.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">4. Compartilhamento de Dados com Terceiros</h2>
            <p>
              Nós **nunca** vendemos, alugamos ou comercializamos seus dados pessoais para fins publicitários de terceiros. As informações podem ser compartilhadas apenas com:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provedores de infraestrutura de nuvem hospedada (Google Firebase, etc.) necessários para o funcionamento pleno do portal.</li>
              <li>Gateways de pagamento credenciados que viabilizam o faturamento seguro em Kwanza (Kz) ou internacional.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">5. Direitos do Titular dos Dados</h2>
            <p>
              Você, como estudante da Marks o Monstro - ACADEMY, possui plenos direitos sobre suas informações, incluindo:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Solicitar a confirmação e acesso detalhado aos seus dados armazenados.</li>
              <li>Retificar dados incompletos, desatualizados ou incorretos em sua aba de configurações.</li>
              <li>Solicitar a exclusão definitiva ou anonimização de sua conta (ressalvando-se prazos legais de manutenção de registros fiscais e contábeis de faturamento).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">6. Uso de Cookies e Tecnologias de Rastreamento</h2>
            <p>
              Utilizamos cookies essenciais para manter você autenticado em sua conta acadêmica e lembrar suas preferências de volume, aula assistida e modo de visualização. Cookies analíticos nos ajudam a medir o tráfego de nossa vitrine para aperfeiçoar nossos servidores.
            </p>
          </section>

          <div className="pt-8 border-t border-[#353534]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-xs text-stone-400">
              <ShieldAlert className="w-5 h-5 text-secondary" />
              Compromisso estrito com a Lei Geral de Proteção de Dados (LGPD).
            </div>
            <Link to="/sales" className="px-6 py-2.5 bg-[#e9c349] text-stone-900 font-extrabold text-sm rounded-xl hover:opacity-90 transition-all">
              Aceitar Políticas
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
