// src/app/core/models/report.model.ts

/**
 * Resumo geral das vendas
 */
export interface SalesSummary {
  totalSales: number;
  totalVolumeLiters: number;
}

/**
 * Vendas agrupadas por tamanho de copo
 */
export interface SalesByCupSize {
  cupSize: number;
  count: number;
}

/**
 * Vendas agrupadas por tipo de cerveja
 */
export interface SalesByBeerType {
  beerId: string;
  name: string;
  color: string;
  description: string;
  totalLiters: number;
  totalCups: number;
}

/**
 * Relatório completo com todos os dados agregados
 */
export interface FullReport {
  summary: SalesSummary;
  salesByCupSize: SalesByCupSize[];
  salesByBeerType: SalesByBeerType[];
}

/**
 * Intervalo de datas para filtros
 * Usando readonly para garantir imutabilidade
 */
export interface DateRange {
  readonly startDate: Date | null;
  readonly endDate: Date | null;
}

/**
 * Enum para períodos pré-definidos
 * Facilita manutenção e evita números mágicos
 */
export enum PresetPeriod {
  TODAY = 0,
  LAST_7_DAYS = 7,
  LAST_30_DAYS = 30
}

/**
 * Type guard para verificar se uma data é válida
 */
export function isValidDate(date: Date | null): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Type guard para verificar se o intervalo de datas é válido
 */
export function isValidDateRange(range: DateRange): boolean {
  if (!range.startDate && !range.endDate) {
    return true; // Range vazio é válido
  }
  
  if (range.startDate && !isValidDate(range.startDate)) {
    return false;
  }
  
  if (range.endDate && !isValidDate(range.endDate)) {
    return false;
  }
  
  if (range.startDate && range.endDate) {
    return range.startDate <= range.endDate;
  }
  
  return true;
}

/**
 * Cria um intervalo de datas baseado em dias atrás
 * Função pura que facilita testes
 * 
 * @param days Número de dias atrás (0 = hoje)
 * @returns DateRange com as datas normalizadas
 */
export function createPresetDateRange(days: number): DateRange {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Normaliza as datas para início/fim do dia
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  
  return { startDate, endDate };
}

/**
 * Constante para intervalo vazio
 * Evita criar novos objetos desnecessariamente
 */
export const EMPTY_DATE_RANGE: DateRange = {
  startDate: null,
  endDate: null
} as const;

/**
 * Formata um intervalo de datas para exibição
 * 
 * @param range Intervalo de datas a ser formatado
 * @returns String formatada em português brasileiro
 */
export function formatDateRange(range: DateRange): string {
  const format = (date: Date): string => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (range.startDate && range.endDate) {
    return `${format(range.startDate)} até ${format(range.endDate)}`;
  }
  
  if (range.startDate) {
    return `A partir de ${format(range.startDate)}`;
  }
  
  if (range.endDate) {
    return `Até ${format(range.endDate)}`;
  }
  
  return 'Todos os períodos';
}