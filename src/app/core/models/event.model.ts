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
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 * - dt_ : Colunas TEXT com DEFAULT CURRENT_TIMESTAMP
 */
export interface Event {
  num_id: number;                      // PK AUTOINCREMENT
  desc_name_event: string;             // Nome do evento (ex: "Festa Holliday")
  desc_local_event: string;            // Local do evento (ex: "Clube Recreativo")
  dt_data_event: string;               // Data do evento (ISO string)
  desc_contact_event?: string;         // Telefone/contato (ex: "11 99999-9999")
  desc_name_contact_event?: string;    // Nome do responsável (ex: "João Silva")
  desc_status: EventStatus;            // Status do evento
  dt_created_at: string;               // Data de criação (ISO string)
  dt_updated_at: string;               // Data de última atualização (ISO string)
}

/**
 * Interface para criação de novo evento (sem id, timestamps automáticos)
 */
export interface CreateEventDto {
  desc_name_event: string;
  desc_local_event: string;
  dt_data_event: string;
  desc_contact_event?: string;
  desc_name_contact_event?: string;
  desc_status?: EventStatus;      // Opcional, default = 'planejamento'
}

/**
 * Interface para atualização de evento (todos campos opcionais exceto id)
 */
export interface UpdateEventDto {
  num_id: number;
  desc_name_event?: string;
  desc_local_event?: string;
  dt_data_event?: string;
  desc_contact_event?: string;
  desc_name_contact_event?: string;
  desc_status?: EventStatus;
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
    typeof obj.num_id === 'number' &&
    typeof obj.desc_name_event === 'string' &&
    obj.desc_name_event.trim().length > 0 &&
    typeof obj.desc_local_event === 'string' &&
    obj.desc_local_event.trim().length > 0 &&
    typeof obj.dt_data_event === 'string' &&
    (obj.desc_contact_event === undefined || obj.desc_contact_event === null || typeof obj.desc_contact_event === 'string') &&
    (obj.desc_name_contact_event === undefined || obj.desc_name_contact_event === null || typeof obj.desc_name_contact_event === 'string') &&
    isEventStatus(obj.desc_status) &&
    typeof obj.dt_created_at === 'string' &&
    typeof obj.dt_updated_at === 'string'
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
  if (!dto.desc_name_event || dto.desc_name_event.trim().length === 0) {
    errors.push('Nome do evento é obrigatório');
  } else if (dto.desc_name_event.trim().length > 100) {
    errors.push('Nome do evento deve ter no máximo 100 caracteres');
  }

  // Validação do local
  if (!dto.desc_local_event || dto.desc_local_event.trim().length === 0) {
    errors.push('Local do evento é obrigatório');
  } else if (dto.desc_local_event.trim().length > 200) {
    errors.push('Local do evento deve ter no máximo 200 caracteres');
  }

  // Validação da data
  if (!dto.dt_data_event || dto.dt_data_event.trim().length === 0) {
    errors.push('Data do evento é obrigatória');
  } else {
    const date = new Date(dto.dt_data_event);
    if (isNaN(date.getTime())) {
      errors.push('Data do evento inválida');
    }
  }

  // Validação de status (se fornecido)
  if (dto.desc_status && !isEventStatus(dto.desc_status)) {
    errors.push('Status do evento inválido');
  }

  // Validação de contato (opcional, mas se fornecido deve ser válido)
  if (dto.desc_contact_event && dto.desc_contact_event.trim().length > 50) {
    errors.push('Contato deve ter no máximo 50 caracteres');
  }

  // Validação de nome do contato (opcional)
  if (dto.desc_name_contact_event && dto.desc_name_contact_event.trim().length > 100) {
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
  if (typeof dto.num_id !== 'number' || dto.num_id <= 0) {
    errors.push('ID do evento inválido');
  }

  // Validações condicionais (apenas se os campos forem fornecidos)
  if (dto.desc_name_event !== undefined) {
    if (dto.desc_name_event.trim().length === 0) {
      errors.push('Nome do evento não pode ser vazio');
    } else if (dto.desc_name_event.trim().length > 100) {
      errors.push('Nome do evento deve ter no máximo 100 caracteres');
    }
  }

  if (dto.desc_local_event !== undefined) {
    if (dto.desc_local_event.trim().length === 0) {
      errors.push('Local do evento não pode ser vazio');
    } else if (dto.desc_local_event.trim().length > 200) {
      errors.push('Local do evento deve ter no máximo 200 caracteres');
    }
  }

  if (dto.dt_data_event !== undefined) {
    const date = new Date(dto.dt_data_event);
    if (isNaN(date.getTime())) {
      errors.push('Data do evento inválida');
    }
  }

  if (dto.desc_status !== undefined && !isEventStatus(dto.desc_status)) {
    errors.push('Status do evento inválido');
  }

  if (dto.desc_contact_event !== undefined && dto.desc_contact_event.trim().length > 50) {
    errors.push('Contato deve ter no máximo 50 caracteres');
  }

  if (dto.desc_name_contact_event !== undefined && dto.desc_name_contact_event.trim().length > 100) {
    errors.push('Nome do contato deve ter no máximo 100 caracteres');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Helper para formatar data de evento para exibição
 * @param dt_data_event Data em formato ISO string
 * @returns Data formatada (dd/MM/yyyy HH:mm) ou string vazia se inválida
 */
export function formatEventDate(dt_data_event: string): string {
  try {
    const date = new Date(dt_data_event);
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
