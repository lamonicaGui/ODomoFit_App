import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Calendar, 
  CreditCard, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  ArrowLeft,
  User,
  RefreshCw,
  Award,
  AtSign,
  FileBadge
} from 'lucide-react';
import { 
  formatCPF, 
  validateCPF, 
  cleanCPF, 
  calculateAge, 
  isAtLeast18, 
  validateNameEquivalence 
} from '../utils/cpfValidator';
import type { GoogleUserProfile } from '../services/googleAuth';

export type { GoogleUserProfile };

export interface RegistrationSuccessData {
  cpf: string;
  birthDate: string;
  fullName: string;
  username: string;
  councilType?: 'CREF' | 'CRN';
  councilNumber?: string;
  councilVerified?: boolean;
  userProfile: GoogleUserProfile;
}

interface GoogleCpfCompletionStepProps {
  userProfile: GoogleUserProfile;
  isPro?: boolean;
  onCancel: () => void;
  onSwitchAccount: () => void;
  onSuccess: (data: RegistrationSuccessData) => void;
}

export const GoogleCpfCompletionStep: React.FC<GoogleCpfCompletionStepProps> = ({
  userProfile,
  isPro = false,
  onCancel,
  onSwitchAccount,
  onSuccess,
}) => {
  const [fullName, setFullName] = useState(userProfile.fullName || '');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Configuração padrão de Username PRO: @pro_nome_de_usuario
  const defaultRawUsername = (
    userProfile.email ? userProfile.email.split('@')[0] : userProfile.fullName.toLowerCase().replace(/\s+/g, '_')
  ).toLowerCase().replace(/[^a-z0-9._]/g, '');

  const [proUsername, setProUsername] = useState(
    isPro ? `pro_${defaultRawUsername}` : defaultRawUsername
  );

  // Campos específicos para Profissional (CREF / CRN Obrigatório e Ativo)
  const [councilType, setCouncilType] = useState<'CREF' | 'CRN'>('CREF');
  const [councilNumber, setCouncilNumber] = useState('');
  const [councilActiveConfirmed, setCouncilActiveConfirmed] = useState(false);

  // 1. Validação de CPF
  const clean = cleanCPF(cpf);
  const isCpfFilled = clean.length === 11;
  const isCpfValid = isCpfFilled ? validateCPF(clean) : null;

  // 2. Validação de Idade (Mínimo 18 anos completos)
  const age = birthDate ? calculateAge(birthDate) : null;
  const isAdult = birthDate ? isAtLeast18(birthDate) : null;

  // 3. Validação de Equivalência de Nome (Nome no CPF vs Nome na Conta Google)
  const nameCheck = fullName.trim() 
    ? validateNameEquivalence(userProfile.fullName, fullName)
    : { isEquivalent: false, reason: 'Informe o nome do titular.' };

  // 4. Validação de Conselho Profissional Ativo (Obrigatório se for PRO)
  const isCouncilValid = !isPro || (
    councilNumber.trim().length >= 5 && councilActiveConfirmed
  );

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value);
    setCpf(formatted);
    setErrorMessage('');
  };

  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBirthDate(e.target.value);
    setErrorMessage('');
  };

  const handleFullNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFullName(e.target.value);
    setErrorMessage('');
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (isPro) {
      if (!val.startsWith('pro_')) {
        val = `pro_${val.replace(/^pro_?/, '')}`;
      }
    }
    setProUsername(val);
    setErrorMessage('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Trava 1: Validação do Nome equivalente
    if (!nameCheck.isEquivalent) {
      setErrorMessage(
        nameCheck.reason ||
          'O nome informado não é equivalente ao titular da conta conectada. Por segurança, o CPF deve pertencer à mesma pessoa.'
      );
      return;
    }

    // Trava 2: Validação algorítmica do CPF (Receita Federal)
    if (!isCpfFilled || !validateCPF(clean)) {
      setErrorMessage('Por favor, informe um CPF válido de acordo com o algoritmo oficial da Receita Federal.');
      return;
    }

    // Trava 3: Validação da Maioridade Legal (18 anos completos)
    if (!birthDate) {
      setErrorMessage('A data de nascimento é obrigatória para verificação de maioridade legal.');
      return;
    }

    if (!isAtLeast18(birthDate)) {
      setErrorMessage(
        `Cadastro não permitido: O usuário possui ${age} anos. Conforme os termos da plataforma e validação com a Receita Federal, é necessário ter ao menos 18 anos completos.`
      );
      return;
    }

    // Trava 4: Validação de Conselho Profissional Ativo (CREF ou CRN)
    if (isPro) {
      if (!councilNumber.trim() || councilNumber.trim().length < 5) {
        setErrorMessage(
          `O número de registro no conselho (${councilType}) é obrigatório e deve incluir a região (ex: 048291-G/SP ou 48192-CRN-3).`
        );
        return;
      }
      if (!councilActiveConfirmed) {
        setErrorMessage(
          `Acesso restrito: Para utilizar o DomoFit PRO, é indispensável confirmar a situação cadastral ativa e regular junto ao ${councilType}. Caso deseje utilizar o aplicativo apenas como aluno/atleta, acesse a plataforma de usuários.`
        );
        return;
      }
    }

    setIsLoading(true);

    (async () => {
      try {
        const checkResp = await fetch('https://api.odomofit.com.br/api/auth/check-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpf: clean, email: userProfile.email })
        });
        const checkData = await checkResp.json();
        
        // Se o CPF já existir em outra conta com email DIFERENTE, bloqueia duplicidade
        if (checkData.exists && checkData.user && checkData.user.email !== userProfile.email) {
          setIsLoading(false);
          setErrorMessage('Este CPF já está cadastrado em outra conta ativa no O Domo FIT com outro e-mail. Não é possível associá-lo a uma nova conta.');
          return;
        }
      } catch (err) {
        console.warn('API check-user fallback:', err);
      }

      setIsLoading(false);

      // Monta o username formatado com @
      const formattedUsername = isPro 
        ? `@${proUsername.startsWith('pro_') ? proUsername : 'pro_' + proUsername}`
        : `@${proUsername}`;

      onSuccess({
        cpf: clean,
        birthDate,
        fullName: fullName.trim(),
        username: formattedUsername,
        councilType: isPro ? councilType : undefined,
        councilNumber: isPro ? councilNumber.trim().toUpperCase() : undefined,
        councilVerified: isPro ? true : undefined,
        userProfile: {
          ...userProfile,
          fullName: fullName.trim(),
        },
      });
    })();
  };

  const isFormValid = isCpfValid && isAdult && nameCheck.isEquivalent && isCouncilValid;

  return (
    <div className="animate-fadeIn">
      {/* Botão Voltar */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[#9FA1AC] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar para o login</span>
        </button>

        <span className="text-[11px] font-semibold text-[#C6FF00] bg-[#C6FF00]/10 px-2.5 py-0.5 rounded-full border border-[#C6FF00]/20 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          {isPro ? 'Validação Profissional (PRO)' : 'Passo 2 de 2: Verificação Cadastral'}
        </span>
      </div>

      {/* Identificação da Conta Google Conectada */}
      <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {userProfile.avatarUrl ? (
            <img
              src={userProfile.avatarUrl}
              alt={userProfile.fullName}
              className="w-10 h-10 rounded-full border border-[#C6FF00]/50 object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#C6FF00]/20 border border-[#C6FF00] flex items-center justify-center text-[#C6FF00] font-bold text-sm flex-shrink-0">
              {userProfile.fullName ? userProfile.fullName.charAt(0) : 'G'}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate">{userProfile.fullName}</span>
              <span className="text-[10px] bg-white/10 text-white/80 px-1.5 py-0.2 rounded font-mono">Google</span>
            </div>
            <p className="text-[11px] text-[#9FA1AC] truncate">{userProfile.email}</p>
          </div>
        </div>

        {/* Botão para trocar de conta Google */}
        <button
          type="button"
          onClick={onSwitchAccount}
          className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#9FA1AC] hover:text-[#C6FF00] border border-white/10 text-[10px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0"
          title="Fazer login com outra conta Google"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Trocar conta</span>
        </button>
      </div>

      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-extrabold text-white font-heading flex items-center gap-2">
          {isPro ? (
            <>
              <span>Credenciamento Profissional</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#C6FF00] text-[#08080A] font-black">PRO</span>
            </>
          ) : (
            'Confirmação de Identidade'
          )}
        </h2>
        <p className="text-xs text-[#9FA1AC] mt-1 leading-relaxed">
          {isPro 
            ? 'Para emitir periodizações e prescrever treinos/dietas, confirme seu CPF único e seu registro profissional ativo (CREF/CRN).'
            : 'Para garantir a segurança esportiva e validação com a base da Receita Federal, confira seus dados cadastrais.'
          }
        </p>
      </div>

      {/* Alerta de Erro */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-400 animate-fadeIn">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Campo Nome Completo do Titular */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-white/90">
              Nome Completo do Titular * (Conforme no CPF)
            </label>
            {fullName.trim() && (
              <span className={`text-[10px] font-bold flex items-center gap-1 ${nameCheck.isEquivalent ? 'text-[#C6FF00]' : 'text-red-400'}`}>
                {nameCheck.isEquivalent ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Nome Compatível
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    Nome Incompatível
                  </>
                )}
              </span>
            )}
          </div>

          <div className="relative">
            <User className="w-4 h-4 text-[#9FA1AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={fullName}
              onChange={handleFullNameChange}
              placeholder="Nome completo do titular do CPF"
              required
              className={`w-full pl-10 pr-4 py-2 rounded-xl bg-[#08080A] border text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none transition-colors ${
                fullName.trim()
                  ? nameCheck.isEquivalent
                    ? 'border-[#C6FF00] shadow-[0_0_8px_rgba(198,255,0,0.15)]'
                    : 'border-red-500/70'
                  : 'border-white/10 focus:border-[#C6FF00]'
              }`}
            />
          </div>
        </div>

        {/* Username Padrão com @ (Para PRO: obrigatoriamente @pro_nome_de_usuario) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
              <span>Nome de Usuário (@)</span>
              {isPro && (
                <span className="text-[10px] font-mono text-[#C6FF00] bg-[#C6FF00]/10 px-1.5 py-0.2 rounded font-bold">
                  Padrão PRO: @pro_...
                </span>
              )}
            </label>
            <span className="text-[10px] text-[#9FA1AC] font-mono">
              @{proUsername}
            </span>
          </div>

          <div className="relative">
            <AtSign className="w-4 h-4 text-[#C6FF00] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={proUsername}
              onChange={handleUsernameChange}
              placeholder={isPro ? "pro_seunome" : "seunome"}
              required
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#08080A] border border-white/10 focus:border-[#C6FF00] text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none font-mono"
            />
          </div>
          <p className="text-[10px] text-[#9FA1AC]/70 mt-1">
            {isPro 
              ? 'Por padrão regulatório da plataforma, contas profissionais recebem o identificador @pro_.'
              : 'Seu @ exclusivo para interação na comunidade e feed social.'}
          </p>
        </div>

        {/* Grid: CPF + Data de Nascimento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Campo CPF */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-white/90">
                CPF do Titular *
              </label>
              {isCpfFilled && (
                <span className={`text-[10px] font-bold flex items-center gap-1 ${isCpfValid ? 'text-[#C6FF00]' : 'text-red-400'}`}>
                  {isCpfValid ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      Válido
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      Inválido
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="relative">
              <CreditCard className="w-4 h-4 text-[#9FA1AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={cpf}
                onChange={handleCpfChange}
                placeholder="000.000.000-00"
                maxLength={14}
                required
                className={`w-full pl-10 pr-4 py-2 rounded-xl bg-[#08080A] border text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none transition-colors ${
                  isCpfFilled
                    ? isCpfValid
                      ? 'border-[#C6FF00] shadow-[0_0_8px_rgba(198,255,0,0.15)]'
                      : 'border-red-500/70'
                    : 'border-white/10 focus:border-[#C6FF00]'
                }`}
              />
            </div>
          </div>

          {/* Campo Data de Nascimento */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-white/90">
                Nascimento *
              </label>
              {birthDate && (
                <span className={`text-[10px] font-bold flex items-center gap-1 ${isAdult ? 'text-[#C6FF00]' : 'text-red-400'}`}>
                  {isAdult ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      {age} anos
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      Menor de 18
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="relative">
              <Calendar className="w-4 h-4 text-[#9FA1AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={birthDate}
                onChange={handleBirthDateChange}
                max={new Date().toISOString().split('T')[0]}
                required
                className={`w-full pl-10 pr-4 py-2 rounded-xl bg-[#08080A] border text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none transition-colors ${
                  birthDate
                    ? isAdult
                      ? 'border-[#C6FF00] shadow-[0_0_8px_rgba(198,255,0,0.15)]'
                      : 'border-red-500/70'
                    : 'border-white/10 focus:border-[#C6FF00]'
                }`}
              />
            </div>
          </div>
        </div>

        {/* SEÇÃO OBRIGATÓRIA PARA PROFISSIONAL: REGISTRO DE CLASSE ATIVO (CREF / CRN) */}
        {isPro && (
          <div className="p-3.5 rounded-xl bg-[#C6FF00]/[0.04] border border-[#C6FF00]/25 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileBadge className="w-4 h-4 text-[#C6FF00]" />
                <span className="text-xs font-extrabold text-white">Registro de Classe Obrigatório</span>
              </div>
              <span className="text-[10px] font-mono text-[#C6FF00] bg-[#C6FF00]/15 px-2 py-0.5 rounded-full font-bold">
                Exclusivo PRO
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Tipo de Conselho */}
              <div>
                <label className="text-[11px] font-semibold text-white/80 block mb-1">
                  Conselho *
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCouncilType('CREF')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-extrabold transition-all border ${
                      councilType === 'CREF'
                        ? 'bg-[#C6FF00] text-[#08080A] border-[#C6FF00] shadow-[0_0_10px_rgba(198,255,0,0.2)]'
                        : 'bg-[#08080A] text-[#9FA1AC] border-white/10 hover:border-white/20'
                    }`}
                  >
                    CREF
                  </button>
                  <button
                    type="button"
                    onClick={() => setCouncilType('CRN')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-extrabold transition-all border ${
                      councilType === 'CRN'
                        ? 'bg-[#C6FF00] text-[#08080A] border-[#C6FF00] shadow-[0_0_10px_rgba(198,255,0,0.2)]'
                        : 'bg-[#08080A] text-[#9FA1AC] border-white/10 hover:border-white/20'
                    }`}
                  >
                    CRN
                  </button>
                </div>
              </div>

              {/* Número do Registro */}
              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold text-white/80 block mb-1">
                  Número de Registro / Região *
                </label>
                <div className="relative">
                  <Award className="w-3.5 h-3.5 text-[#C6FF00] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={councilNumber}
                    onChange={(e) => {
                      setCouncilNumber(e.target.value);
                      setErrorMessage('');
                    }}
                    placeholder={councilType === 'CREF' ? 'Ex: 048291-G/SP' : 'Ex: 48192-CRN-3'}
                    required
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#08080A] border border-white/10 focus:border-[#C6FF00] text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none uppercase font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Checkbox de Confirmação de Registro Ativo */}
            <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={councilActiveConfirmed}
                onChange={(e) => {
                  setCouncilActiveConfirmed(e.target.checked);
                  setErrorMessage('');
                }}
                className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[#08080A] text-[#C6FF00] focus:ring-0 accent-[#C6FF00] cursor-pointer"
              />
              <span className="text-[11px] text-[#9FA1AC] leading-tight">
                Declaro sob as penas da lei que meu registro no <strong className="text-white">{councilType}</strong> encontra-se <strong className="text-[#C6FF00]">devidamente ATIVO e regular</strong>, habilitando-me legalmente para prescrição técnica de treinos ou planos alimentares.
              </span>
            </label>
          </div>
        )}

        {/* Termo e Aviso de Privacidade e Mesma Conta */}
        <div className="p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-start gap-2 text-[10px] text-[#9FA1AC] leading-relaxed">
          <Lock className="w-3.5 h-3.5 text-[#C6FF00] flex-shrink-0 mt-0.5" />
          <span>
            {isPro 
              ? 'Conexão Unificada: Você poderá utilizar esta mesma conta Google para acessar a plataforma de usuários/alunos como atleta, sem necessidade de recadastramento.'
              : 'Seus dados são protegidos pela LGPD. O CPF é único e intransferível no ecossistema O Domo FIT.'
            }
          </span>
        </div>

        {/* Botão de Finalização */}
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className={`w-full py-2.5 rounded-xl font-extrabold text-xs tracking-wide uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            isFormValid
              ? 'bg-[#C6FF00] hover:bg-[#B2E600] active:scale-[0.98] text-[#08080A] shadow-[0_4px_16px_rgba(198,255,0,0.3)]'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-[#08080A] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>{isPro ? 'Ativar Conta Profissional e Acessar' : 'Concluir Cadastro e Acessar'}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
