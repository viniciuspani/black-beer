// ========================================
// src/app/core/models/event.model.ts
// ========================================

/**
 * Status possíveis para um evento
 * - planejamento: Evento em fase de planejamento (estoque/preços sendo configurados)
 * - ativo: Evento em andamento (vendas podem ser vinculadas a ele)
 * - finalizado: Evento encerrado (apenas para consulta em relatórios)
 */
export type EventStatus = 'planejamento' | 'ativo' | 'finalizado';

/**
 * Interface para eventos de venda
 * Representa um evento onde cervejas serão vendidas com configurações específicas de estoque e preços
 *
 * Exemplo de uso:
 * - Criar evento "Festa Holliday" no Clube Recreativo
 * - Configurar estoque de cervejas específico para o evento
 * - Configurar preços específicos para o evento
 * - Vincular vendas ao evento durante sua realização
 * - Gerar relatórios filtrados por evento
 */
export interface Event {
  id: number;                     // PK AUTOINCREMENT
  nameEvent: string;              // Nome do evento (ex: "Festa Holliday")
  localEvent: string;             // Local do evento (ex: "Clube Recreativo")
  dataEvent: string;              // Data do evento (ISO string)
  contactEvent?: string;          // Telefone/contato (ex: "11 99999-9999")
  nameContactEvent?: string;      // Nome do responsável (ex: "João Silva")
  status: EventStatus;            // Status do evento
  createdAt: string;              // Data de criação (ISO string)
  updatedAt: string;              // Data de última atualização (ISO string)
}

/**
 * Interface para criação de novo evento (sem id, timestamps automáticos)
 */
export interface CreateEventDto {
  nameEvent: string;
  localEvent: string;
  dataEvent: string;
  contactEvent?: string;
  nameContactEvent?: string;
  status?: EventStatus;           // Opcional, default = 'planejamento'
}

/**
 * Interface para atualização de evento (todos campos opcionais exceto id)
 */
export interface UpdateEventDto {
  id: number;
  nameEvent?: string;
  localEvent?: string;
  dataEvent?: string;
  contactEvent?: string;
  nameContactEvent?: string;
  status?: EventStatus;
}

/**
 * Type guard para validar EventStatus
 * @param status String a ser validada
 * @returns true se o status é válido
 */
export function isEventStatus(status: string): status is EventStatus {
  return ['planejamento', 'ativo', 'finalizado'].includes(status);
}

/**
 * Type guard para validar Event
 * Valida em runtime se um objeto é um Event válido
 *
 * @param obj Objeto a ser validado
 * @returns true se o objeto é um Event válido
 */
export function isValidEvent(obj: any): obj is Event {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.nameEvent === 'string' &&
    obj.nameEvent.trim().length > 0 &&
    typeof obj.localEvent === 'string' &&
    obj.localEvent.trim().length > 0 &&
    typeof obj.dataEvent === 'string' &&
    (obj.contactEvent === undefined || obj.contactEvent === null || typeof obj.contactEvent === 'string') &&
    (obj.nameContactEvent === undefined || obj.nameContactEvent === null || typeof obj.nameContactEvent === 'string') &&
    isEventStatus(obj.status) &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}

/**
 * Valida dados para criação de evento
 * @param dto Dados do evento a ser criado
 * @returns Objeto com status e erros de validação
 */
export function validateCreateEvent(dto: CreateEventDto): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validação do nome do evento
  if (!dto.nameEvent || dto.nameEvent.trim().length === 0) {
    errors.push('Nome do evento é obrigatório');
  } else if (dto.nameEvent.trim().length > 100) {
    errors.push('Nome do evento deve ter no máximo 100 caracteres');
  }

  // Validação do local
  if (!dto.localEvent || dto.localEvent.trim().length === 0) {
    errors.push('Local do evento é obrigatório');
  } else if (dto.localEvent.trim().length > 200) {
    errors.push('Local do evento deve ter no máximo 200 caracteres');
  }

  // Validação da data
  if (!dto.dataEvent || dto.dataEvent.trim().length === 0) {
    errors.push('Data do evento é obrigatória');
  } else {
    const date = new Date(dto.dataEvent);
    if (isNaN(date.getTime())) {
      errors.push('Data do evento inválida');
    }
  }

  // Validação de status (se fornecido)
  if (dto.status && !isEventStatus(dto.status)) {
    errors.push('Status do evento inválido');
  }

  // Validação de contato (opcional, mas se fornecido deve ser válido)
  if (dto.contactEvent && dto.contactEvent.trim().length > 50) {
    errors.push('Contato deve ter no máximo 50 caracteres');
  }

  // Validação de nome do contato (opcional)
  if (dto.nameContactEvent && dto.nameContactEvent.trim().length > 100) {
    errors.push('Nome do contato deve ter no máximo 100 caracteres');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Valida dados para atualização de evento
 * @param dto Dados do evento a ser atualizado
 * @returns Objeto com status e erros de validação
 */
export function validateUpdateEvent(dto: UpdateEventDto): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // ID é obrigatório
  if (typeof dto.id !== 'number' || dto.id <= 0) {
    errors.push('ID do evento inválido');
  }

  // Validações condicionais (apenas se os campos forem fornecidos)
  if (dto.nameEvent !== undefined) {
    if (dto.nameEvent.trim().length === 0) {
      errors.push('Nome do evento não pode ser vazio');
    } else if (dto.nameEvent.trim().length > 100) {
      errors.push('Nome do evento deve ter no máximo 100 caracteres');
    }
  }

  if (dto.localEvent !== undefined) {
    if (dto.localEvent.trim().length === 0) {
      errors.push('Local do evento não pode ser vazio');
    } else if (dto.localEvent.trim().length > 200) {
      errors.push('Local do evento deve ter no máximo 200 caracteres');
    }
  }

  if (dto.dataEvent !== undefined) {
    const date = new Date(dto.dataEvent);
    if (isNaN(date.getTime())) {
      errors.push('Data do evento inválida');
    }
  }

  if (dto.status !== undefined && !isEventStatus(dto.status)) {
    errors.push('Status do evento inválido');
  }

  if (dto.contactEvent !== undefined && dto.contactEvent.trim().length > 50) {
    errors.push('Contato deve ter no máximo 50 caracteres');
  }

  if (dto.nameContactEvent !== undefined && dto.nameContactEvent.trim().length > 100) {
    errors.push('Nome do contato deve ter no máximo 100 caracteres');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Helper para formatar data de evento para exibição
 * @param dataEvent Data em formato ISO string
 * @returns Data formatada (dd/MM/yyyy HH:mm) ou string vazia se inválida
 */
export function formatEventDate(dataEvent: string): string {
  try {
    const date = new Date(dataEvent);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return '';
  }
}

/**
 * Helper para obter label em português do status
 * @param status Status do evento
 * @returns Label em português
 */
export function getEventStatusLabel(status: EventStatus): string {
  const labels: Record<EventStatus, string> = {
    planejamento: 'Planejamento',
    ativo: 'Ativo',
    finalizado: 'Finalizado'
  };
  return labels[status];
}

/**
 * Helper para obter severity do PrimeNG baseado no status
 * @param status Status do evento
 * @returns Severity do PrimeNG para badges/tags
 */
export function getEventStatusSeverity(status: EventStatus): 'info' | 'success' | 'secondary' {
  const severities: Record<EventStatus, 'info' | 'success' | 'secondary'> = {
    planejamento: 'info',
    ativo: 'success',
    finalizado: 'secondary'
  };
  return severities[status];
}
