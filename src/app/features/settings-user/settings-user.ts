import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject } from 'rxjs';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

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
import { ClientConfigService } from '../../core/services/client-config.service';

@Component({
  selector: 'app-settings-user',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    ToastModule,
    TagModule,
    TooltipModule
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
  private readonly clientConfigService = inject(ClientConfigService);

  private readonly destroy$ = new Subject<void>();

  // ==================== CONSTANTES ====================
  readonly MIN_EMAILS = EMAIL_CONFIG.MIN_EMAILS;
  readonly MAX_EMAILS = EMAIL_CONFIG.MAX_EMAILS;

  // ==================== LOGO UPLOAD SIGNALS ====================
  readonly selectedFile = signal<File | null>(null);
  readonly selectedFileName = signal<string>('');
  readonly isUploading = signal<boolean>(false);
  readonly isDragging = signal<boolean>(false);
  companyNameInput = '';

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
        void this.loadSettings();
      }
    }, { allowSignalWrites: true });
  }

  // ==================== LIFECYCLE HOOKS ====================

  async ngOnInit(): Promise<void> {
    if (this.dbService.isDbReady()) {
      await this.loadSettings();
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
  async loadSettings(): Promise<void> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) {
        console.warn('⚠️ Database não disponível');
        this.resetSettingsState();
        return;
      }

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

  // ==================== LOGO UPLOAD METHODS ====================

  /**
   * Verifica se tem logo configurada
   */
  hasLogo(): boolean {
    return this.clientConfigService.hasLogo();
  }

  /**
   * Obtém a URL da logo
   */
  getLogoUrl(): string | null {
    return this.clientConfigService.getLogoUrl();
  }

  /**
   * Obtém o nome da empresa
   */
  getCompanyName(): string | null {
    return this.clientConfigService.getCompanyName();
  }

  /**
   * Evento de seleção de arquivo
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.handleFileSelection(file);
    }
  }

  /**
   * Handler para drag over
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  /**
   * Handler para drag leave
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  /**
   * Handler para drop
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFileSelection(files[0]);
    }
  }

  /**
   * Processa o arquivo selecionado
   */
  private handleFileSelection(file: File): void {
    // Validação de tipo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      this.showErrorMessage('Formato inválido. Use JPEG, PNG ou SVG.');
      return;
    }

    // Validação de tamanho (2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      this.showErrorMessage('Arquivo muito grande. Máximo: 2MB.');
      return;
    }

    this.selectedFile.set(file);
    this.selectedFileName.set(file.name);
    this.showInfoMessage(`Arquivo "${file.name}" selecionado.`);
  }

  /**
   * Limpa o arquivo selecionado
   */
  clearSelectedFile(): void {
    this.selectedFile.set(null);
    this.selectedFileName.set('');
  }

  /**
   * Faz upload da logo
   */
  async uploadLogo(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      this.showErrorMessage('Selecione uma imagem primeiro.');
      return;
    }

    this.isUploading.set(true);

    try {
      await this.clientConfigService.uploadLogo(
        file,
        this.companyNameInput || undefined
      );

      this.showSuccessMessage('Logo salva com sucesso!');
      this.clearSelectedFile();
      this.companyNameInput = '';
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      this.showErrorMessage(error.message || 'Erro ao salvar logo.');
    } finally {
      this.isUploading.set(false);
    }
  }

  /**
   * Remove a logo
   */
  removeLogo(): void {
    try {
      this.clientConfigService.removeLogo();
      this.showSuccessMessage('Logo removida com sucesso!');
    } catch (error) {
      console.error('Erro ao remover logo:', error);
      this.showErrorMessage('Erro ao remover logo.');
    }
  }

  /**
   * Formata o tamanho do arquivo em formato legível
   */
  protected formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
