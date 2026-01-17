import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { TextareaModule } from 'primeng/textarea';



// App
import { 
  AppSettings, 
  toBooleanFromDb, 
  toDbFromBoolean,
  emailsFromDb,
  emailsToDb,
  parseEmailInput,
  validateEmails
} from '../../core/models/beer.model';
import { DatabaseService, EMAIL_CONFIG } from '../../core/services/database';

/**
 * Interface para as estatísticas do banco de dados
 */
interface DatabaseStats {
  totalSales: number;
  totalBeerTypes: number;
  hasSettings: boolean;
  dbVersion: number;
}

@Component({
  selector: 'app-settings-section',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,    
    TextareaModule,  // ← NOVO: Para textarea multi-linha
    ToastModule,
    TagModule,
    DialogModule,
    DividerModule
  ],
  providers: [MessageService],
  templateUrl: './settings-section.html',
  styleUrls: ['./settings-section.scss']
})
export class SettingsSectionComponent implements OnInit, OnDestroy {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  
  private readonly destroy$ = new Subject<void>();

  // ==================== CONSTANTES ====================
  readonly MIN_EMAILS = EMAIL_CONFIG.MIN_EMAILS;
  readonly MAX_EMAILS = EMAIL_CONFIG.MAX_EMAILS;

  // ==================== FORMULÁRIO REATIVO ====================
  readonly settingsForm: FormGroup;
  
  // ==================== SIGNALS ====================
  
  /**
   * MUDANÇA: Armazena array de emails configurados
   */
  readonly configuredEmails = signal<string[]>([]);
  
  /**
   * Armazena o ID da configuração
   */
  readonly currentSettingsId = signal<number | null>(null);
  
  /**
   * Indica se o processo de limpeza está em andamento
   */
  readonly isClearing = signal<boolean>(false);
  
  /**
   * Controla a visibilidade do dialog de confirmação
   */
  readonly showClearDialog = signal<boolean>(false);
  
  /**
   * Armazena as estatísticas do banco de dados
   */
  private readonly dbStatsSignal = signal<DatabaseStats>({
    totalSales: 0,
    totalBeerTypes: 0,
    hasSettings: false,
    dbVersion: 0
  });

  // ==================== COMPUTED SIGNALS ====================
  
  /**
   * Calcula se há emails configurados
   */
  readonly hasConfiguredEmails = computed(() => {
    return this.configuredEmails().length > 0;
  });

  /**
   * Conta quantos emails estão configurados
   */
  readonly configuredEmailsCount = computed(() => {
    return this.configuredEmails().length;
  });

  /**
   * Verifica se a configuração está válida
   */
  readonly isEmailConfigured = computed(() => {
    return this.configuredEmails().length > 0;
  });

  /**
   * Retorna as estatísticas do banco de dados
   */
  readonly dbStats = computed(() => {
    return this.dbStatsSignal();
  });

  /**
   * Retorna status do banco
   */
  readonly dbReady = computed(() => this.dbService.isDbReady());

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Inicializa o formulário com validação customizada
    this.settingsForm = this.fb.group({
      emailsInput: ['', [Validators.required, this.multiEmailValidator.bind(this)]]
    });

