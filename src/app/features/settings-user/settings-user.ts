import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject } from 'rxjs';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
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

@Component({
  selector: 'app-settings-user',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    ToastModule,
    TagModule
  ],
  providers: [MessageService],
  templateUrl: './settings-user.html',
  styleUrls: ['./settings-user.scss']
})
export class SettingsUserComponent implements OnInit, OnDestroy {
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
   * Armazena array de emails configurados
   */
  readonly configuredEmails = signal<string[]>([]);

  /**
   * Armazena o ID da configuração
   */
  readonly currentSettingsId = signal<number | null>(null);

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
        this.loadSettings();
      }
    }, { allowSignalWrites: true });
  }

  // ==================== LIFECYCLE HOOKS ====================

  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadSettings();
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

  // ==================== CARREGAR CONFIGURAÇÕES ====================

  /**
   * Carrega as configurações do banco de dados
   */
  loadSettings(): void {
    try {
      const result = this.dbService.executeQuery(
        'SELECT id, email, isConfigured FROM settings LIMIT 1'
      );

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

        // Campo fica VAZIO ao carregar
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
   */
  saveSettings(): void {
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
        this.updateExistingSettings(settingsId, emailString);
      } else {
        // INSERT
        this.insertNewSettings(emailString);
      }

      // Atualiza estado
      this.configuredEmails.set(validation.validEmails);

      // Limpa o campo após salvar
      this.settingsForm.patchValue({ emailsInput: '' });

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
  private updateExistingSettings(id: number, emailString: string): void {
    this.dbService.executeRun(
      'UPDATE settings SET email = ?, isConfigured = ? WHERE id = ?',
      [emailString, toDbFromBoolean(true), id]
    );
    console.log('✅ Settings atualizadas (ID:', id, ')');
  }

  /**
   * Insere nova configuração
   */
  private insertNewSettings(emailString: string): void {
    this.dbService.executeRun(
      'INSERT INTO settings (email, isConfigured) VALUES (?, ?)',
      [emailString, toDbFromBoolean(true)]
    );

    const insertedId = this.dbService.getLastInsertId();
    this.currentSettingsId.set(insertedId);

    console.log('✅ Settings criadas (ID:', insertedId, ')');
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

  // ==================== UTILIDADES ====================

  /**
   * Retorna string formatada dos emails configurados
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
   * Copia email para o campo de input (para editar)
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
   * Conta quantos emails foram detectados no input
   */
  getDetectedEmailsCount(): number {
    const input = this.settingsForm.get('emailsInput')?.value;
    if (!input || typeof input !== 'string') {
      return 0;
    }
    return input.split(/[,;]/).filter((e: string) => e.trim()).length;
  }
}
