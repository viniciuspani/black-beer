// src/app/features/reports-section/reports-section.component.ts
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG 20+ - DatePicker substitui Calendar
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';  // ← NOVO: Import do Tooltip
import { MessageService } from 'primeng/api';

// App
import { 
  FullReport, 
  DateRange, 
  PresetPeriod, 
  createPresetDateRange, 
  EMPTY_DATE_RANGE 
} from '../../core/models/report.model';
import { DatabaseService } from '../../core/services/database';
import { EmailService } from '../../core/services/email';

@Component({
  selector: 'app-reports-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    // PrimeNG Modules
    CardModule,
    ButtonModule,
    DatePickerModule,
    TagModule,
    ToastModule,
    TooltipModule  // ← NOVO: Adicionado TooltipModule
  ],
  providers: [MessageService],
  templateUrl: './reports-section.html',
  styleUrls: ['./reports-section.scss']
})
export class ReportsSectionComponent {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly emailService = inject(EmailService);
  private readonly messageService = inject(MessageService);

  // ==================== SIGNALS ====================
  readonly startDate = signal<Date | null>(null);
  readonly endDate = signal<Date | null>(null);
  
  /**
   * NOVO: Controla estado de loading durante envio de email
   */
  readonly isSendingEmail = signal<boolean>(false);
  
  /**
   * Computed que retorna a descrição do período do relatório
   */
  readonly periodDescription = computed<string>(() => {
    const start = this.startDate();
    const end = this.endDate();

    if (!start && !end) {
      return 'Carregado todas informações do banco de dados';
    }

    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };

    if (start && !end) {
      return `Período: A partir de ${formatDate(start)}`;
    }

    if (!start && end) {
      return `Período: Até ${formatDate(end)}`;
    }

    if (start && end) {
      return `Período: ${formatDate(start)} até ${formatDate(end)}`;
    }

    return 'Carregado todas informações do banco de dados';
  });

  readonly dateRange = computed<DateRange>(() => ({
    startDate: this.startDate(),
    endDate: this.endDate()
  }));

  readonly report = computed<FullReport | null>(() => {
    if (!this.dbService.isDbReady()) {
      return null;
    }

    const range = this.dateRange();
    return this.dbService.getFullReport(
      range.startDate ?? undefined,
      range.endDate ?? undefined
    );
  });

  readonly PresetPeriod = PresetPeriod;

  private readonly shouldShowReport = signal<boolean>(true);

  readonly displayReport = computed<FullReport | null>(() => {
    if (!this.shouldShowReport()) {
      return null;
    }
    return this.report();
  });

  // ==================== COMPUTED SIGNALS PARA EMAIL ====================
  
  /**
   * Verifica se há emails configurados
   * Depende de dbReady para recalcular quando banco carregar
   */
  readonly hasConfiguredEmails = computed(() => {
    const dbReady = this.dbService.isDbReady();
    
    if (!dbReady) {
      return false;
    }
    
    return this.emailService.hasConfiguredEmails();
  });

  /**
   * Mensagem de status dos emails
   */
  readonly emailsStatusMessage = computed(() => {
    const dbReady = this.dbService.isDbReady();
    
    if (!dbReady) {
      return 'Carregando...';
    }
    
    return this.emailService.getEmailsStatusMessage();
  });

  /**
   * Verifica se pode enviar o relatório
   * Requer: emails configurados + relatório válido + não estar enviando
   */
  readonly canSendReport = computed(() => {
    const dbReady = this.dbService.isDbReady();
    
    if (!dbReady) {
      return false;
    }
    
    const hasEmails = this.hasConfiguredEmails();
    const report = this.displayReport();
    const isValid = this.emailService.isReportValid(report);
    const isSending = this.isSendingEmail();
    
    return hasEmails && isValid && !isSending;
  });

  // ==================== MÉTODOS EXISTENTES ====================

  setPresetRange(days: number): void {
    const range = createPresetDateRange(days);
    this.startDate.set(range.startDate);
    this.endDate.set(range.endDate);
  }

  clearFilters(): void {
    this.shouldShowReport.set(false);
    this.startDate.set(EMPTY_DATE_RANGE.startDate);
    this.endDate.set(EMPTY_DATE_RANGE.endDate);
    
    setTimeout(() => {
      this.shouldShowReport.set(true);
    }, 300);
  }

  onStartDateSelect(date: Date): void {
    this.startDate.set(date);
  }

  onEndDateSelect(date: Date): void {
    this.endDate.set(date);
  }

  // ==================== NOVOS MÉTODOS PARA EMAIL ====================

  /**
   * Envia o relatório por email
   * Gera CSV e baixa localmente, mostra emails configurados
   */
  async sendReportByEmail(): Promise<void> {
    if (!this.canSendReport()) {
      this.showWarning('Não é possível enviar o relatório no momento.');
      return;
    }

    const report = this.displayReport();
    if (!report) {
      this.showError('Nenhum relatório disponível para envio.');
      return;
    }

    this.isSendingEmail.set(true);

    try {
      const result = await this.emailService.sendReport(
        report,
        this.periodDescription()
      );

      if (result.success) {
        this.showSuccess(result.message);
      } else {
        this.showError(result.message);
      }

    } catch (error) {
      console.error('❌ Erro ao enviar relatório:', error);
      this.showError('Erro inesperado ao gerar relatório. Tente novamente.');
    } finally {
      this.isSendingEmail.set(false);
    }
  }

  /**
   * NOVO: Retorna o tooltip do botão de envio
   */
  getSendButtonTooltip(): string {
    if (this.isSendingEmail()) {
      return 'Gerando relatório...';
    }

    if (!this.hasConfiguredEmails()) {
      return 'Configure emails nas configurações para enviar relatórios';
    }

    const report = this.displayReport();
    if (!this.emailService.isReportValid(report)) {
      return 'Nenhuma venda registrada no período selecionado';
    }

    const emailsList = this.emailService.getFormattedEmailsList(2);
    return `Enviar relatório para: ${emailsList}`;
  }

  // ==================== MÉTODOS DE MENSAGENS ====================

  private showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Relatório Gerado!',
      detail: message,
      life: 6000 // 6 segundos para ler a lista de emails
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

  private showInfo(message: string): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Informação',
      detail: message,
      life: 4000
    });
  }
}