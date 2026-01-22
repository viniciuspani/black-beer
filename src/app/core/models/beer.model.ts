// ========================================
// src/app/core/models/beer.model.ts
// ========================================

/**
 * Interface para tipos de cerveja
 * MUDANÇA: id agora é number (INTEGER) em vez de string
 */
export interface BeerType {
  id: number;              // ← MUDANÇA: number em vez de string
  name: string;
  color: string;
  description: string;
}

/**
 * Interface para registro de vendas
 * MUDANÇAS:
 * - id: string → number
 * - beerId: string → number (mantém FK para beer_types)
 * - comandaId: Nova coluna opcional (V6) para vincular vendas a comandas
 * - userId: Nova coluna obrigatória (V8) para rastrear qual usuário fez a venda
 * - eventId: Nova coluna opcional (V9) para vincular vendas a eventos
 */
export interface Sale {
  id: number;              // ← MUDANÇA: number em vez de string
  beerId: number;          // ← MUDANÇA: number (FK para beer_types.id)
  beerName: string;
  cupSize: 300 | 500 | 1000; // em ml
  quantity: number;
  timestamp: string;       // ISO string para SQLite
  totalVolume: number;     // em ml
  comandaId?: number | null; // ← NOVO (V6): FK opcional para comandas
  userId: number;          // ← NOVO (V8): FK obrigatória para users.id
  eventId?: number | null; // ← NOVO (V9): FK opcional para eventos
}

/**
 * Interface para configurações da aplicação
 * MUDANÇA COMPLETA: Nova estrutura refletindo tabela settings v2
 * 
 * ANTES (v1):
 * - emailSettings: { email: string, isConfigured: boolean }
 * 
 * DEPOIS (v2):
 * - Estrutura plana que espelha a tabela do banco
 */
/**
 * Interface para configurações da aplicação
 * MUDANÇA: Agora suporta múltiplos emails (array)
 */
export interface AppSettings {
  id?: number;
  emails: string[];          // ← MUDANÇA: Array de emails (1 a 10)
  isConfigured: boolean;
}

/**
 * Interface para intervalo de datas
 * SEM MUDANÇAS - mantida para compatibilidade
 */
export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * Type guard para validar BeerType
 * NOVO: Ajuda a garantir type safety em runtime
 */
export function isBeerType(obj: any): obj is BeerType {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.color === 'string' &&
    typeof obj.description === 'string'
  );
}

/**
 * Type guard para validar Sale
 * NOVO: Validação em runtime para dados do banco
 */
export function isSale(obj: any): obj is Sale {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.beerId === 'number' &&
    typeof obj.beerName === 'string' &&
    (obj.cupSize === 300 || obj.cupSize === 500 || obj.cupSize === 1000) &&
    typeof obj.quantity === 'number' &&
    typeof obj.timestamp === 'string' &&
    typeof obj.totalVolume === 'number' &&
    typeof obj.userId === 'number' &&
    (obj.eventId === undefined || obj.eventId === null || typeof obj.eventId === 'number')
  );
}

/**
 * Type guard para validar AppSettings
 * NOVO: Validação da nova estrutura de settings
 */
export function isAppSettings(obj: any): obj is AppSettings {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj.id === undefined || typeof obj.id === 'number') &&
    typeof obj.email === 'string' &&
    typeof obj.isConfigured === 'boolean'
  );
}

/**
 * Constantes para tamanhos de copo
 * NOVO: Centraliza valores mágicos
 */
export const CUP_SIZES = {
  SMALL: 300,
  MEDIUM: 500,
  LARGE: 1000  // ← NOVO: 1 litro
} as const;

export type CupSize = typeof CUP_SIZES[keyof typeof CUP_SIZES];

/**
 * Helper para converter valores do banco em boolean
 * SQLite armazena boolean como INTEGER (0 ou 1)
 * 
 * @param value Valor do banco (0, 1, ou já boolean)
 * @returns Boolean correspondente
 */
export function toBooleanFromDb(value: number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  return value === 1;
}

/**
 * Helper para converter boolean em valor do banco
 * SQLite armazena boolean como INTEGER (0 ou 1)
 * 
 * @param value Boolean a ser convertido
 * @returns 0 (false) ou 1 (true)
 */
export function toDbFromBoolean(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Converte string do banco (separada por ;) para array de emails
 * @param emailString String do banco (ex: "a@x.com;b@x.com")
 * @returns Array de emails
 */
export function emailsFromDb(emailString: string | null | undefined): string[] {
  if (!emailString || emailString.trim() === '') {
    return [];
  }
  
  return emailString
    .split(';')
    .map(email => email.trim())
    .filter(email => email.length > 0);
}

/**
 * Converte array de emails para string do banco (separada por ;)
 * @param emails Array de emails
 * @returns String para o banco (ex: "a@x.com;b@x.com")
 */
export function emailsToDb(emails: string[]): string {
  if (!emails || emails.length === 0) {
    return '';
  }
  
  return emails
    .map(email => email.trim())
    .filter(email => email.length > 0)
    .join(';');
}

/**
 * Valida formato de um email individual
 * @param email Email a ser validado
 * @returns true se email é válido
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valida array de emails
 * @param emails Array de emails
 * @returns Objeto com status e detalhes da validação
 */
export function validateEmails(emails: string[]): {
  isValid: boolean;
  errors: string[];
  validEmails: string[];
  invalidEmails: string[];
} {
  const errors: string[] = [];
  const validEmails: string[] = [];
  const invalidEmails: string[] = [];
  
  // Valida quantidade mínima
  if (emails.length === 0) {
    errors.push('É necessário configurar pelo menos 1 email');
  }
  
  // Valida quantidade máxima
  if (emails.length > 10) {
    errors.push(`Máximo de 10 emails permitidos. Você inseriu ${emails.length} emails`);
  }
  
  // Valida formato de cada email
  emails.forEach(email => {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0) {
      return; // Ignora strings vazias
    }
    
    if (isValidEmail(trimmedEmail)) {
      validEmails.push(trimmedEmail);
    } else {
      invalidEmails.push(trimmedEmail);
      errors.push(`Email inválido: ${trimmedEmail}`);
    }
  });
  
  return {
    isValid: errors.length === 0 && validEmails.length > 0 && validEmails.length <= 10,
    errors,
    validEmails,
    invalidEmails
  };
}

/**
 * Parse do input do usuário (aceita , e ; como separadores)
 * @param input String digitada pelo usuário
 * @returns Array de emails limpos
 */
export function parseEmailInput(input: string): string[] {
  if (!input || input.trim() === '') {
    return [];
  }
  
  // Substitui vírgulas e ponto-e-vírgulas por um separador único
  const normalized = input.replace(/[,;]/g, '|');
  
  // Divide e limpa
  return normalized
    .split('|')
    .map(email => email.trim())
    .filter(email => email.length > 0);
}