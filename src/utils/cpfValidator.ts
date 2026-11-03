/**
 * Utilitários Oficiais de Validação e Formatação de CPF e Idade (Receita Federal)
 * O Domo FIT — Compliance de Cadastro e Proteção Legal
 */

/**
 * Remove qualquer caractere que não seja número do CPF
 */
export function cleanCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/**
 * Aplica a máscara padrão brasileira (000.000.000-00) em tempo real
 */
export function formatCPF(value: string): string {
  const digits = cleanCPF(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Validação algorítmica oficial da Receita Federal (Módulo 11)
 */
export function validateCPF(cpf: string): boolean {
  const clean = cleanCPF(cpf);

  if (clean.length !== 11) return false;

  // Rejeita sequências de dígitos repetidos conhecidas
  const invalidKnown = [
    '00000000000', '11111111111', '22222222222', '33333333333',
    '44444444444', '55555555555', '66666666666', '77777777777',
    '88888888888', '99999999999'
  ];
  if (invalidKnown.includes(clean)) return false;

  // Validação do 1º Dígito Verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let firstDigit = (sum * 10) % 11;
  if (firstDigit === 10 || firstDigit === 11) firstDigit = 0;
  if (firstDigit !== parseInt(clean.charAt(9), 10)) return false;

  // Validação do 2º Dígito Verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  let secondDigit = (sum * 10) % 11;
  if (secondDigit === 10 || secondDigit === 11) secondDigit = 0;
  if (secondDigit !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

/**
 * Calcula a idade exata com base na data de nascimento
 */
export function calculateAge(birthDateString: string): number {
  if (!birthDateString) return 0;
  const today = new Date();
  const birthDate = new Date(birthDateString);

  if (isNaN(birthDate.getTime())) return 0;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Valida se a pessoa tem no mínimo 18 anos completos
 */
export function isAtLeast18(birthDateString: string): boolean {
  const age = calculateAge(birthDateString);
  return age >= 18;
}

/**
 * Interface de consulta / validação da Receita Federal
 */
export interface ReceitaValidationResult {
  valid: boolean;
  isAdult: boolean;
  age?: number;
  fullName?: string;
  errorMessage?: string;
}

/**
 * Consulta de validação cadastral (Receita Federal)
 * Suporta integração direta com APIs como HubDesenvolvedor, Serpro ou Datavalid
 */
export async function verifyReceitaFederalCPF(
  cpf: string,
  birthDate: string
): Promise<ReceitaValidationResult> {
  const clean = cleanCPF(cpf);

  // 1. Validação Sintática e Algorítmica do CPF
  if (!validateCPF(clean)) {
    return {
      valid: false,
      isAdult: false,
      errorMessage: 'CPF inválido. Por favor, confira os números digitados.'
    };
  }

  // 2. Validação da Idade Mínima de 18 Anos
  if (!birthDate) {
    return {
      valid: false,
      isAdult: false,
      errorMessage: 'Data de nascimento é obrigatória para verificação na Receita Federal.'
    };
  }

  const age = calculateAge(birthDate);
  if (age < 18) {
    return {
      valid: false,
      isAdult: false,
      age,
      errorMessage: `Cadastro não permitido: o usuário possui ${age} ano(s). É obrigatório ter ao menos 18 anos completos para utilizar o O Domo FIT.`
    };
  }

  return {
    valid: true,
    isAdult: true,
    age,
    errorMessage: undefined
  };
}