    // Effect para carregar configurações quando o banco estiver pronto
    effect(() => {
      if (this.dbService.isDbReady()) {
        // Chama métodos de forma assíncrona (sem bloquear o effect)
        void this.loadSettings();
        void this.updateDatabaseStats();
      }
    }, { allowSignalWrites: true });
  }

  // ==================== LIFECYCLE HOOKS ====================
  
  async ngOnInit(): Promise<void> {
    if (this.dbService.isDbReady()) {
      await this.loadSettings();
      await this.updateDatabaseStats();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== VALIDADOR CUSTOMIZADO ====================
  
  /**
   * Validador customizado para múltiplos emails
   */
  private multiEmailValidator(control: AbstractControl): ValidationErrors | null {
    const input = control.value;
    
    if (!input || input.trim() === '') {
      return { required: true };
    }
    
    // Parse do input
    const emails = parseEmailInput(input);
    
    // Valida
    const validation = validateEmails(emails);
    
    if (!validation.isValid) {
      return { 
        multiEmail: {
          errors: validation.errors,
          invalidEmails: validation.invalidEmails
        }
      };
    }
    
    return null;
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
   * Atualiza as estatísticas do banco de dados
   */
  private async updateDatabaseStats(): Promise<void> {
    try {
      const stats = await this.dbService.getDatabaseStats();
      // Converte para o formato esperado pela interface local
      this.dbStatsSignal.set({
        totalSales: stats.sales,
        totalBeerTypes: stats.beerTypes,
        hasSettings: stats.totalRecords > 0,
        dbVersion: 2 // Versão do schema Dexie
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar estatísticas:', error);
      this.dbStatsSignal.set({
        totalSales: 0,
        totalBeerTypes: 0,
        hasSettings: false,
        dbVersion: 0
      });
    }
  }

  // ==================== CARREGAR CONFIGURAÇÕES ====================

  /**
   * Carrega as configurações do banco de dados
   * MUDANÇA: Converte string do banco para array de emails
   */
  async loadSettings(): Promise<void> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) {
        console.warn('⚠️ Database não disponível');
        this.resetSettingsState();
        return;
      }

      // Pegar o primeiro registro da tabela settings
      const result = await db.settings.limit(1).toArray();

      if (result && result.length > 0) {
        const row = result[0];

        // Converte string do banco para array
        const emails = emailsFromDb(row.email);

        const settings: AppSettings = {
          id: Number(row.id),
          emails: emails,
          isConfigured: toBooleanFromDb(row.isConfigured)
        };

        console.log('✅ Settings carregadas:', settings);

        // Atualiza signals
        this.currentSettingsId.set(settings.id || null);
        this.configuredEmails.set(settings.emails);

        // IMPORTANTE: Campo fica VAZIO ao carregar
        this.settingsForm.patchValue({
          emailsInput: ''
        }, { emitEvent: false });

      } else {
        console.log('ℹ️ Nenhuma configuração salva');
        this.resetSettingsState();
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configurações:', error);
      this.showErrorMessage('Não foi possível carregar as configurações.');
      this.resetSettingsState();
    }
  }

  /**
   * Reseta o estado das configurações
   */
  private resetSettingsState(): void {
    this.settingsForm.patchValue({ emailsInput: '' }, { emitEvent: false });
    this.configuredEmails.set([]);
    this.currentSettingsId.set(null);
  }

  // ==================== SALVAR CONFIGURAÇÕES ====================

  /**
   * Salva as configurações no banco de dados
   * MUDANÇA: Converte array de emails para string com ;
   */
  async saveSettings(): Promise<void> {
    this.settingsForm.markAllAsTouched();

    if (this.settingsForm.invalid) {
      this.showValidationErrors();
      return;
    }

    const input = this.settingsForm.value.emailsInput?.trim();

    if (!input) {
      this.showErrorMessage('Digite pelo menos um email.');
      return;
    }

    // Parse e validação
    const emails = parseEmailInput(input);
    const validation = validateEmails(emails);

    if (!validation.isValid) {
      this.showErrorMessage(validation.errors.join('. '));
      return;
    }

    try {
      const settingsId = this.currentSettingsId();

      // Converte array para string com ;
      const emailString = emailsToDb(validation.validEmails);

      if (settingsId !== null) {
        // UPDATE
        await this.updateExistingSettings(settingsId, emailString);
      } else {
        // INSERT
        await this.insertNewSettings(emailString);
      }

      // Atualiza estado
      this.configuredEmails.set(validation.validEmails);

      // Limpa o campo após salvar
      this.settingsForm.patchValue({ emailsInput: '' });

      await this.updateDatabaseStats();

      const count = validation.validEmails.length;
      const message = count === 1
        ? '1 email configurado com sucesso!'
        : `${count} emails configurados com sucesso!`;

      this.showSuccessMessage(message);

    } catch (error) {
      console.error('❌ Erro ao salvar configurações:', error);
      this.showErrorMessage('Não foi possível salvar as configurações.');
    }
  }

  /**
   * Mostra erros de validação do formulário
   */
  private showValidationErrors(): void {
    const control = this.settingsForm.get('emailsInput');
    
    if (!control) return;
    
    if (control.hasError('required')) {
      this.showErrorMessage('Digite pelo menos um email.');
      return;
    }
    
    if (control.hasError('multiEmail')) {
      const errors = control.errors?.['multiEmail']?.errors || [];
      this.showErrorMessage(errors.join('. '));
      return;
    }
    
    this.showErrorMessage('Por favor, corrija os erros antes de salvar.');
  }

  /**
   * Atualiza configuração existente
   */
  private async updateExistingSettings(id: number, emailString: string): Promise<void> {
    const db = this.dbService.getDatabase();
    if (!db) {
      throw new Error('Database não disponível');
    }

    await db.settings.update(id, {
      email: emailString,
      isConfigured: true
    });

    console.log('✅ Settings atualizadas (ID:', id, ')');
  }

  /**
   * Insere nova configuração
   */
  private async insertNewSettings(emailString: string): Promise<void> {
    const db = this.dbService.getDatabase();
    if (!db) {
      throw new Error('Database não disponível');
    }

    const insertedId = await db.settings.add({
      email: emailString,
      isConfigured: true
    });

    this.currentSettingsId.set(insertedId);

    console.log('✅ Settings criadas (ID:', insertedId, ')');
  }

  // ==================== LIMPAR BANCO ====================

  async openClearDialog(): Promise<void> {
    await this.updateDatabaseStats();
    this.showClearDialog.set(true);
  }

  closeClearDialog(): void {
    this.showClearDialog.set(false);
    if (this.isClearing()) {
      this.isClearing.set(false);
    }
  }

  async clearDatabase(): Promise<void> {
    this.isClearing.set(true);

    try {
      await this.dbService.clearDatabase();
      this.resetSettingsState();
      await this.updateDatabaseStats();
      
      this.showSuccessMessage(
        '✅ Banco de dados limpo com sucesso! Todos os dados foram removidos e o sistema foi reiniciado ao estado inicial.'
      );
      
      this.showClearDialog.set(false);
      
    } catch (error) {
      console.error('❌ Erro ao limpar banco de dados:', error);
      this.showErrorMessage(
        '❌ Não foi possível limpar o banco de dados. Por favor, tente novamente ou recarregue a página.'
      );
    } finally {
      this.isClearing.set(false);
    }
  }

  // ==================== VALIDAÇÃO ====================

  hasFieldError(fieldName: string): boolean {
    const field = this.settingsForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.settingsForm.get(fieldName);
    
    if (!field) {
      return '';
    }
    
    if (field.hasError('required')) {
      return 'Digite pelo menos um email';
    }
    
    if (field.hasError('multiEmail')) {
      const errors = field.errors?.['multiEmail']?.errors || [];
      return errors[0] || 'Erro de validação';
    }
    
    return 'Erro de validação';
  }

  // ==================== MENSAGENS ====================

  private showSuccessMessage(detail: string, summary: string = 'Sucesso'): void {
    this.messageService.add({ 
      severity: 'success', 
      summary, 
      detail,
      life: 4000
    });
  }

  private showErrorMessage(detail: string, summary: string = 'Erro'): void {
    this.messageService.add({ 
      severity: 'error', 
      summary, 
      detail,
      life: 5000
    });
  }

  private showInfoMessage(detail: string, summary: string = 'Informação'): void {
    this.messageService.add({ 
      severity: 'info', 
      summary, 
      detail,
      life: 3000
    });
  }

  private showWarningMessage(detail: string, summary: string = 'Atenção'): void {
    this.messageService.add({ 
      severity: 'warn', 
      summary, 
      detail,
      life: 4000
    });
  }

  // ==================== UTILIDADES ====================

  formatNumber(value: number): string {
    return value.toLocaleString('pt-BR');
  }

  getDatabaseStatus(): string {
    if (!this.dbReady()) {
      return 'Inicializando...';
    }
    
    const stats = this.dbStats();
    if (stats.totalSales === 0) {
      return 'Vazio';
    }
    
    return 'Operacional';
  }

  hasDataToClear(): boolean {
    const stats = this.dbStats();
    return stats.totalSales > 0 || stats.hasSettings;
  }

  getDatabaseVersion(): number {
    return this.dbStats().dbVersion;
  }

  /**
   * NOVO: Retorna string formatada dos emails configurados
   */
  getConfiguredEmailsDisplay(): string {
    const emails = this.configuredEmails();
    if (emails.length === 0) {
      return 'Nenhum email configurado';
    }
    if (emails.length === 1) {
      return emails[0];
    }
    return `${emails.length} emails configurados`;
  }

  /**
   * NOVO: Copia email para o campo de input (para editar)
   */
  editEmails(): void {
    const emails = this.configuredEmails();
    if (emails.length > 0) {
      this.settingsForm.patchValue({
        emailsInput: emails.join(', ')
      });
      this.showInfoMessage('Emails carregados para edição');
    }
  }

  /**
 * NOVO: Conta quantos emails foram detectados no input
 * (Helper para o template - evita expressões complexas)
 */
getDetectedEmailsCount(): number {
  const input = this.settingsForm.get('emailsInput')?.value;
  if (!input || typeof input !== 'string') {
    return 0;
  }
  return input.split(/[,;]/).filter((e: string) => e.trim()).length;
}
}