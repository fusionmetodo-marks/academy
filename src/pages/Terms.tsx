import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] antialiased selection:bg-primary/30 selection:text-primary">
      {/* Glow ambient background */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#e9c349]/5 blur-[120px] rounded-full pointer-events-none"></div>

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
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white font-headline">Termos e Condições de Uso</h1>
          <p className="text-sm text-stone-400 font-mono">Última atualização: 22 de Agosto de 2026</p>
        </div>

        <div className="prose prose-invert prose-stone max-w-none space-y-8 text-stone-300 text-sm md:text-base leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">1. Introdução e Aceitação dos Termos</h2>
            <p>
              Bem-vindo à <strong>Marks o Monstro - ACADEMY</strong>. Ao se cadastrar, acessar, comprar ou utilizar nossa plataforma de aulas e mentorias de trading, você declara estar ciente e concordar integralmente com estes Termos e Condições de Uso.
            </p>
            <p>
              Se você não concordar com qualquer disposição aqui contida, por favor, não se registre nem utilize os serviços oferecidos por nossa plataforma de formação em trading.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">2. Cadastro de Usuário e Segurança de Conta</h2>
            <p>
              Para usufruir de nossas aulas, sejam gratuitas ou pagas, é necessário efetuar um cadastro fornecendo informações verídicas, completas e atualizadas.
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Cada usuário é responsável exclusivo por manter a confidencialidade de suas credenciais de login.</li>
              <li>A conta é pessoal e intransmissível. O compartilhamento de senhas ou acesso simultâneo não autorizado resultará em suspensão imediata da conta sem direito a qualquer reembolso.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">3. Propriedade Intelectual e Licença de Uso</h2>
            <p>
              Todo o conteúdo disponibilizado na plataforma (incluindo videoaulas, materiais de apoio em PDF, logotipos, softwares, imagens, áudios e textos) é de propriedade exclusiva da <strong>Marks o Monstro - ACADEMY</strong> ou de seus licenciadores, sendo protegido pelas leis internacionais de direitos autorais.
            </p>
            <p>
              Ao adquirir um curso, é concedida a você uma licença de acesso de caráter pessoal, temporário, não exclusivo e intransferível. É estritamente proibido:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Fazer download dos vídeos sem autorização expressa.</li>
              <li>Copiar, revender, piratear ou distribuir qualquer material a terceiros.</li>
              <li>Utilizar nossos métodos para fins de plágio comercial ou institucional.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">4. Políticas de Pagamento, Reembolso e Moeda</h2>
            <p>
              Os pagamentos efetuados pelos treinamentos são seguros e gerenciados por integradores de pagamentos parceiros de alta confiabilidade.
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Os preços são estabelecidos de forma transparente e as transações podem ser efetuadas em Kwanza (AOA) ou outras moedas habilitadas no checkout.</li>
              <li>O reembolso total ou arrependimento de compra poderá ser solicitado de acordo com o prazo legal estabelecido para produtos de educação a distância (EAD), desde que não tenha havido consumo integral de mais de 30% do conteúdo total do curso.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">5. Limitação de Responsabilidade</h2>
            <p>
              A CFA provê treinamentos, estratégias e estudos de caso de negócios práticos. Não garantimos lucros fixos ou resultados financeiros imediatos, visto que o desempenho empresarial e de investimentos depende única e exclusivamente do esforço, da implementação prática e da conjuntura de mercado individual de cada aluno.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white font-headline">6. Alterações nos Termos</h2>
            <p>
              Reservamos-nos o direito de alterar estes Termos a qualquer momento. Modificações importantes serão notificadas diretamente aos usuários cadastrados via e-mail ou aviso proeminente no portal acadêmico.
            </p>
          </section>

          <div className="pt-8 border-t border-[#353534]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-xs text-stone-400">
              <ShieldCheck className="w-5 h-5 text-secondary" />
              Sua navegação e compras estão protegidas por criptografia SSL.
            </div>
            <Link to="/sales" className="px-6 py-2.5 bg-[#e9c349] text-stone-900 font-extrabold text-sm rounded-xl hover:opacity-90 transition-all">
              Entendi e Aceito
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
