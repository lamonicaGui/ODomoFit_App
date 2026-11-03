import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Calendar, 
  CreditCard, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  ArrowLeft 
} from 'lucide-react';
import { 
  formatCPF, 
  validateCPF, 
  cleanCPF, 
  calculateAge, 
  isAtLeast18 
} from '../utils/cpfValidator';

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: 'student' | 'trainer';
}

interface GoogleCpfCompletionStepProps {
  userProfile: GoogleUserProfile;
  onCancel: () => void;
  onSuccess: (data: { cpf: string; birthDate: string; userProfile: GoogleUserProfile }) => void;
}

export const GoogleCpfCompletionStep: React.FC<GoogleCpfCompletionStepProps> = ({
  userProfile,
  onCancel,
  onSuccess,
}) => {
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Estados de validação instantânea
  const clean = cleanCPF(cpf);
  const isCpfFilled = clean.length === 11;
  const isCpfValid = isCpfFilled ? validateCPF(clean) : null;

  const age = birthDate ? calculateAge(birthDate) : null;
  const isAdult = birthDate ? isAtLeast18(birthDate) : null;

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value);
    setCpf(formatted);
    setErrorMessage('');
  };

  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBirthDate(e.target.value);
    setErrorMessage('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // 1. Validação de CPF
    if (!isCpfFilled || !validateCPF(clean)) {
      setErrorMessage('Por favor, informe um CPF válido de acordo com o algoritmo da Receita Federal.');
      return;
    }

    // 2. Validação de Idade (Mínimo 18 anos completos)
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

    // Simulação ou chamada da procedure PostgreSQL 'complete_google_registration'
    setTimeout(() => {
      setIsLoading(false);

      // Simulação de proteção de CPF duplicado (exemplo demonstrativo de colisão)
      if (clean === '00000000191') {
        setErrorMessage('Este CPF já está cadastrado em outra conta ativa no O Domo FIT. Não é possível criar uma nova conta.');
        return;
      }

      onSuccess({
        cpf: clean,
        birthDate,
        userProfile,
      });
    }, 700);
  };

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
          <span>Voltar para opções de login</span>
        </button>

        <span className="text-[11px] font-semibold text-[#C6FF00] bg-[#C6FF00]/10 px-2.5 py-0.5 rounded-full border border-[#C6FF00]/20 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Passo 2 de 2: Verificação Cadastral
        </span>
      </div>

      {/* Identificação da Conta Google Conectada */}
      <div className="mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
        {userProfile.avatarUrl ? (
          <img
            src={userProfile.avatarUrl}
            alt={userProfile.fullName}
            className="w-10 h-10 rounded-full border border-[#C6FF00]/50 object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#C6FF00]/20 border border-[#C6FF00] flex items-center justify-center text-[#C6FF00] font-bold text-sm">
            {userProfile.fullName.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white truncate">{userProfile.fullName}</span>
            <span className="text-[10px] bg-white/10 text-white/80 px-1.5 py-0.2 rounded font-mono">Google</span>
          </div>
          <p className="text-[11px] text-[#9FA1AC] truncate">{userProfile.email}</p>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-white font-heading">
          Confirmação de Identidade
        </h2>
        <p className="text-xs text-[#9FA1AC] mt-1 leading-relaxed">
          Para garantir a segurança, integridade dos treinos e cumprimento legal (ter ao menos 18 anos completos), informe seus dados conforme constam na base da Receita Federal.
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
            É obrigatório ter ao menos 18 anos completos para utilização do app.
          </p>
        </div>

        {/* Termo e Aviso de Privacidade */}
        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-start gap-2.5 text-[11px] text-[#9FA1AC] leading-relaxed">
          <Lock className="w-3.5 h-3.5 text-[#C6FF00] flex-shrink-0 mt-0.5" />
          <span>
            Seus dados são criptografados e protegidos nos termos da LGPD. A verificação cadastral é feita diretamente para prevenção a fraudes e garantia de responsabilidade civil esportiva.
          </span>
        </div>

        {/* Botão de Finalização */}
        <button
          type="submit"
          disabled={isLoading || !isCpfValid || isAdult === false}
          className={`w-full py-3 rounded-xl font-extrabold text-xs tracking-wide uppercase transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            isCpfValid && isAdult
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
