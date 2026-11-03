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
  RefreshCw
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

interface GoogleCpfCompletionStepProps {
  userProfile: GoogleUserProfile;
  onCancel: () => void;
  onSwitchAccount: () => void;
  onSuccess: (data: { 
    cpf: string; 
    birthDate: string; 
    fullName: string;
    userProfile: GoogleUserProfile 
  }) => void;
}

export const GoogleCpfCompletionStep: React.FC<GoogleCpfCompletionStepProps> = ({
  userProfile,
  onCancel,
  onSwitchAccount,
  onSuccess,
}) => {
  const [fullName, setFullName] = useState(userProfile.fullName || '');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
      setErrorMessage('Por favor, informe um CPF válido de acordo com o algoritmo da Receita Federal.');
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

    setIsLoading(true);

    (async () => {
      try {
        const checkResp = await fetch('https://api.odomofit.com.br/api/auth/check-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpf: clean })
        });
        const checkData = await checkResp.json();
        if (checkData.exists) {
          setIsLoading(false);
          setErrorMessage('Este CPF já está cadastrado em outra conta ativa no O Domo FIT. Não é possível criar uma nova conta com este documento.');
          return;
        }
      } catch (err) {
        console.warn('API check-user erro:', err);
      }

      setIsLoading(false);
      onSuccess({
        cpf: clean,
        birthDate,
        fullName: fullName.trim(),
        userProfile: {
          ...userProfile,
          fullName: fullName.trim(),
        },
      });
    })();
  };

  const isFormValid = isCpfValid && isAdult && nameCheck.isEquivalent;

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
          Passo 2 de 2: Verificação Cadastral
        </span>
      </div>

      {/* Identificação da Conta Google Conectada */}
      <div className="mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
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
        <h2 className="text-xl font-extrabold text-white font-heading">
          Confirmação de Identidade
        </h2>
        <p className="text-xs text-[#9FA1AC] mt-1 leading-relaxed">
          Para garantir a segurança esportiva, integridade de acesso e validação com a base da Receita Federal, confira seus dados cadastrais.
        </p>
      </div>

      {/* Alerta de Erro */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-400 animate-fadeIn">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Campo Nome Completo do Titular */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-white/90">
              Nome Completo do Titular * (Conforme no CPF)
            </label>
            {fullName.trim() && (
              <span className={`text-[11px] font-bold flex items-center gap-1 ${nameCheck.isEquivalent ? 'text-[#C6FF00]' : 'text-red-400'}`}>
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
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#08080A] border text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none transition-colors ${
                fullName.trim()
                  ? nameCheck.isEquivalent
                    ? 'border-[#C6FF00] shadow-[0_0_8px_rgba(198,255,0,0.15)]'
                    : 'border-red-500/70'
                  : 'border-white/10 focus:border-[#C6FF00]'
              }`}
            />
          </div>
          <p className="text-[10px] text-[#9FA1AC]/70 mt-1">
            Trava de segurança: o nome do CPF deve ser equivalente ao titular da conta Google conectada.
          </p>
        </div>

        {/* Campo CPF */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-white/90">
              CPF do Titular *
            </label>
            {isCpfFilled && (
              <span className={`text-[11px] font-bold flex items-center gap-1 ${isCpfValid ? 'text-[#C6FF00]' : 'text-red-400'}`}>
                {isCpfValid ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    CPF Válido
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    Dígitos Inválidos
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
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#08080A] border text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none transition-colors ${
                isCpfFilled
                  ? isCpfValid
                    ? 'border-[#C6FF00] shadow-[0_0_8px_rgba(198,255,0,0.15)]'
                    : 'border-red-500/70'
                  : 'border-white/10 focus:border-[#C6FF00]'
              }`}
            />
          </div>
          <p className="text-[10px] text-[#9FA1AC]/70 mt-1">
            Cada CPF só pode ser associado a uma única conta no O Domo FIT.
          </p>
        </div>

        {/* Campo Data de Nascimento */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-white/90">
              Data de Nascimento * (Conforme Receita Federal)
            </label>
            {birthDate && (
              <span className={`text-[11px] font-bold flex items-center gap-1 ${isAdult ? 'text-[#C6FF00]' : 'text-red-400'}`}>
                {isAdult ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    {age} anos (Maior de 18)
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    {age} anos (Menor de 18 - Bloqueado)
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
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#08080A] border text-white text-xs placeholder-[#9FA1AC]/40 focus:outline-none transition-colors ${
                birthDate
                  ? isAdult
                    ? 'border-[#C6FF00] shadow-[0_0_8px_rgba(198,255,0,0.15)]'
                    : 'border-red-500/70'
                  : 'border-white/10 focus:border-[#C6FF00]'
              }`}
            />
          </div>
          <p className="text-[10px] text-[#9FA1AC]/70 mt-1">
            Trava obrigatória: é necessário ter ao menos 18 anos completos para utilizar a plataforma.
          </p>
        </div>

        {/* Termo e Aviso de Privacidade */}
        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-start gap-2.5 text-[11px] text-[#9FA1AC] leading-relaxed">
          <Lock className="w-3.5 h-3.5 text-[#C6FF00] flex-shrink-0 mt-0.5" />
          <span>
            Seus dados são criptografados e protegidos nos termos da LGPD. A verificação cadastral é realizada diretamente para garantia de autenticidade, prevenção a fraudes e responsabilidade civil esportiva.
          </span>
        </div>

        {/* Botão de Finalização */}
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className={`w-full py-3 rounded-xl font-extrabold text-xs tracking-wide uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            isFormValid
              ? 'bg-[#C6FF00] hover:bg-[#B2E600] active:scale-[0.98] text-[#08080A] shadow-[0_4px_16px_rgba(198,255,0,0.3)]'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-[#08080A] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Concluir Cadastro e Acessar</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
