// ========================================
// src/app/core/services/event.service.ts
// ========================================

import { Injectable, inject, signal, computed, WritableSignal } from '@angular/core';
import { DatabaseService } from './database';
import {
  Event,
  EventStatus,
  CreateEventDto,
  UpdateEventDto,
  validateCreateEvent,
  validateUpdateEvent,
  isValidEvent
} from '../models/event.model';

/**
 * Service para gerenciar eventos de venda
 *
 * Funcionalidades:
 * - CRUD completo de eventos
 * - Estado reativo com signals
 * - Validações de negócio
 * - Estatísticas de eventos
 * - Cache inteligente
 *
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class EventService {
  private readonly dbService = inject(DatabaseService);

  // ==================== SIGNALS PARA ESTADO REATIVO ====================

  /**
   * Lista de todos os eventos
   */
  private _events: WritableSignal<Event[]> = signal([]);
  public readonly events = this._events.asReadonly();

  /**
   * Evento atualmente selecionado para operações
   */
  private _selectedEvent: WritableSignal<Event | null> = signal(null);
  public readonly selectedEvent = this._selectedEvent.asReadonly();

  /**
   * Flag de carregamento
   */
  private _isLoading: WritableSignal<boolean> = signal(false);
  public readonly isLoading = this._isLoading.asReadonly();

  /**
   * Último erro ocorrido
   */
  private _lastError: WritableSignal<string | null> = signal(null);
  public readonly lastError = this._lastError.asReadonly();

  // ==================== COMPUTED SIGNALS ====================

  /**
   * Eventos em planejamento
   */
  public readonly planningEvents = computed(() =>
    this._events().filter(e => e.status === 'planejamento')
  );

  /**
   * Eventos ativos
   */
  public readonly activeEvents = computed(() =>
    this._events().filter(e => e.status === 'ativo')
  );

  /**
   * Eventos finalizados
   */
  public readonly finalizedEvents = computed(() =>
    this._events().filter(e => e.status === 'finalizado')
  );

  /**
   * Total de eventos
   */
  public readonly totalEvents = computed(() => this._events().length);

  /**
   * Verifica se há eventos cadastrados
   */
  public readonly hasEvents = computed(() => this._events().length > 0);

  /**
   * Verifica se há eventos ativos
   */
  public readonly hasActiveEvents = computed(() => this.activeEvents().length > 0);

  // ==================== MÉTODOS PÚBLICOS - CRUD ====================

  /**
   * Carrega todos os eventos do banco
   * @returns Promise<boolean> - true se sucesso, false se erro
   */
  public async loadEvents(): Promise<boolean> {
    this._isLoading.set(true);
    this._lastError.set(null);

    try {
      const rawEvents = this.dbService.getAllEvents();

      // Valida e filtra eventos
      const validEvents = rawEvents
        .filter(isValidEvent)
        .sort((a, b) => {
          // Ordena por data (mais recentes primeiro)
          return new Date(b.dataEvent).getTime() - new Date(a.dataEvent).getTime();
        });

      this._events.set(validEvents);
      console.log(`✅ ${validEvents.length} evento(s) carregado(s)`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao carregar eventos:', error);
      this._lastError.set('Não foi possível carregar os eventos');
      return false;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Cria um novo evento
   * @param eventData Dados do evento
   * @returns Promise<number | null> - ID do evento criado ou null se erro
   */
  public async createEvent(eventData: CreateEventDto): Promise<number | null> {
    this._lastError.set(null);

    // Validação
    const validation = validateCreateEvent(eventData);
    console.log('Debug - validação de criação de evento:', validation);
    if (!validation.isValid) {
      const errorMessage = validation.errors.join('; ');
      console.error('❌ Validação falhou:', errorMessage);
      this._lastError.set(errorMessage);
      return null;
    }

    try {
      const eventId = this.dbService.createEvent({
        nameEvent: eventData.nameEvent.trim(),
        localEvent: eventData.localEvent.trim(),
        dataEvent: eventData.dataEvent,
        contactEvent: eventData.contactEvent?.trim() || undefined,
        nameContactEvent: eventData.nameContactEvent?.trim() || undefined,
        status: eventData.status || 'planejamento'
      });

      console.log('Debug - ID do evento criado:', eventId);

      if (eventId) {
        await this.loadEvents();
        console.log('✅ Evento criado com sucesso:', eventId);
      }

      return eventId;
    } catch (error) {
      console.error('❌ Erro ao criar evento:', error);
      this._lastError.set('Não foi possível criar o evento');
      return null;
    }
  }

  /**
   * Atualiza um evento existente
   * @param eventData Dados do evento (id obrigatório)
   * @returns Promise<boolean> - true se sucesso, false se erro
   */
  public async updateEvent(eventData: UpdateEventDto): Promise<boolean> {
    this._lastError.set(null);

    // Validação
    const validation = validateUpdateEvent(eventData);
    if (!validation.isValid) {
      const errorMessage = validation.errors.join('; ');
      console.error('❌ Validação falhou:', errorMessage);
      this._lastError.set(errorMessage);
      return false;
    }

    try {
      // Prepara dados para atualização (remove undefined)
      const updateData: any = { ...eventData };
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const success = this.dbService.updateEvent(eventData.id, updateData);

      if (success) {
        await this.loadEvents();
        console.log('✅ Evento atualizado com sucesso:', eventData.id);
      }

      return success;
    } catch (error) {
      console.error('❌ Erro ao atualizar evento:', error);
      this._lastError.set('Não foi possível atualizar o evento');
      return false;
    }
  }

  /**
   * Deleta um evento
   * ATENÇÃO: Remove também estoque e preços vinculados ao evento
   * @param eventId ID do evento
   * @returns Promise<boolean> - true se sucesso, false se erro
   */
  public async deleteEvent(eventId: number): Promise<boolean> {
    this._lastError.set(null);

    try {
      // Verifica se há vendas vinculadas
      const hasSales = this.dbService.eventHasSales(eventId);
      if (hasSales) {
        this._lastError.set('Este evento possui vendas associadas e não pode ser deletado');
        return false;
      }

      const success = this.dbService.deleteEvent(eventId);

      if (success) {
        await this.loadEvents();

        // Limpa seleção se for o evento selecionado
        if (this._selectedEvent()?.id === eventId) {
          this._selectedEvent.set(null);
        }

        console.log('✅ Evento deletado com sucesso:', eventId);
      }

      return success;
    } catch (error) {
      console.error('❌ Erro ao deletar evento:', error);
      this._lastError.set('Não foi possível deletar o evento');
      return false;
    }
  }

  // ==================== MÉTODOS PÚBLICOS - SELEÇÃO ====================

  /**
   * Seleciona um evento
   * @param eventId ID do evento
   */
  public selectEvent(eventId: number): void {
    const event = this._events().find(e => e.id === eventId);
    if (event) {
      this._selectedEvent.set(event);
      console.log('✅ Evento selecionado:', event.nameEvent);
    }
  }

  /**
   * Limpa o evento selecionado
   */
  public clearSelection(): void {
    this._selectedEvent.set(null);
  }

  // ==================== MÉTODOS PÚBLICOS - BUSCA ====================

  /**
   * Busca evento por ID
   * @param eventId ID do evento
   * @returns Event ou null
   */
  public getEventById(eventId: number): Event | null {
    return this._events().find(e => e.id === eventId) || null;
  }

  /**
   * Busca eventos por status
   * @param status Status do evento
   * @returns Array de eventos
   */
  public getEventsByStatus(status: EventStatus): Event[] {
    return this._events().filter(e => e.status === status);
  }

  /**
   * Busca eventos por nome (busca parcial, case-insensitive)
   * @param searchTerm Termo de busca
   * @returns Array de eventos
   */
  public searchEventsByName(searchTerm: string): Event[] {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return this._events();

    return this._events().filter(e =>
      e.nameEvent.toLowerCase().includes(term) ||
      e.localEvent.toLowerCase().includes(term)
    );
  }

  // ==================== MÉTODOS PÚBLICOS - STATUS ====================

  /**
   * Muda o status de um evento
   * @param eventId ID do evento
   * @param newStatus Novo status
   * @returns Promise<boolean> - true se sucesso
   */
  public async changeEventStatus(eventId: number, newStatus: EventStatus): Promise<boolean> {
    this._lastError.set(null);

    try {
      const success = this.dbService.updateEventStatus(eventId, newStatus);

      if (success) {
        await this.loadEvents();
        console.log('✅ Status do evento alterado:', eventId, '→', newStatus);
      }

      return success;
    } catch (error) {
      console.error('❌ Erro ao mudar status do evento:', error);
      this._lastError.set('Não foi possível alterar o status do evento');
      return false;
    }
  }

  /**
   * Ativa um evento (muda status para 'ativo')
   * @param eventId ID do evento
   * @returns Promise<boolean> - true se sucesso
   */
  public async activateEvent(eventId: number): Promise<boolean> {
    return this.changeEventStatus(eventId, 'ativo');
  }

  /**
   * Finaliza um evento (muda status para 'finalizado')
   * @param eventId ID do evento
   * @returns Promise<boolean> - true se sucesso
   */
  public async finalizeEvent(eventId: number): Promise<boolean> {
    return this.changeEventStatus(eventId, 'finalizado');
  }

  // ==================== MÉTODOS PÚBLICOS - ESTATÍSTICAS ====================

  /**
   * Obtém estatísticas de um evento
   * @param eventId ID do evento
   * @returns Estatísticas do evento
   */
  public getEventStatistics(eventId: number): {
    totalSales: number;
    totalVolume: number;
    totalRevenue: number;
    salesByBeer: any[];
  } {
    try {
      return this.dbService.getEventStatistics(eventId);
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas do evento:', error);
      return {
        totalSales: 0,
        totalVolume: 0,
        totalRevenue: 0,
        salesByBeer: []
      };
    }
  }

  /**
   * Verifica se um evento tem vendas associadas
   * @param eventId ID do evento
   * @returns true se tem vendas
   */
  public eventHasSales(eventId: number): boolean {
    return this.dbService.eventHasSales(eventId);
  }

  /**
   * Obtém todas as vendas de um evento
   * @param eventId ID do evento
   * @returns Array de vendas
   */
  public getEventSales(eventId: number): any[] {
    return this.dbService.getSalesByEvent(eventId);
  }

  // ==================== MÉTODOS PÚBLICOS - VALIDAÇÃO ====================

  /**
   * Verifica se um nome de evento já existe
   * @param nameEvent Nome do evento
   * @param excludeId ID do evento a excluir da verificação (para edição)
   * @returns true se já existe
   */
  public eventNameExists(nameEvent: string, excludeId?: number): boolean {
    const normalizedName = nameEvent.toLowerCase().trim();
    return this._events().some(e =>
      e.nameEvent.toLowerCase().trim() === normalizedName &&
      e.id !== excludeId
    );
  }

  /**
   * Valida se é possível deletar um evento
   * @param eventId ID do evento
   * @returns { canDelete: boolean, reason?: string }
   */
  public canDeleteEvent(eventId: number): { canDelete: boolean; reason?: string } {
    const hasSales = this.dbService.eventHasSales(eventId);

    if (hasSales) {
      return {
        canDelete: false,
        reason: 'Este evento possui vendas associadas e não pode ser deletado'
      };
    }

    return { canDelete: true };
  }

  // ==================== MÉTODOS PÚBLICOS - UTILIDADES ====================

  /**
   * Limpa o último erro
   */
  public clearError(): void {
    this._lastError.set(null);
  }

  /**
   * Força recarregamento dos eventos
   */
  public async refresh(): Promise<void> {
    await this.loadEvents();
  }

  /**
   * Obtém resumo geral de todos os eventos
   */
  public getEventsSummary(): {
    total: number;
    planning: number;
    active: number;
    finalized: number;
  } {
    return {
      total: this.totalEvents(),
      planning: this.planningEvents().length,
      active: this.activeEvents().length,
      finalized: this.finalizedEvents().length
    };
  }
}
