import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Shield, CheckCircle2, Key, Phone, BookOpen, Lock, AlertCircle, Hash, RefreshCw, Send, Edit2, Save, X, MessageCircle } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';

export default function StudentProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [supportWhatsApp, setSupportWhatsApp] = useState<string>('244923456789');
  const [loading, setLoading] = useState(true);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');

  const [isActivatingProducer, setIsActivatingProducer] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'quarterly'>('quarterly');
  const [isProducerModalOpen, setIsProducerModalOpen] = useState(false);

  const handlePasswordReset = async () => {
    const email = profile?.email || auth.currentUser?.email;
    if (!email) {
      setResetError('E-mail não encontrado para redefinição.');
      return;
    }
    try {
      setSendingReset(true);
      setResetError('');
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      console.error("Erro ao enviar e-mail de redefinição:", err);
      setResetError(err.message || 'Erro ao enviar e-mail de recuperação.');
    } finally {
      setSendingReset(false);
    }
  };

  const handleSavePhone = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setSavingPhone(true);
      setPhoneError('');
      setPhoneSuccess('');

      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, { phoneNumber: phoneInput }, { merge: true });

      setProfile((prev: any) => ({ ...prev, phoneNumber: phoneInput }));
      setPhoneSuccess('Telefone atualizado com sucesso!');
      setIsEditingPhone(false);
      setTimeout(() => setPhoneSuccess(''), 4000);
    } catch (err: any) {
      console.error("Erro ao salvar telefone:", err);
      setPhoneError('Erro ao atualizar o número de telefone.');
    } finally {
      setSavingPhone(false);
    }
  };

  // Convert Firebase UID to a short clean numeric string
  const getNumericId = (uid: string) => {
    if (!uid) return '100458';
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
      hash = (hash * 31 + uid.charCodeAt(i)) % 1000000000;
    }
    return Math.abs(hash).toString().padStart(6, '0');
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Fetch platform support settings in parallel
        getDoc(doc(db, 'settings', 'platform')).then(snap => {
          if (snap.exists() && snap.data().supportWhatsApp) {
            setSupportWhatsApp(snap.data().supportWhatsApp);
          }
        }).catch(() => {});

        getDoc(doc(db, 'settings', 'general')).then(snap => {
          if (snap.exists() && snap.data().supportWhatsApp) {
            setSupportWhatsApp(snap.data().supportWhatsApp);
          }
        }).catch(() => {});

        const user = auth.currentUser;
        if (!user) {
          setLoading(false);
          return;
        }

        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile({
            uid: user.uid,
            email: user.email,
            ...data
          });
          setPhoneInput(data.phoneNumber || '');
        } else {
          setProfile({
            uid: user.uid,
            email: user.email,
            role: 'student',
            subscriptionStatus: 'active'
          });
        }
      } catch (err) {
        console.error("Erro ao buscar perfil do aluno:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-8 h-8 border-4 border-[#e9c349] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const enrolledCount = Array.isArray(profile?.enrolledCourses) ? profile.enrolledCourses.length : 0;
  const completedCount = Array.isArray(profile?.completedLessons) ? profile.completedLessons.length : 0;

  const handleActivateProducerRole = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setIsActivatingProducer(true);
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        role: 'producer',
        roleType: 'producer',
        subscriptionStatus: 'active',
        isApproved: true,
        producerPlan: selectedPlan,
        plan: 'Produtor'
      }, { merge: true });

      localStorage.setItem('viewAsStudent', 'false');
      window.dispatchEvent(new Event('student-view-changed'));
      navigate('/dashboard');
    } catch (err) {
      console.error("Erro ao ativar conta de produtor:", err);
      alert("Ocorreu um erro ao ativar a sua conta de produtor. Tente novamente.");
    } finally {
      setIsActivatingProducer(false);
    }
  };
  const numericId = getNumericId(profile?.uid || auth.currentUser?.uid || '');
  const fullName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}` : (auth.currentUser?.displayName || 'Estudante CFA');
  const currentPhone = profile?.phoneNumber ? `${profile.phoneCountryCode || ''} ${profile.phoneNumber}`.trim() : 'Não informado';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-headline">Meu Perfil</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">Visualize suas credenciais de acesso, nome, telefone, número de ID numérico e status da conta.</p>
      </div>

      <div className="space-y-6">
        {/* Estatísticas de Aprendizado (Acima de tudo) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-[#131313] border border-gray-800 rounded-2xl p-6 text-center">
            <BookOpen className="w-8 h-8 text-[#e9c349] mx-auto mb-2 opacity-80" />
            <span className="text-3xl font-extrabold text-white font-mono">{enrolledCount}</span>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Cursos Adquiridos</p>
          </div>

          <div className="bg-[#131313] border border-gray-800 rounded-2xl p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2 opacity-80" />
            <span className="text-3xl font-extrabold text-white font-mono">{completedCount}</span>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Aulas Concluídas</p>
          </div>

          <div className="bg-[#131313] border border-gray-800 rounded-2xl p-6 text-center">
            <User className="w-8 h-8 text-blue-400 mx-auto mb-2 opacity-80" />
            <span className="text-3xl font-extrabold text-white font-mono">100%</span>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Segurança SSL</p>
          </div>
        </div>

        {/* Cartão de Credenciais de Acesso */}
        <div className="bg-[#131313] border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 pb-6 border-b border-gray-800 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#e9c349]/15 text-[#e9c349] flex items-center justify-center font-bold">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Credenciais & Dados do Estudante</h3>
              <p className="text-xs text-gray-400">Informações de identificação, nome, contato e ID numérico</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black/50 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-500 uppercase font-mono block mb-1">Nome Completo do Aluno</span>
              <p className="text-white text-sm font-bold flex items-center gap-2">
                <User className="w-4 h-4 text-[#e9c349]" />
                {fullName}
              </p>
            </div>

            <div className="bg-black/50 p-4 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-500 uppercase font-mono">Número de Telefone / Contato</span>
                {!isEditingPhone ? (
                  <button
                    onClick={() => setIsEditingPhone(true)}
                    className="text-xs text-[#e9c349] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingPhone(false)}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancelar</span>
                    </button>
                  </div>
                )}
              </div>

              {isEditingPhone ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 text-[#e9c349] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+244 900 000 000"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#e9c349]"
                    />
                  </div>
                  <button
                    onClick={handleSavePhone}
                    disabled={savingPhone}
                    className="bg-[#e9c349] hover:bg-[#d4b03f] text-black px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingPhone ? 'Salvando...' : 'Salvar'}</span>
                  </button>
                </div>
              ) : (
                <p className="text-white text-sm font-bold flex items-center gap-2 font-mono mt-1">
                  <Phone className="w-4 h-4 text-[#e9c349]" />
                  {profile?.phoneNumber ? profile.phoneNumber : 'Não informado'}
                </p>
              )}

              {phoneSuccess && (
                <p className="text-[11px] text-green-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {phoneSuccess}
                </p>
              )}
              {phoneError && (
                <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {phoneError}
                </p>
              )}
            </div>

            <div className="bg-black/50 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-500 uppercase font-mono block mb-1">ID Numérico de Matrícula</span>
              <p className="font-mono text-[#e9c349] text-base font-extrabold flex items-center gap-2">
                <Hash className="w-4 h-4" />
                #{numericId}
              </p>
            </div>

            <div className="bg-black/50 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-500 uppercase font-mono block mb-1">E-mail de Acesso (Login)</span>
              <p className="font-mono text-white text-sm font-bold flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#e9c349]" />
                {profile?.email || auth.currentUser?.email || 'N/A'}
              </p>
            </div>

            <div className="bg-black/50 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-500 uppercase font-mono block mb-1">Status da Matrícula / Acesso</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30 gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Acesso Ativo (Liberado)
                </span>
              </div>
            </div>

            <div className="bg-black/50 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-500 uppercase font-mono block mb-1">Tipo de Conta</span>
              <p className="text-white text-sm font-bold capitalize mt-1 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#e9c349]" />
                {profile?.role === 'admin' ? 'Administrador Master' : profile?.role === 'producer' || profile?.roleType === 'producer' ? 'Produtor de Cursos' : 'Estudante Verificado'}
              </p>
            </div>
          </div>

          {/* Modal de Registo / Ativação de Conta de Produtor */}
          {isProducerModalOpen && (
            <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#141414] border border-stone-800 rounded-3xl w-full max-w-xl p-6 sm:p-8 space-y-6 relative shadow-2xl animate-in fade-in zoom-in-95">
                <button
                  onClick={() => setIsProducerModalOpen(false)}
                  className="absolute top-6 right-6 p-2 rounded-xl bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#e9c349]/15 text-[#e9c349] rounded-2xl">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 bg-[#e9c349]/20 text-[#e9c349] font-extrabold text-[10px] uppercase rounded-full tracking-wider">
                      Registo Oficial de Produtor
                    </span>
                    <h3 className="text-xl font-extrabold text-white font-headline mt-1">Deseja criar e vender cursos na plataforma CFA?</h3>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Você está a iniciar o processo de <strong>registo como Produtor de Cursos</strong> na CFA. Ao ativar sua conta, você terá acesso à área administrativa completa, ferramenta de cadastro de vídeo-aulas, gestão de alunos e recebimentos diretos.
                  </p>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <p className="text-xs text-emerald-400 font-bold flex items-center gap-2">
                      <span>🎁 Cadastro Inicial 100% Gratuito!</span>
                    </p>
                    <p className="text-[11px] text-stone-300 mt-0.5">O pagamento da taxa ocorre somente no fim do período de utilização escolhido abaixo.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-stone-300 uppercase tracking-wider block">Escolha o seu Plano de Produtor:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      onClick={() => setSelectedPlan('monthly')}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedPlan === 'monthly' ? 'bg-[#e9c349]/15 border-[#e9c349]' : 'bg-black/50 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-white block">Plano Mensal</span>
                        <span className="text-xs text-stone-400 font-mono">3.500 Kz / mês</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlan === 'monthly' ? 'border-[#e9c349] bg-[#e9c349]' : 'border-stone-600'}`}>
                        {selectedPlan === 'monthly' && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                      </div>
                    </div>

                    <div
                      onClick={() => setSelectedPlan('quarterly')}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedPlan === 'quarterly' ? 'bg-[#e9c349]/15 border-[#e9c349]' : 'bg-black/50 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-[#e9c349] flex items-center gap-1">
                          Plano Trimestral
                          <span className="text-[9px] bg-[#e9c349] text-black px-1.5 py-0.2 font-bold rounded">Recomendado</span>
                        </span>
                        <span className="text-xs text-stone-400 font-mono">7.000 Kz / 3 meses</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlan === 'quarterly' ? 'border-[#e9c349] bg-[#e9c349]' : 'border-stone-600'}`}>
                        {selectedPlan === 'quarterly' && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setIsProducerModalOpen(false)}
                    className="px-5 py-3 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setIsProducerModalOpen(false);
                      handleActivateProducerRole();
                    }}
                    disabled={isActivatingProducer}
                    className="px-6 py-3 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                  >
                    <Shield className="w-4 h-4" />
                    <span>{isActivatingProducer ? 'Ativando...' : 'Confirmar e Ativar Conta de Produtor'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Botão de Recuperação / Redefinição de Senha */}
          <div className="mt-8 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#e9c349]" />
                Segurança & Senha da Conta
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">Precisa atualizar sua senha? Enviaremos um link de redefinição para seu e-mail.</p>
            </div>

            <div className="w-full sm:w-auto">
              {resetSent ? (
                <div className="bg-green-500/15 border border-green-500/30 text-green-400 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  E-mail de recuperação enviado com sucesso!
                </div>
              ) : (
                <button
                  onClick={handlePasswordReset}
                  disabled={sendingReset}
                  className="w-full sm:w-auto bg-[#e9c349] hover:bg-[#d4b03f] text-black px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {sendingReset ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Recuperar / Alterar Senha</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {resetError && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{resetError}</span>
            </div>
          )}
        </div>

        {/* Suporte e Ajuda (Lado a lado: Texto à esquerda e botão à direita) */}
        {(() => {
          const cleanPhone = (supportWhatsApp || '244923456789').replace(/[^0-9]/g, '');
          const studentEmail = profile?.email || auth.currentUser?.email || '';
          const textMessage = `Olá, equipe de Suporte CFA! Preciso de ajuda com a minha conta de aluno.\n\n*Nome:* ${fullName}\n*E-mail:* ${studentEmail}\n*ID de Matrícula:* #${numericId}`;
          const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(textMessage)}`;

          return (
            <div className="bg-[#131313] border border-gray-800 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
              <div className="flex items-center gap-4 text-center md:text-left">
                <div className="w-12 h-12 rounded-xl bg-green-500/15 text-green-400 flex items-center justify-center font-bold shrink-0 mx-auto md:mx-0">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Precisa de Ajuda ou Suporte Técnico?</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Entre em contato direto com a nossa equipe acadêmica no WhatsApp para assistência imediata.</p>
                </div>
              </div>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25D366] text-black font-extrabold px-6 py-4 rounded-xl text-xs hover:bg-[#20ba5a] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-green-500/10 shrink-0 w-full md:w-auto"
              >
                <MessageCircle className="w-4 h-4 fill-black" />
                <span>Falar com Suporte WhatsApp</span>
              </a>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
