/**
 * Utilitários Oficiais de Validação e Formatação de CPF, Idade e Nome (Receita Federal)
 * O Domo FIT — Compliance de Cadastro, Proteção Legal e Prevenção a Fraudes
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
 * Normaliza um nome removendo acentos, pontuações e excesso de espaços
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extrai os tokens significativos de um nome (ignora preposições brasileiras como DE, DA, DO, DOS, DAS, E)
 */
export function getNameTokens(name: string): string[] {
  const normalized = normalizeName(name);
  if (!normalized) return [];
  const stopWords = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);
  return normalized.split(' ').filter((t) => t.length > 0 && !stopWords.has(t));
}

/**
 * Valida se o nome informado para o CPF é equivalente ao nome da conta Google conectada.
 * Evita que o usuário use CPF de terceiros (ex: pais, cônjuge ou desconhecidos).
 */
export function validateNameEquivalence(
  googleName: string,
  cpfName: string
): { isEquivalent: boolean; reason?: string } {
  const tGoogle = getNameTokens(googleName);
  const tCpf = getNameTokens(cpfName);

  if (tGoogle.length === 0 || tCpf.length === 0) {
    return {
      isEquivalent: false,
      reason: 'Por favor, informe o nome completo para verificação.',
    };
  }

  const firstG = tGoogle[0];
  const lastG = tGoogle[tGoogle.length - 1];
  const firstC = tCpf[0];
  const lastC = tCpf[tCpf.length - 1];

  // 1. Checa se o primeiro nome coincide (ou é apelido/prefixo de ao menos 3 letras)
  const firstMatches =
    firstG === firstC ||
    (firstG.length >= 3 && firstC.startsWith(firstG)) ||
    (firstC.length >= 3 && firstG.startsWith(firstC));

  const commonTokens = tGoogle.filter((t) => tCpf.includes(t));

  if (!firstMatches && commonTokens.length === 0) {
    return {
      isEquivalent: false,
      reason: `O primeiro nome ('${firstC.charAt(0) + firstC.slice(1).toLowerCase()}') não corresponde ao titular da conta conectada ('${firstG.charAt(0) + firstG.slice(1).toLowerCase()}').`,
    };
  }

  // Se primeiro nome bate e o último sobrenome bate ou está presente
  if (firstMatches && (lastG === lastC || tCpf.includes(lastG) || tGoogle.includes(lastC))) {
    return { isEquivalent: true };
  }

  // Se um nome é subconjunto do outro (ex: 'Arthur Lamonica' vs 'Arthur Jose Lamonica')
  const isSubset =
    tGoogle.every((t) => tCpf.includes(t)) || tCpf.every((t) => tGoogle.includes(t));
  if (isSubset) {
    return { isEquivalent: true };
  }

  // Se possui 2 ou mais nomes/sobrenomes idênticos
  if (commonTokens.length >= 2) {
    return { isEquivalent: true };
  }

  return {
    isEquivalent: false,
    reason: `O nome informado no CPF não é equivalente ao titular da conta conectada ('${googleName}'). O CPF deve pertencer à mesma pessoa.`,
  };
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
  birthDate: string,
  cpfName?: string,
  googleName?: string
): Promise<ReceitaValidationResult> {
  const clean = cleanCPF(cpf);

  // 1. Validação Sintática e Algorítmica do CPF
  if (!validateCPF(clean)) {
    return {
      valid: false,
      isAdult: false,
      errorMessage: 'CPF inválido. Por favor, confira os números digitados.',
    };
  }

  // 2. Validação da Idade Mínima de 18 Anos
  if (!birthDate) {
    return {
      valid: false,
      isAdult: false,
      errorMessage: 'Data de nascimento é obrigatória para verificação na Receita Federal.',
    };
  }

  const age = calculateAge(birthDate);
  if (age < 18) {
    return {
      valid: false,
      isAdult: false,
      age,
      errorMessage: `Cadastro não permitido: o usuário possui ${age} ano(s). É obrigatório ter ao menos 18 anos completos para utilizar o O Domo FIT.`,
    };
  }

  // 3. Validação de Equivalência de Nome
  if (cpfName && googleName) {
    const nameCheck = validateNameEquivalence(googleName, cpfName);
    if (!nameCheck.isEquivalent) {
      return {
        valid: false,
        isAdult: true,
        age,
        errorMessage: nameCheck.reason,
      };
    }
  }

  return {
    valid: true,
    isAdult: true,
    age,
    errorMessage: undefined,
  };
}
