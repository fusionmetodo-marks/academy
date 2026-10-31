import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginWithGoogle, loginWithEmail, registerWithEmail, sendResetEmail, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { DEFAULT_CFA_LOGO, getValidLogoUrl, isMasterEmail } from '../utils/constants';
import { ProducerContractModal } from '../components/ProducerContractModal';
import { sendSystemNotification } from '../services/notificationService';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(location.pathname === '/criar-conta');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Registration metadata states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+244'); // Default to Angola
  const [phoneNumber, setPhoneNumber] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password security verification
  const isPasswordMinLength = password.length >= 8;
  const hasLetterAndNumber = /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
  const isPasswordStrong = isPasswordMinLength && hasLetterAndNumber;

  // Status message states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_CFA_LOGO);
  
  // Contrato Digital do Produtor (apenas caso um produtor já cadastrado precise assinar)
  const [pendingContractUser, setPendingContractUser] = useState<any | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const generalDoc = await getDoc(doc(db, 'settings', 'general')).catch(() => null);
        if (generalDoc && generalDoc.exists() && generalDoc.data()?.logoUrl) {
          setLogoUrl(getValidLogoUrl(generalDoc.data().logoUrl));
        }
        const platformDoc = await getDoc(doc(db, 'settings', 'platform')).catch(() => null);
        if (platformDoc && platformDoc.exists() && platformDoc.data()?.logoUrl) {
          setLogoUrl(getValidLogoUrl(platformDoc.data().logoUrl));
        }
      } catch (err) {
        console.warn("Could not load logo in Login page:", err);
      }
    };
    fetchLogo();
  }, []);

  useEffect(() => {
    setIsRegistering(location.pathname === '/criar-conta');
  }, [location.pathname]);

  // Clear states when toggling views
  useEffect(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [isRegistering]);

  const handlePasswordResetClick = async () => {
    if (!email) {
      setErrorMessage("Por favor, digite seu E-mail no campo correspondente antes de solicitar a redefinição.");
      return;
    }
    
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await sendResetEmail(email);
      setSuccessMessage(`Um link de redefinição de chave / senha foi enviado para ${email}. Verifique a sua caixa de entrada ou pasta de spam.`);
    } catch (err: any) {
      console.error("Failed to reset password", err);
      setErrorMessage("Ocorreu um erro ao enviar o e-mail de redefinição: " + (err?.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserRouting = async (user: any, registrationData?: { firstName: string; phoneCountryCode: string; phoneNumber: string }) => {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    const cleanEmail = (user.email || '').trim().toLowerCase();
    const isAdminEmail = isMasterEmail(cleanEmail);

    let role = isAdminEmail ? 'admin' : 'student';
    let status = isAdminEmail ? 'active' : 'inactive';
    let isApproved = true;

    if (!userSnap.exists()) {
      if (isAdminEmail) {
        role = 'admin';
        status = 'active';
        isApproved = true;
      } else {
        // Padrão obrigatório: Todas as novas contas são criadas como Aluno
        role = 'student';
        status = 'inactive'; // Aluno cadastrado
        isApproved = true;
      }
      
      const payload: any = {
        uid: user.uid,
        email: cleanEmail,
        role: role,
        roleType: role,
        subscriptionStatus: status,
        isApproved: isApproved,
        contractAccepted: false,
        enrolledCourses: [],
        plan: role === 'admin' ? 'Administrador' : 'Estudante Cadastrado (Sem Curso)',
        createdAt: serverTimestamp()
      };

      if (registrationData) {
        payload.fullName = registrationData.firstName;
        payload.phoneCountryCode = registrationData.phoneCountryCode;
        payload.phoneNumber = registrationData.phoneNumber;
      }

      await setDoc(userRef, payload);

      // Dispara notificação de novo estudante cadastrado
      if (role === 'student') {
        sendSystemNotification({
          type: 'new_student',
          title: '🎓 Novo Estudante Cadastrado!',
          message: `${registrationData?.firstName ? `${registrationData.firstName}` : cleanEmail} acabou de se cadastrar como Estudante na Money Building - Academia de Opções Binárias.`,
          link: '/students',
          targetRole: 'admin',
          metadata: {
            email: cleanEmail,
            name: `${registrationData?.firstName || ''}`.trim(),
            phone: `${registrationData?.phoneCountryCode || ''} ${registrationData?.phoneNumber || ''}`.trim(),
            uid: user.uid
          }
        });
      }
    } else {
      const data = userSnap.data();
      role = isAdminEmail ? 'admin' : (data.role || 'student');
      status = isAdminEmail ? 'active' : (data.subscriptionStatus || 'active');
      isApproved = true;

      if (isAdminEmail && (data.role !== 'admin' || data.subscriptionStatus !== 'active')) {
        await setDoc(userRef, { role: 'admin', subscriptionStatus: 'active', roleType: 'admin', isApproved: true }, { merge: true });
      }

      if (registrationData) {
        await setDoc(userRef, {
          fullName: registrationData.firstName,
          phoneCountryCode: registrationData.phoneCountryCode,
          phoneNumber: registrationData.phoneNumber
        }, { merge: true });
      }

      // Se for produtor e ainda não assinou o contrato digital, abre o contrato
      if (role === 'producer' && !isAdminEmail && !data.contractAccepted) {
        setPendingContractUser({
          uid: user.uid,
          email: cleanEmail,
          fullName: data.fullName || registrationData?.firstName || '',
          phoneNumber: data.phoneNumber || registrationData?.phoneNumber || '',
          phoneCountryCode: data.phoneCountryCode || registrationData?.phoneCountryCode || '+244',
          contractAccepted: false,
          contractBillingFrequency: data.contractBillingFrequency || 'monthly'
        });
        setIsContractModalOpen(true);
        return;
      }
    }
    
    const searchParams = new URLSearchParams(location.search);
    const redirectUrl = searchParams.get('redirect');

    // Roteamento
    if (isAdminEmail || ((role === 'admin' || role === 'producer') && isApproved)) {
      navigate('/dashboard');
    } else if (redirectUrl) {
      navigate(redirectUrl, { replace: true });
    } else {
      // Aluno acessa o catálogo da academia
      const postRegSlug = sessionStorage.getItem('post_register_slug');
      if (postRegSlug) {
        navigate(`/library/${postRegSlug}`);
      } else {
        navigate('/library');
      }
    }
  };

  const getFriendlyErrorMessage = (error: any, context: 'login' | 'register') => {
    const code = error?.code || '';
    const message = error?.message || '';
    
    // Check code or message for network failure
    if (code === 'auth/network-request-failed' || message.includes('network-request-failed')) {
      return 'Ocorreu uma falha de conexão (network-request-failed). Como esta aplicação está a ser executada dentro de um iframe de visualização (sandbox), o seu navegador pode estar a bloquear cookies de terceiros ou requisições de autenticação. Para resolver isto instantaneamente, clique no botão "Abrir em nova aba" (Open in new tab) no canto superior direito para aceder à plataforma diretamente sem restrições!';
    }

    switch (code) {
      case 'auth/email-already-in-use':
        return 'Este e-mail já está cadastrado. Por favor, tente fazer login ou use outro e-mail.';
      case 'auth/weak-password':
        return 'A senha é muito fraca. Ela deve conter pelo menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'O endereço de e-mail informado não é válido.';
      case 'auth/operation-not-allowed':
        return 'O login com e-mail e senha está desativado no console do Firebase. Ative a autenticação "Email/Senha" no seu console Firebase.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Credenciais incorretas ou inválidas. Caso não tenha uma conta, clique em "Não tem uma conta? Cadastre-se" abaixo e crie-a primeiro com a mesma senha desejada.';
      case 'auth/popup-closed-by-user':
        return 'A janela de autenticação foi fechada antes de concluir o login.';
      default:
        // Include raw message inside details for developer visibility
        return `${context === 'register' ? 'Falha ao criar conta' : 'Falha no login'}: ${message}`;
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    
    if (isRegistering) {
      if (!firstName.trim()) {
        setErrorMessage("Por favor, informe o seu Nome Completo.");
        return;
      }
      if (!phoneNumber.trim()) {
        setErrorMessage("Por favor, insira o seu número de telefone.");
        return;
      }
      if (!email.trim()) {
        setErrorMessage("Por favor, insira o seu E-mail.");
        return;
      }
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        setErrorMessage("Para segurança da sua conta contra invasões, a senha deve ter no mínimo 8 caracteres e conter letras e números.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage("A Chave de Acesso e a confirmação não coincidem. Certifique-se de digitar a mesma senha duas vezes.");
        return;
      }
    }

    setIsLoading(true);
    try {
      let user;
      if (isRegistering) {
        user = await registerWithEmail(email, password);
      } else {
        user = await loginWithEmail(email, password);
      }
      await handleUserRouting(
        user,
        isRegistering ? { firstName, phoneNumber, phoneCountryCode } : undefined
      );
    } catch (error: any) {
      console.error("Auth failed", error);
      setErrorMessage(getFriendlyErrorMessage(error, isRegistering ? 'register' : 'login'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const user = await loginWithGoogle();
      await handleUserRouting(user);
    } catch (error: any) {
      console.error("Login failed", error);
      setErrorMessage(getFriendlyErrorMessage(error, 'login'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen relative flex flex-col overflow-hidden">
      <div className="fixed inset-0 z-0">
        <img
          className="w-full h-full object-cover opacity-30 blur-sm"
          alt="Trading floor"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCOkxwvUgvLTY6Lm9DxFNpJFev2gyUaghB-KnWWM0CAXlOoXt-DpaosRTyEnAVvD6Jeuc8GJ6p5pn-w9yX3jYPk11vL_P1Z7lRiAOx9VgMRwvi13E40T5BMnTWA4spkL9TJvn94bx_36VDEmAoXy5LVWLRotAO9GyoyaMVpsdWLGSnbb-zYVz8MwKYzpTghH3wwCdX79DhiB9_NNy6pbVHgdCrWFNtTWUWyZ6iapmtJ_MEI1QaPFxMFk6fsrdIC-BKGTpOINpVQRQ"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-transparent"></div>
        <div className="absolute inset-0 grain-overlay"></div>
      </div>
      <header className="relative z-10 w-full px-8 py-8 flex justify-between items-center" id="login-header">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-all cursor-pointer group" id="cfa-brand-logo">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="h-12 md:h-16 w-auto object-contain rounded-xl shadow-md transition-all" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center font-black text-black text-base shadow-md">
                MM
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-black tracking-tighter text-primary font-headline leading-tight">Marks o Monstro</h1>
                <span className="text-[9px] uppercase tracking-widest text-on-surface-variant font-mono font-bold">ACADEMY</span>
              </div>
            </>
          )}
        </Link>
        <Link to="/" className="text-xs font-bold text-on-surface hover:text-primary transition-colors flex items-center gap-1.5 bg-surface-container-highest/80 px-4 py-2 rounded-lg border border-outline-variant/30 backdrop-blur-md">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Voltar ao Site
        </Link>
      </header>
      <main className="relative z-10 flex-grow flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-[480px] bg-surface-container-highest/60 backdrop-blur-2xl p-10 md:p-14 rounded-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] border border-outline-variant/10">
          <div className="mb-8 text-center">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary mb-2 block font-label">Acesso de Estudantes</span>
            <h2 className="text-3xl font-bold tracking-tight text-on-surface font-headline">{isRegistering ? 'Criar Conta de Estudante' : 'Login Seguro'}</h2>
            <p className="text-on-surface-variant text-sm mt-2 font-body">
              {isRegistering ? 'Cadastre-se como estudante para acessar suas aulas de trading e estratégias.' : 'Acesse suas aulas de Trading, Retração, Leitura de Velas e Método Fusion.'}
            </p>
          </div>

          {/* Inline notification banners */}
          {errorMessage && (
            <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm p-4 rounded-xl flex flex-col gap-3">
              <div className="flex gap-2.5 items-start">
                <span className="material-symbols-outlined text-rose-400 text-lg flex-shrink-0 mt-0.5">error</span>
                <div className="flex-grow">
                  <p className="leading-relaxed font-body">{errorMessage}</p>
                  {errorMessage.includes('já está cadastrado') && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/entrar');
                          setErrorMessage(null);
                        }}
                        className="bg-primary hover:brightness-110 active:scale-95 text-black font-black text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        Fazer Login
                      </button>
                      <button
                        type="button"
                        onClick={handlePasswordResetClick}
                        className="bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        Recuperar Senha
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm p-4 rounded-xl flex gap-2.5 items-start">
              <span className="material-symbols-outlined text-emerald-400 text-lg flex-shrink-0 mt-0.5">check_circle</span>
              <p className="leading-relaxed font-body">{successMessage}</p>
            </div>
          )}
          
          <form className="space-y-4" onSubmit={handleEmailSubmit}>

            {isRegistering && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-label" htmlFor="fullName">
                  NOME COMPLETO
                </label>
                <input
                  className="w-full bg-surface-container-lowest border-none rounded-xl py-3.5 px-4 text-on-surface placeholder:text-outline-variant/60 focus:ring-1 focus:ring-primary transition-all duration-300 outline-none font-body"
                  id="fullName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ex: João Silva"
                  type="text"
                  required
                />
              </div>
            )}

            {isRegistering && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-label" htmlFor="phoneNumber">
                  CONTATO DO PAI / RESPONSÁVEL (DDI E TELEFONE)
                </label>
                <div className="flex gap-2">
                  <div className="relative w-[35%] min-w-[100px]">
                    <select
                      className="w-full bg-surface-container-lowest border-none rounded-xl py-3.5 pl-3 pr-8 text-on-surface text-sm focus:ring-1 focus:ring-primary transition-all duration-300 outline-none font-body appearance-none cursor-pointer"
                      value={phoneCountryCode}
                      onChange={(e) => setPhoneCountryCode(e.target.value)}
                      aria-label="Código telefônico do país (DDI)"
                    >
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+244">🇦🇴 +244</option>
                      <option value="+351">🇵🇹 +351</option>
                      <option value="+258">🇲🇿 +258</option>
                      <option value="+238">🇨🇻 +238</option>
                      <option value="+245">🇬🇼 +245</option>
                      <option value="+239">🇸🇹 +239</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+34">🇪🇸 +34</option>
                      <option value="+44">🇬🇧 +44</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                    </div>
                  </div>
                  
                  <input
                    className="flex-grow w-[65%] bg-surface-container-lowest border-none rounded-xl py-3.5 px-4 text-on-surface placeholder:text-outline-variant/60 focus:ring-1 focus:ring-primary transition-all duration-300 outline-none font-body"
                    id="phoneNumber"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="99999-9999"
                    type="tel"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-label" htmlFor="email">
                E-MAIL INSTITUCIONAL
              </label>
              <div className="relative">
                <input
                  className="w-full bg-surface-container-lowest border-none rounded-xl py-3.5 px-4 text-on-surface placeholder:text-outline-variant/60 focus:ring-1 focus:ring-primary transition-all duration-300 outline-none font-body"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@cassamia.academy"
                  type="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-label" htmlFor="password">
                {isRegistering ? 'CRIAR UMA SENHA' : 'CHAVE DE ACESSO'}
              </label>
              <div className="relative flex items-center">
                <input
                  className="w-full bg-surface-container-lowest border-none rounded-xl py-3.5 pl-4 pr-12 text-on-surface placeholder:text-outline-variant/60 focus:ring-1 focus:ring-primary transition-all duration-300 outline-none font-body"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  type={showPassword ? 'text' : 'password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 text-on-surface-variant hover:text-primary transition-colors focus:outline-none p-1 flex items-center justify-center cursor-pointer"
                  aria-label={showPassword ? 'Ocultar chave' : 'Mostrar chave'}
                >
                  <span className="material-symbols-outlined text-xl select-none" style={{ fontVariationSettings: "'FILL' 0" }}>
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {isRegistering && (
                <div className="p-2.5 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/15 space-y-1.5 text-xs font-body mt-2">
                  <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Requisitos de Segurança:</div>
                  <div className={`flex items-center gap-1.5 transition-colors ${isPasswordMinLength ? 'text-emerald-400 font-semibold' : 'text-on-surface-variant/70'}`}>
                    <span className="material-symbols-outlined text-sm">{isPasswordMinLength ? 'check_circle' : 'radio_button_unchecked'}</span>
                    <span>Mínimo de 8 caracteres</span>
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors ${hasLetterAndNumber ? 'text-emerald-400 font-semibold' : 'text-on-surface-variant/70'}`}>
                    <span className="material-symbols-outlined text-sm">{hasLetterAndNumber ? 'check_circle' : 'radio_button_unchecked'}</span>
                    <span>Contém letras e números</span>
                  </div>
                </div>
              )}
              {!isRegistering && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={handlePasswordResetClick}
                    className="text-xs text-primary/80 hover:text-primary hover:underline transition-colors focus:outline-none cursor-pointer font-medium"
                  >
                    Esqueceu a chave de acesso?
                  </button>
                </div>
              )}
            </div>

            {isRegistering && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-label" htmlFor="confirmPassword">
                  CONFIRMAR SENHA / CHAVE
                </label>
                <div className="relative flex items-center">
                  <input
                    className="w-full bg-surface-container-lowest border-none rounded-xl py-3.5 pl-4 pr-12 text-on-surface placeholder:text-outline-variant/60 focus:ring-1 focus:ring-primary transition-all duration-300 outline-none font-body"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    type={showPassword ? 'text' : 'password'}
                    required
                  />
                  {password && confirmPassword && (
                    <span className="absolute right-11 flex items-center justify-center pointer-events-none">
                      {password === confirmPassword ? (
                        <span className="material-symbols-outlined text-emerald-500 text-lg" title="As senhas coincidem">check_circle</span>
                      ) : (
                        <span className="material-symbols-outlined text-rose-500 text-lg" title="As senhas de acesso não coincidem">warning</span>
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-on-surface-variant hover:text-primary transition-colors focus:outline-none p-1 flex items-center justify-center cursor-pointer"
                    aria-label={showPassword ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    <span className="material-symbols-outlined text-xl select-none" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 px-6 bg-[#e9c349] hover:bg-[#d4b03f] text-black font-extrabold rounded-xl shadow-[0_10px_30px_rgba(233,195,73,0.35)] active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 mt-4 font-headline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <span>{isRegistering ? 'Criar Minha Conta de Estudante' : 'Entrar na Minha Conta'}</span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <div className="relative flex items-center py-6">
            <div className="flex-grow border-t border-outline-variant/20"></div>
            <span className="flex-shrink-0 mx-4 text-on-surface-variant text-xs font-label uppercase tracking-widest">OU</span>
            <div className="flex-grow border-t border-outline-variant/20"></div>
          </div>
          
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-4 px-6 bg-white text-black font-bold rounded-xl shadow-lg hover:bg-gray-100 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 font-headline disabled:opacity-70"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Continuar com Google</span>
            </button>
          </div>
          
          <div className="mt-8 flex flex-col gap-4 text-center">
            <button 
              onClick={() => navigate(isRegistering ? '/entrar' : '/criar-conta')}
              className="text-sm text-primary font-medium hover:underline decoration-primary/30 underline-offset-4 transition-all font-body"
            >
              {isRegistering ? 'Já tem uma conta? Faça login' : 'Não tem uma conta? Cadastre-se'}
            </button>
            <div className="flex items-center justify-center gap-4 text-[11px] text-on-surface-variant uppercase tracking-widest mt-2 font-label">
              <a className="hover:text-on-surface transition-colors" href="#">TERMOS DE SERVIÇO</a>
              <span className="w-1 h-1 bg-outline-variant rounded-full"></span>
              <a className="hover:text-on-surface transition-colors" href="#">POLÍTICA DE PRIVACIDADE</a>
            </div>
            <div className="mt-6 pt-6 border-t border-outline-variant/20">
              <p className="text-xs text-on-surface-variant font-body">Plataforma Oficial <strong className="text-primary">Marks o Monstro - ACADEMY</strong></p>
            </div>
          </div>
        </div>
      </main>

      {/* Modal Interativo de Contrato Digital do Produtor */}
      {isContractModalOpen && pendingContractUser && (
        <ProducerContractModal
          isOpen={isContractModalOpen}
          producer={pendingContractUser}
          isReadOnly={false}
          onClose={() => {
            setIsContractModalOpen(false);
          }}
          onContractAccepted={(billingFrequency) => {
            setIsContractModalOpen(false);
            navigate('/dashboard');
          }}
          onContractRejected={async () => {
            setIsContractModalOpen(false);
            if (pendingContractUser?.uid) {
              try {
                // Se recusar, converte para estudante
                await setDoc(doc(db, 'users', pendingContractUser.uid), {
                  role: 'student',
                  roleType: 'student',
                  plan: 'Estudante Cadastrado (Sem Curso)'
                }, { merge: true });
              } catch (e) {
                console.error(e);
              }
            }
            alert('Você optou por recusar os termos de produtor. Sua conta foi mantida como Estudante.');
            navigate('/library');
          }}
        />
      )}
      <footer className="relative z-10 w-full px-8 py-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-label">CONEXÃO COM OS SERVIDORES</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(147,214,160,0.5)]"></span>
              <span className="text-xs font-medium text-secondary font-body">Plataforma Online</span>
            </div>
          </div>
          <div className="h-8 w-[1px] bg-outline-variant/20 hidden md:block"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-label">STATUS DO ACESSO</span>
            <span className="text-xs font-medium text-on-surface font-body">Serviço de Nuvem Ativo</span>
          </div>
        </div>
        <div className="flex gap-4">
          <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-xl">language</span>
          </button>
          <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-xl">help</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
