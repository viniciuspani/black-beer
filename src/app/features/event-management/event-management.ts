// ========================================
// src/app/features/event-management/event-management.ts
// ========================================

import { Component, OnInit, inject, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputMaskModule } from 'primeng/inputmask';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmationService, MessageService } from 'primeng/api';

// App Services and Models
import { EventService } from '../../core/services/event.service';
import {
  Event,
  EventStatus,
  CreateEventDto,
  formatEventDate,
  getEventStatusLabel,
  getEventStatusSeverity
} from '../../core/models/event.model';

/**
 * Componente para gerenciar eventos de venda
 *
 * Funcionalidades:
 * - Listar todos os eventos
 * - Criar novos eventos
 * - Editar eventos existentes
 * - Deletar eventos
 * - Alterar status (planejamento → ativo → finalizado)
 * - Visualizar estatísticas
 *
 * @version 1.0.0
 */
@Component({
  selector: 'app-event-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    InputMaskModule,
    TableModule,
    TagModule,
    TooltipModule,
    ConfirmDialogModule,
    ToastModule,
    DialogModule,
    DatePickerModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './event-management.html',
  styleUrls: ['./event-management.scss']
})
export class EventManagementComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly eventService = inject(EventService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  events: WritableSignal<Event[]> = signal([]);
  isAdding = signal(false);
  isEditing = signal(false);
  isViewingStats = signal(false);
  currentEditingEvent: Event | null = null;
  currentStatsEvent: Event | null = null;
  eventStats: any = null;

  // ==================== FORMULÁRIOS ====================
  eventForm: FormGroup;
  editForm: FormGroup;

  // ==================== FILTROS E EXIBIÇÃO ====================
  statusFilter = signal<EventStatus | 'all'>('all');

  constructor() {
    // Formulário de criação
    this.eventForm = this.fb.group({
      nameEvent: ['', [Validators.required, Validators.maxLength(100)]],
      localEvent: ['', [Validators.required, Validators.maxLength(200)]],
      dataEvent: [new Date(), [Validators.required]],
      contactEvent: ['', [Validators.maxLength(50)]],
      nameContactEvent: ['', [Validators.maxLength(100)]],
      status: ['planejamento' as EventStatus, [Validators.required]]
    });

    // Formulário de edição
    this.editForm = this.fb.group({
      nameEvent: ['', [Validators.required, Validators.maxLength(100)]],
      localEvent: ['', [Validators.required, Validators.maxLength(200)]],
      dataEvent: [new Date(), [Validators.required]],
      contactEvent: ['', [Validators.maxLength(50)]],
      nameContactEvent: ['', [Validators.maxLength(100)]],
      status: ['planejamento' as EventStatus, [Validators.required]]
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadEvents();
  }

  // ==================== CARREGAMENTO DE DADOS ====================

  /**
   * Carrega eventos do service
   */
  async loadEvents(): Promise<void> {
    await this.eventService.loadEvents();
    this.events.set(this.getFilteredEvents());
  }

  /**
   * Retorna eventos filtrados por status
   */
  getFilteredEvents(): Event[] {
    const filter = this.statusFilter();
    const allEvents = this.eventService.events();

    if (filter === 'all') {
      return allEvents;
    }

    return allEvents.filter(e => e.status === filter);
  }

  /**
   * Aplica filtro de status
   */
  applyStatusFilter(status: EventStatus | 'all'): void {
    this.statusFilter.set(status);
    this.events.set(this.getFilteredEvents());
  }

  // ==================== CRIAÇÃO DE EVENTO ====================

  /**
   * Toggle do formulário de adição
   */
  toggleAddForm(): void {
    this.isAdding.update(v => !v);
    if (!this.isAdding()) {
      this.eventForm.reset({
        status: 'planejamento',
        dataEvent: new Date()
      });
    }
  }

  /**
   * Adiciona novo evento
   */
  async addEvent(): Promise<void> {
    if (this.eventForm.invalid) {
      this.showWarning('Preencha todos os campos obrigatórios.');
      return;
    }

    const formValue = this.eventForm.value;

    // Verifica duplicidade de nome
    if (this.eventService.eventNameExists(formValue.nameEvent)) {
      this.showWarning(`Já existe um evento com o nome "${formValue.nameEvent}".`);
      return;
    }

    try {
      const eventData: CreateEventDto = {
        nameEvent: formValue.nameEvent.trim(),
        localEvent: formValue.localEvent.trim(),
        dataEvent: this.formatDateToISO(formValue.dataEvent),
        contactEvent: formValue.contactEvent?.trim() || undefined,
        nameContactEvent: formValue.nameContactEvent?.trim() || undefined,
        status: formValue.status
      };

      const eventId = await this.eventService.createEvent(eventData);
      console.log('✅ Evento criado com ID:', eventId);

      if (eventId) {
        this.showSuccess(`Evento "${eventData.nameEvent}" criado com sucesso!`);
        await this.loadEvents();
        this.toggleAddForm();
      } else {
        const error = this.eventService.lastError();
        this.showError(error || 'Não foi possível criar o evento.');
      }
    } catch (error) {
      console.error('❌ Erro ao adicionar evento:', error);
      this.showError('Erro ao criar evento.');
    }
  }

  // ==================== EDIÇÃO DE EVENTO ====================

  /**
   * Abre dialog de edição
   */
  openEditDialog(event: Event): void {
    this.currentEditingEvent = event;
    this.isEditing.set(true);

    // Preenche formulário com dados do evento
    this.editForm.patchValue({
      nameEvent: event.nameEvent,
      localEvent: event.localEvent,
      dataEvent: new Date(event.dataEvent),
      contactEvent: event.contactEvent || '',
      nameContactEvent: event.nameContactEvent || '',
      status: event.status
    });
  }

  /**
   * Fecha dialog de edição
   */
  closeEditDialog(): void {
    this.isEditing.set(false);
    this.currentEditingEvent = null;
    this.editForm.reset();
  }

  /**
   * Salva edição do evento
   */
  async saveEdit(): Promise<void> {
    if (!this.currentEditingEvent || this.editForm.invalid) {
      this.showWarning('Preencha todos os campos obrigatórios.');
      return;
    }

    const formValue = this.editForm.value;

    // Verifica duplicidade de nome (excluindo o evento atual)
    if (
      formValue.nameEvent !== this.currentEditingEvent.nameEvent &&
      this.eventService.eventNameExists(formValue.nameEvent, this.currentEditingEvent.id)
    ) {
      this.showWarning(`Já existe um evento com o nome "${formValue.nameEvent}".`);
      return;
    }

    try {
      const success = await this.eventService.updateEvent({
        id: this.currentEditingEvent.id,
        nameEvent: formValue.nameEvent.trim(),
        localEvent: formValue.localEvent.trim(),
        dataEvent: this.formatDateToISO(formValue.dataEvent),
        contactEvent: formValue.contactEvent?.trim() || undefined,
        nameContactEvent: formValue.nameContactEvent?.trim() || undefined,
        status: formValue.status
      });

      if (success) {
        this.showSuccess(`Evento "${formValue.nameEvent}" atualizado com sucesso!`);
        await this.loadEvents();
        this.closeEditDialog();
      } else {
        const error = this.eventService.lastError();
        this.showError(error || 'Não foi possível atualizar o evento.');
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar evento:', error);
      this.showError('Erro ao atualizar evento.');
    }
  }

  // ==================== EXCLUSÃO DE EVENTO ====================

  /**
   * Confirma exclusão de evento
   */
  confirmDelete(event: Event): void {
    const validation = this.eventService.canDeleteEvent(event.id);

    if (!validation.canDelete) {
      this.showWarning(validation.reason || 'Não é possível deletar este evento.');
      return;
    }

    this.confirmationService.confirm({
      message: `Você tem certeza que deseja remover o evento "${event.nameEvent}"? As configurações de estoque e preços vinculadas também serão removidas.`,
      header: 'Confirmação de Exclusão',
      icon: 'pi pi-info-circle',
      acceptLabel: 'Sim, remover',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deleteEvent(event);
      }
    });
  }

  /**
   * Deleta evento
   */
  async deleteEvent(event: Event): Promise<void> {
    try {
      const success = await this.eventService.deleteEvent(event.id);

      if (success) {
        this.showSuccess(`Evento "${event.nameEvent}" removido com sucesso.`);
        await this.loadEvents();
      } else {
        const error = this.eventService.lastError();
        this.showError(error || 'Não foi possível deletar o evento.');
      }
    } catch (error) {
      console.error('❌ Erro ao deletar evento:', error);
      this.showError('Erro ao deletar evento.');
    }
  }

  // ==================== MUDANÇA DE STATUS ====================

  /**
   * Muda status do evento
   */
  async changeEventStatus(event: Event, newStatus: EventStatus): Promise<void> {
    try {
      const success = await this.eventService.changeEventStatus(event.id, newStatus);

      if (success) {
        this.showSuccess(`Status do evento alterado para "${getEventStatusLabel(newStatus)}"`);
        await this.loadEvents();
      } else {
        const error = this.eventService.lastError();
        this.showError(error || 'Não foi possível alterar o status.');
      }
    } catch (error) {
      console.error('❌ Erro ao mudar status:', error);
      this.showError('Erro ao alterar status.');
    }
  }

  // ==================== ESTATÍSTICAS ====================

  /**
   * Abre modal de estatísticas
   */
  openStatsDialog(event: Event): void {
    this.currentStatsEvent = event;
    this.eventStats = this.eventService.getEventStatistics(event.id);
    this.isViewingStats.set(true);
  }

  /**
   * Fecha modal de estatísticas
   */
  closeStatsDialog(): void {
    this.isViewingStats.set(false);
    this.currentStatsEvent = null;
    this.eventStats = null;
  }

  // ==================== HELPERS ====================

  /**
   * Formata Date para ISO string
   * Suporta tanto objetos Date quanto strings de data do PrimeNG DatePicker
   */
  private formatDateToISO(date: Date | string): string {
    if (!date) {
      return new Date().toISOString();
    }

    // Se já é uma string, tenta criar um Date
    if (typeof date === 'string') {
      return new Date(date).toISOString();
    }

    // Se é um objeto Date válido
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toISOString();
    }

    // Fallback: retorna data atual
    console.warn('⚠️ Data inválida recebida:', date);
    return new Date().toISOString();
  }

  /**
   * Obtém label do status
   */
  getStatusLabel(status: EventStatus): string {
    return getEventStatusLabel(status);
  }

  /**
   * Obtém severity do PrimeNG para o status
   */
  getStatusSeverity(status: EventStatus): 'info' | 'success' | 'secondary' {
    return getEventStatusSeverity(status);
  }

  /**
   * Formata data para exibição
   */
  formatDate(dateString: string): string {
    return formatEventDate(dateString);
  }

  /**
   * Retorna total de eventos
   */
  getTotalEvents(): number {
    return this.events().length;
  }

  /**
   * Retorna label formatada para exibição do filtro atual
   */
  getFilterLabel(): string {
    const filter = this.statusFilter();
    if (filter === 'all') {
      return 'Total de Eventos';
    }
    return `Eventos ${getEventStatusLabel(filter)}`;
  }

  /**
   * Verifica se evento tem vendas
   */
  eventHasSales(eventId: number): boolean {
    return this.eventService.eventHasSales(eventId);
  }

  // ==================== MENSAGENS ====================

  private showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Sucesso',
      detail: message,
      life: 3000
    });
  }

  private showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erro',
      detail: message,
      life: 5000
    });
  }

  private showWarning(message: string): void {
    this.messageService.add({
      severity: 'warn',
      summary: 'Atenção',
      detail: message,
      life: 4000
    });
  }
}
