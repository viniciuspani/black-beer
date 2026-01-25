// ========================================
// src/app/core/models/business.model.ts
// Model para empresas do sistema
// ========================================

/**
 * Interface da empresa
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 * - dt_ : Colunas TEXT com DEFAULT CURRENT_TIMESTAMP
 */
export interface Business {
  num_id: number;                      // ID único (auto-increment)
  desc_razao_social: string;           // Razão social da empresa
  desc_cnpj: string;                   // CNPJ da empresa
  desc_endereco: string;               // Endereço completo
  desc_cep: string;                    // CEP
  desc_cidade: string;                 // Cidade
  desc_estado: string;                 // Estado (UF)
  desc_responsavel_empresa: string;    // Nome do responsável
  num_gestor_empresa: number | null;   // FK para prd_users (quando gestor)
  int_active: number;                  // Status da empresa (0=inativa, 1=ativa)
  dt_created_at: string;               // Data de criação (ISO string)
  dt_updated_at: string;               // Data de atualização (ISO string)
}

/**
 * DTO para criar nova empresa
 * Usado no cadastro - não inclui ID nem datas
 */
export interface CreateBusinessDto {
  desc_razao_social: string;
  desc_cnpj: string;
  desc_endereco: string;
  desc_cep: string;
  desc_cidade: string;
  desc_estado: string;
  desc_responsavel_empresa: string;
  num_gestor_empresa?: number | null;
}

/**
 * DTO para atualizar empresa
 * Todos os campos são opcionais
 */
export interface UpdateBusinessDto {
  desc_razao_social?: string;
  desc_cnpj?: string;
  desc_endereco?: string;
  desc_cep?: string;
  desc_cidade?: string;
  desc_estado?: string;
  desc_responsavel_empresa?: string;
  num_gestor_empresa?: number | null;
  int_active?: number;
}

/**
 * Tipo para empresa na exibição (sem campos sensíveis)
 */
export type BusinessDisplay = Omit<Business, 'dt_updated_at'> & {
  gestor_username?: string;  // Nome do gestor (join com prd_users)
};

// ========================================
// HELPERS / UTILITÁRIOS
// ========================================

/**
 * Verifica se uma empresa está ativa
 */
export function isBusinessActive(business: Business | null | undefined): boolean {
  return business?.int_active === 1;
}

/**
 * Type guard para validar Business
 */
export function isValidBusiness(obj: any): obj is Business {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.num_id === 'number' &&
    typeof obj.desc_razao_social === 'string' &&
    typeof obj.desc_cnpj === 'string' &&
    typeof obj.desc_endereco === 'string' &&
    typeof obj.desc_cep === 'string' &&
    typeof obj.desc_cidade === 'string' &&
    typeof obj.desc_estado === 'string' &&
    typeof obj.desc_responsavel_empresa === 'string' &&
    typeof obj.int_active === 'number' &&
    typeof obj.dt_created_at === 'string'
  );
}

/**
 * Valida formato de CNPJ (apenas formato, não valida dígitos verificadores)
 * Aceita: 00.000.000/0000-00 ou 00000000000000
 */
export function isValidCnpjFormat(cnpj: string): boolean {
  const cnpjClean = cnpj.replace(/\D/g, '');
  return cnpjClean.length === 14;
}

/**
 * Formata CNPJ para exibição
 * 00000000000000 -> 00.000.000/0000-00
 */
export function formatCnpj(cnpj: string): string {
  const cnpjClean = cnpj.replace(/\D/g, '');
  if (cnpjClean.length !== 14) return cnpj;

  return cnpjClean.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
}

/**
 * Valida formato de CEP
 * Aceita: 00000-000 ou 00000000
 */
export function isValidCepFormat(cep: string): boolean {
  const cepClean = cep.replace(/\D/g, '');
  return cepClean.length === 8;
}

/**
 * Formata CEP para exibição
 * 00000000 -> 00000-000
 */
export function formatCep(cep: string): string {
  const cepClean = cep.replace(/\D/g, '');
  if (cepClean.length !== 8) return cep;

  return cepClean.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

/**
 * Lista de estados brasileiros
 */
export const ESTADOS_BR = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' }
] as const;

/**
 * Constantes do sistema para empresas
 */
export const BUSINESS_CONSTANTS = {
  CNPJ_LENGTH: 14,
  CEP_LENGTH: 8,
  MIN_RAZAO_SOCIAL_LENGTH: 3,
  MAX_RAZAO_SOCIAL_LENGTH: 150
} as const;
