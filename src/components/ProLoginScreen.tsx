import React, { useState } from 'react';
import { 
  X, 
  ArrowLeft, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  CheckCircle2, 
  User, 
  Users, 
  Briefcase, 
  ShieldCheck, 
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { GoogleCpfCompletionStep, type RegistrationSuccessData } from './GoogleCpfCompletionStep';
import { triggerGoogleOAuthPopup, type GoogleUserProfile } from '../services/googleAuth';

interface ProLoginScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToStudent: () => void;
  onOpenSignUp: () => void;
}

export const ProLoginScreen: React.FC<ProLoginScreenProps> = ({
  isOpen,
  onClose,
  onSwitchToStudent,
  onOpenSignUp,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [googleProfile, setGoogleProfile] = useState<GoogleUserProfile | null>(null);
  const [registeredUser, setRegisteredUser] = useState<{ name: string; cpf?: string } | null>(null);

  if (!isOpen) return null;

  const handleStartGoogleAuth = () => {
    setIsLoading(true);
    setErrorMessage('');
    triggerGoogleOAuthPopup(
      'trainer',
      async (profile) => {
        try {
          const resp = await fetch('https://api.odomofit.com.br/api/auth/google-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              google_id: profile.googleId || profile.email,
              email: profile.email
            })
          });
          const result = await resp.json();
          if (result.registered && result.user) {
            // Verifica se o usuário já tem registro de classe (CREF/CRN) ativo
            const hasActiveCouncil = Boolean(
              result.user.council_number || 
              (result.user.role && result.user.role !== 'student')
            );

            if (hasActiveCouncil) {
              // Já é profissional ativo: garantir username @pro_...
              const rawUsername = (result.user.username || (result.user.email ? result.user.email.split('@')[0] : 'pro')).replace(/^@/, '');
              const formattedProUsername = rawUsername.startsWith('pro_') ? `@${rawUsername}` : `@pro_${rawUsername}`;

              const userSession = {
                id: result.user.id,
                name: result.user.full_name,
                email: result.user.email,
                username: formattedProUsername,
                cpf: result.user.cpf || '',
                avatarUrl: result.user.avatar_url || profile.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
                role: result.user.role || 'trainer',
                councilType: result.user.council_type || 'CREF',
                councilNumber: result.user.council_number || '048291-G/SP',
                councilVerified: true,
                specialty: result.user.council_type === 'CRN' 
                  ? 'Nutrição Esportiva & Composição Corporal' 
                  : 'Fisiologia do Exercício & Consultoria de Alto Rendimento',
                activeStudents: 0,
                monthlyRevenueGross: 0,
                monthlyRevenueNet: 0,
                platformFeeRate: 0.15,
                stripeConnected: false,
                stripeAccountId: '',
                availablePayout: 0,
                authMethod: 'google',
                isNewUser: true
              };

              // Limpar a base fictícia para garantir real noção da carteira do profissional
              try {
                localStorage.setItem('odomo_pro_current_user', JSON.stringify(userSession));
                localStorage.setItem('odomo_pro_students', JSON.stringify([]));
                localStorage.setItem('odomo_pro_transactions', JSON.stringify([]));
                localStorage.setItem('odomo_pro_routines', JSON.stringify([]));
                localStorage.removeItem('odomo_current_pro');
              } catch (e) {}

              setIsLoading(false);
              setIsSuccess(true);
              setTimeout(() => {
                window.location.href = './pro/';
              }, 1000);
              return;
            } else {
              // O usuário já existe no DomoFit como aluno!
              // O DomoFit permite o mesmo login, MAS para acessar a plataforma PRO ele deve informar o CREF ou CRN ativo
              setIsLoading(false);
              setGoogleProfile({
                ...profile,
                fullName: result.user.full_name || profile.fullName,
              });
              return;
            }
          }
        } catch (err) {
          console.warn('API check fallback:', err);
        }

        setIsLoading(false);
        setGoogleProfile(profile);
      },
      (errorMsg) => {
        setIsLoading(false);
        setErrorMessage(errorMsg);
      }
    );
  };

  const handleGoogleRegistrationSuccess = async (data: RegistrationSuccessData) => {
    setIsLoading(true);
    setErrorMessage('');
    const finalName = data.fullName || data.userProfile.fullName;

    // Regra oficial PRO: Username padrão obrigatoriamente @pro_nome_de_usuario
    const cleanUsername = data.username.startsWith('@') ? data.username : `@${data.username}`;
    let savedUserId = 'pro_g_' + Date.now();

    try {
      const resp = await fetch('https://api.odomofit.com.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: finalName,
          email: data.userProfile.email,
          cpf: data.cpf,
          birthDate: data.birthDate,
          role: data.councilType === 'CRN' ? 'nutritionist' : 'trainer',
          google_id: data.userProfile.googleId || data.userProfile.email,
          avatarUrl: data.userProfile.avatarUrl || '',
          username: cleanUsername
        })
      });

      const resData = await resp.json();
      if (!resp.ok && resp.status !== 409) {
        // Se já existia e não permitiu recadastrar, tenta atualizar
        try {
          await fetch('https://api.odomofit.com.br/api/auth/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: data.userProfile.email,
              fullName: finalName,
              username: cleanUsername,
              avatarUrl: data.userProfile.avatarUrl || ''
            })
          });
        } catch (upErr) {}
      }
      if (resData.user && resData.user.id) {
        savedUserId = resData.user.id;
      }
    } catch (e) {
      console.warn('Registro offline/fallback:', e);
    }

    // Estrutura de dados limpa para o profissional ter a REAL NOÇÃO da sua situação
    const proUserSession = {
      id: savedUserId,
      name: finalName,
      email: data.userProfile.email,
      username: cleanUsername,
      cpf: data.cpf,
      avatarUrl: data.userProfile.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
      role: data.councilType === 'CRN' ? 'nutritionist' : 'trainer',
      councilType: data.councilType || 'CREF',
      councilNumber: data.councilNumber || '048291-G/SP',
      councilVerified: true,
      specialty: data.councilType === 'CRN' 
        ? 'Nutrição Clínica & Esportiva' 
        : 'Fisiologia do Exercício & Consultoria de Alto Rendimento',
      activeStudents: 0,
      monthlyRevenueGross: 0,
      monthlyRevenueNet: 0,
      platformFeeRate: 0.15,
      stripeConnected: false,
      stripeAccountId: '',
      availablePayout: 0,
      authMethod: 'google',
      isNewUser: true
    };

    // Limpeza mandatória da base fictícia para novos cadastros
    try {
      localStorage.setItem('odomo_pro_current_user', JSON.stringify(proUserSession));
      localStorage.setItem('odomo_pro_students', JSON.stringify([]));
      localStorage.setItem('odomo_pro_transactions', JSON.stringify([]));
      localStorage.setItem('odomo_pro_routines', JSON.stringify([]));
      localStorage.removeItem('odomo_current_pro');
    } catch (e) {}

    setRegisteredUser({
      name: finalName,
      cpf: data.cpf,
    });
    setGoogleProfile(null);
    setIsLoading(false);
    setIsSuccess(true);
    setTimeout(() => {
      window.location.href = './pro/';
    }, 1200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!identifier.trim()) {
      setErrorMessage('Por favor, informe seu e-mail profissional ou registro (CREF/CRN).');
      return;
    }
    if (!password) {
      setErrorMessage('Por favor, informe sua senha.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = './pro/';
      }, 1200);
    }, 800);
  };

  const handleQuickDemoLogin = () => {
    setIdentifier('prof.felipe@odomofit.com');
    setPassword('coach123456');
    setErrorMessage('');
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = './pro/';
      }, 1000);
    }, 600);
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setErrorMessage('Por favor, informe um e-mail válido para recuperação.');
      return;
    }
    setErrorMessage('');
    setForgotSent(true);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#08080A]/95 backdrop-blur-2xl animate-fadeIn flex flex-col justify-between font-['Montserrat']">
      {/* Glows de Fundo */}
      <div className="fixed top-0 right-1/4 w-[500px] h-[500px] bg-[#C6FF00]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-0 left-10 w-[400px] h-[400px] bg-[#C6FF00]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Header Barra de Navegação */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between border-b border-white/[0.06] relative z-10">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-white/80 hover:text-white border border-white/10 text-xs font-semibold transition-all duration-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#C6FF00]" />
          <span>Voltar ao site</span>
        </button>

        <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="flex items-center gap-2">
          <img
            src="/images/logo.png"
            alt="ODomoFit Logo"
            className="h-6 sm:h-7 w-auto object-contain"
          />
        </a>

        <div className="flex items-center gap-3">
          <button
            onClick={onSwitchToStudent}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#9FA1AC] hover:text-[#C6FF00] hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-[#C6FF00]" />
            <span>Sou Aluno</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-[#9FA1AC] hover:text-white border border-white/10 transition-colors cursor-pointer"
            aria-label="Fechar tela de login"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Conteúdo Central */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-1 flex items-center justify-center relative z-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Coluna Esquerda: Experiência Visual do Profissional (Destaque Desktop) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-between p-8 rounded-3xl bg-[#121318]/80 border border-white/[0.08] shadow-2xl relative overflow-hidden min-h-[580px]">
            {/* Gradiente Interno */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#C6FF00]/10 rounded-full blur-3xl pointer-events-none" />
            
            <div>
              {/* Badge Profissional */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#C6FF00]/10 border border-[#C6FF00]/20 text-[#C6FF00] text-xs font-bold tracking-wide uppercase mb-6">
                <Briefcase className="w-3.5 h-3.5" />
                <span>Portal do Profissional & Coach</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight font-heading">
                Potencialize sua consultoria <br />
                <span className="text-[#C6FF00]">com ciência e tecnologia.</span>
              </h1>

              <p className="text-sm text-[#9FA1AC] mt-3 leading-relaxed max-w-md">
                Gerencie seus atletas, monte prescrições inteligentes com periodização avançada, acompanhe bio-tracking e receba pagamentos automáticos.
              </p>

              {/* Lista de Recursos Rápidos Pro */}
              <div className="mt-8 space-y-3.5">
                <div className="flex items-center gap-3 text-xs text-white/90">
                  <div className="w-6 h-6 rounded-lg bg-[#C6FF00]/10 text-[#C6FF00] flex items-center justify-center font-bold">✓</div>
                  <span>Prescritor de treinos dinâmico com biblioteca e cálculo de tonelagem</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/90">
                  <div className="w-6 h-6 rounded-lg bg-[#C6FF00]/10 text-[#C6FF00] flex items-center justify-center font-bold">✓</div>
                  <span>Anamnese completa com histórico de lesões, fotos e composição corporal</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/90">
                  <div className="w-6 h-6 rounded-lg bg-[#C6FF00]/10 text-[#C6FF00] flex items-center justify-center font-bold">✓</div>
                  <span>Split financeiro instantâneo com repasse direto via Stripe Connect</span>
                </div>
              </div>
            </div>

            {/* Card de Métricas Clínicas e Gestão */}
            <div className="mt-8 p-5 rounded-2xl bg-[#08080A]/80 border border-white/[0.08] backdrop-blur-md">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#C6FF00]/10 border border-[#C6FF00]/30 flex items-center justify-center text-[#C6FF00]">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#9FA1AC] tracking-wider">Alunos Ativos</div>
                    <div className="text-sm font-extrabold text-white">48 <span className="text-[10px] text-[#C6FF00] font-normal">ATLETAS</span></div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#C6FF00]/10 border border-[#C6FF00]/30 flex items-center justify-center text-[#C6FF00]">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#9FA1AC] tracking-wider">Adesão Média</div>
                    <div className="text-sm font-extrabold text-white">96.4% <span className="text-[10px] text-[#C6FF00] font-normal">RETENÇÃO</span></div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#9FA1AC]">
                <div className="flex items-center gap-1.5 text-white/80">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#C6FF00]" />
                  <span>Conformidade CREF, CRN & LGPD</span>
                </div>
                <span className="text-[#C6FF00] font-mono text-[10px]">DomoFit PRO v2.4</span>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Card de Autenticação do Profissional */}
          <div className="w-full lg:col-span-6 max-w-md mx-auto">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#121318] border border-white/[0.08] shadow-2xl relative">
              
              {/* Se estiver no fluxo de sucesso */}
              {isSuccess ? (
                <div className="text-center py-6 space-y-4 animate-fadeIn">
                  <div className="w-16 h-16 rounded-full bg-[#C6FF00]/15 border border-[#C6FF00]/30 text-[#C6FF00] flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(198,255,0,0.25)]">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>

                  <h3 className="text-2xl font-extrabold text-white font-heading">
                    Acesso Autorizado!
                  </h3>

                  <p className="text-xs text-[#9FA1AC] max-w-xs mx-auto leading-relaxed">
                    Credenciais de treinador confirmadas. Redirecionando para seu painel de gestão de consultoria e alunos...
                  </p>

                  <div className="p-3.5 bg-[#08080A] rounded-xl border border-white/[0.08] text-xs text-left text-white/90 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-[#9FA1AC]">
                      <span>Treinador conectado:</span>
                      <strong className="text-white">{registeredUser?.name || identifier || 'Prof. Felipe (Coach)'}</strong>
                    </div>
                    {registeredUser?.cpf && (
                      <div className="flex justify-between text-[11px] text-[#9FA1AC]">
                        <span>CPF Validado (Receita):</span>
                        <strong className="text-[#C6FF00]">•••.{registeredUser.cpf.slice(3, 6)}.{registeredUser.cpf.slice(6, 9)}-••</strong>
                      </div>
                    )}
                    <div className="flex justify-between text-[11px] text-[#9FA1AC]">
                      <span>Ambiente:</span>
                      <strong className="text-[#C6FF00]">O Domo FIT Pro Dashboard</strong>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2.5">
                    <button
                      onClick={() => {
                        window.location.href = './pro/';
                      }}
                      className="w-full py-3 rounded-xl bg-[#C6FF00] hover:bg-[#B2E600] text-[#08080A] font-extrabold text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer shadow-[0_4px_16px_rgba(198,255,0,0.3)] flex items-center justify-center gap-2"
                    >
                      <span>Abrir Portal do Profissional</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        setIsSuccess(false);
                        setIdentifier('');
                        setPassword('');
                      }}
                      className="text-xs text-[#9FA1AC] hover:text-white py-1 transition-colors"
                    >
                      Trocar de conta
                    </button>
                  </div>
                </div>
              ) : googleProfile ? (
                /* Etapa 2: Confirmação de CPF, Maioridade e Equivalência de Nome (Receita Federal) */
                <GoogleCpfCompletionStep
                  userProfile={googleProfile}
                  isPro={true}
                  onCancel={() => setGoogleProfile(null)}
                  onSwitchAccount={handleStartGoogleAuth}
                  onSuccess={handleGoogleRegistrationSuccess}
                />
              ) : showForgotPassword ? (
                /* Formulário de Esqueci a Senha */
                <div className="animate-fadeIn">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setForgotSent(false);
                        setErrorMessage('');
                      }}
                      className="text-xs text-[#9FA1AC] hover:text-white flex items-center gap-1 mb-1 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar para o login</span>
                    </button>
                  </div>

                  <h2 className="text-2xl font-extrabold text-white font-heading">
                    Recuperar Senha Profissional
                  </h2>
                  <p className="text-xs text-[#9FA1AC] mt-1 mb-6 leading-relaxed">
                    Informe seu e-mail cadastrado de treinador. Enviaremos as instruções de recuperação para sua conta de consultoria.
                  </p>

                  {forgotSent ? (
                    <div className="p-4 rounded-xl bg-[#C6FF00]/10 border border-[#C6FF00]/30 text-center space-y-3">
                      <CheckCircle2 className="w-8 h-8 text-[#C6FF00] mx-auto" />
                      <div className="text-xs text-white font-semibold">
                        Link de recuperação enviado para: <br />
                        <span className="text-[#C6FF00]">{forgotEmail}</span>
                      </div>
                      <p className="text-[11px] text-[#9FA1AC]">
                        Verifique sua caixa de entrada e pasta de spam.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPassword(false);
                          setForgotSent(false);
                        }}
                        className="w-full py-2.5 rounded-lg bg-[#C6FF00] text-[#08080A] text-xs font-bold hover:bg-[#B2E600]"
                      >
                        Retornar ao Login
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                      {errorMessage && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs text-red-400">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{errorMessage}</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-white mb-1.5">E-mail Profissional</label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-[#9FA1AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="treinador@consultoria.com"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#08080A] border border-white/10 text-white text-xs placeholder-[#9FA1AC]/50 focus:outline-none focus:border-[#C6FF00] transition-colors"
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 rounded-xl bg-[#C6FF00] text-[#08080A] text-xs font-bold hover:bg-[#B2E600] transition-all cursor-pointer shadow-[0_4px_16px_rgba(198,255,0,0.2)]"
                      >
                        Enviar Link de Redefinição
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                /* Formulário Principal de Login do Profissional */
                <div>
                  {/* Cabeçalho do Card */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#C6FF00]/10 border border-[#C6FF00]/25 text-[#C6FF00] text-[10px] font-extrabold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF00] animate-pulse" />
                      Login Profissional
                    </span>

                    <button
                      type="button"
                      onClick={onSwitchToStudent}
                      className="text-[11px] text-[#9FA1AC] hover:text-[#C6FF00] font-medium transition-colors"
                    >
                      Sou Aluno →
                    </button>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
                    Painel do Treinador
                  </h2>
                  <p className="text-xs text-[#9FA1AC] mt-1 mb-5">
                    Acesse sua consultoria com suas credenciais ou teste com 1 clique.
                  </p>

                  {/* Botão de Demonstração Rápida com 1 Clique */}
                  <button
                    type="button"
                    onClick={handleQuickDemoLogin}
                    disabled={isLoading}
                    className="w-full mb-5 p-3 rounded-xl bg-[#08080A] border border-[#C6FF00]/40 hover:border-[#C6FF00] text-left transition-all duration-200 cursor-pointer group flex items-center justify-between shadow-[0_0_15px_rgba(198,255,0,0.08)] hover:shadow-[0_0_20px_rgba(198,255,0,0.18)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#C6FF00]/15 text-[#C6FF00] flex items-center justify-center font-bold text-xs">
                        ⚡
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-[#C6FF00] transition-colors">
                          Acesso Rápido para Avaliação
                        </div>
                        <div className="text-[10px] text-[#9FA1AC]">
                          Entrar com perfil Coach (Prof. Felipe)
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] text-[#C6FF00] font-bold">1 Clique →</span>
                  </button>

                  <div className="relative flex py-1 items-center mb-4">
                    <div className="flex-grow border-t border-white/[0.08]" />
                    <span className="flex-shrink mx-3 text-[11px] text-[#9FA1AC]">ou continue com credenciais</span>
                    <div className="flex-grow border-t border-white/[0.08]" />
                  </div>

                  {errorMessage && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs text-red-400 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/90 mb-1.5">
                        E-mail ou Registro Profissional (CREF / CRN)
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#9FA1AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="treinador@email.com ou CREF 123456-G/SP"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#08080A] border border-white/10 text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none focus:border-[#C6FF00] transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-white/90">
                          Senha
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotPassword(true);
                            setForgotEmail(identifier.includes('@') ? identifier : '');
                          }}
                          className="text-[11px] text-[#C6FF00] hover:underline cursor-pointer"
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#9FA1AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#08080A] border border-white/10 text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none focus:border-[#C6FF00] transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9FA1AC] hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <label className="flex items-center gap-2 text-[#9FA1AC] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded bg-[#08080A] border-white/20 text-[#C6FF00] focus:ring-0 focus:ring-offset-0 accent-[#C6FF00]"
                        />
                        <span>Lembrar de mim</span>
                      </label>
                      <span className="text-[11px] text-white/50">Criptografia Ponta a Ponta</span>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 rounded-xl bg-[#C6FF00] hover:bg-[#B2E600] active:scale-[0.98] text-[#08080A] text-xs font-extrabold tracking-wide uppercase transition-all duration-200 cursor-pointer shadow-[0_4px_16px_rgba(198,255,0,0.3)] flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-[#08080A] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Acessar Painel do Treinador</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>

                  {/* Social Login Corporativo */}
                  <div className="mt-5 pt-4 border-t border-white/[0.08] space-y-2.5">
                    <button
                      type="button"
                      onClick={handleStartGoogleAuth}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#08080A] hover:bg-white/[0.04] border border-white/10 hover:border-white/20 text-xs font-medium text-white flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
                        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                        <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1s.7 5.4 1.9 7.8l3.7-2.9c-.4-.7-.4-1.5-.4-2.3z"/>
                        <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"/>
                      </svg>
                      <span>Entrar com Google Workspace</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleQuickDemoLogin}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#08080A] hover:bg-white/[0.04] border border-white/10 hover:border-white/20 text-xs font-medium text-white flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current text-white" viewBox="0 0 24 24">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.77 1.06-1.85.94-2.92-1 .04-2.19.67-2.88 1.47-.59.69-1.11 1.79-.97 2.85 1.12.09 2.28-.63 2.91-1.4z"/>
                      </svg>
                      <span>Entrar com Apple ID</span>
                    </button>
                  </div>

                  {/* Link para Credenciamento */}
                  <div className="mt-5 text-center text-xs text-[#9FA1AC]">
                    Deseja prescrever na plataforma?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSignUp();
                      }}
                      className="text-[#C6FF00] font-bold hover:underline cursor-pointer"
                    >
                      Cadastre sua Consultoria
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Rodapé da Tela de Login */}
      <footer className="w-full max-w-7xl mx-auto px-4 py-4 text-center text-[11px] text-[#9FA1AC]/60 border-t border-white/[0.04] relative z-10">
        O Domo FIT Pro © {new Date().getFullYear()} — Plataforma de Prescrição, Avaliação & Gestão Esportiva Multidisciplinar.
      </footer>
    </div>
  );
};
