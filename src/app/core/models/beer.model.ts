// ========================================
// src/app/core/models/beer.model.ts
// ========================================

/**
 * Interface para tipos de cerveja
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 * - dt_ : Colunas TEXT com DEFAULT CURRENT_TIMESTAMP
 */
export interface BeerType {
  num_id: number;
  desc_name: string;
  desc_color: string;
  desc_description: string;
}

/**
 * Interface para registro de vendas
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 * - dt_ : Colunas TEXT com DEFAULT CURRENT_TIMESTAMP
 */
export interface Sale {
  num_id: number;
  num_beer_id: number;           // FK para prd_beer_types.num_id
  desc_beer_name: string;
  num_cup_size: 300 | 500 | 1000; // em ml
  num_quantity: number;
  dt_timestamp: string;          // ISO string para SQLite
  num_total_volume: number;      // em ml
  num_comanda_id?: number | null; // FK opcional para prd_comandas
  num_user_id: number;           // FK obrigatória para prd_users.num_id
  num_event_id?: number | null;  // FK opcional para prd_events
}

/**
 * Interface para configurações da aplicação
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 */
export interface AppSettings {
  num_id?: number;
  desc_emails: string[];        // Array de emails (1 a 10)
  num_is_configured: boolean;
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
 */
export function isBeerType(obj: any): obj is BeerType {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.num_id === 'number' &&
    typeof obj.desc_name === 'string' &&
    typeof obj.desc_color === 'string' &&
    typeof obj.desc_description === 'string'
  );
}

/**
 * Type guard para validar Sale
 */
export function isSale(obj: any): obj is Sale {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.num_id === 'number' &&
    typeof obj.num_beer_id === 'number' &&
    typeof obj.desc_beer_name === 'string' &&
    (obj.num_cup_size === 300 || obj.num_cup_size === 500 || obj.num_cup_size === 1000) &&
    typeof obj.num_quantity === 'number' &&
    typeof obj.dt_timestamp === 'string' &&
    typeof obj.num_total_volume === 'number' &&
    typeof obj.num_user_id === 'number' &&
    (obj.num_event_id === undefined || obj.num_event_id === null || typeof obj.num_event_id === 'number')
  );
}

/**
 * Type guard para validar AppSettings
 */
export function isAppSettings(obj: any): obj is AppSettings {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj.num_id === undefined || typeof obj.num_id === 'number') &&
    Array.isArray(obj.desc_emails) &&
    typeof obj.num_is_configured === 'boolean'
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