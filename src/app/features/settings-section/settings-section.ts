// src/app/features/settings-section/settings-section.component.ts
import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject, takeUntil } from 'rxjs';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';

// App
import { AppSettings } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

/**
 * Interface para as configurações de email
 * Define a estrutura dos dados salvos no banco
 */
interface EmailSettings {
  email: string;
  isConfigured: boolean;
}

/**
 * Interface para as estatísticas do banco de dados
 * Usada para exibir informações na tela de configurações
 */
interface DatabaseStats {
  totalSales: number;
  totalBeerTypes: number;
  hasSettings: boolean;
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
  
  // Subject para gerenciar unsubscribe
  private readonly destroy$ = new Subject<void>();

  // ==================== FORMULÁRIO REATIVO ====================
  readonly settingsForm: FormGroup;
  
  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  
  /**
   * Armazena o email atual configurado
   */
  readonly currentEmail = signal<string>('');
  
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
   * Atualizado sempre que necessário
   */
  private readonly dbStatsSignal = signal<DatabaseStats>({
    totalSales: 0,
    totalBeerTypes: 0,
    hasSettings: false
  });

  // ==================== COMPUTED SIGNALS ====================
  
  /**
   * Calcula se o email está configurado corretamente
   * Depende do currentEmail e da validação do formulário
   */
  readonly isEmailConfigured = computed(() => {
    const email = this.currentEmail();
    const emailControl = this.settingsForm.get('email');
    return !!email && emailControl?.valid === true;
  });

  /**
   * Retorna as estatísticas do banco de dados
   * Recalculado quando o banco está pronto
   */
  readonly dbStats = computed(() => {
    return this.dbStatsSignal();
  });

  /**
   * Converte o signal do banco em um signal do Angular
   * Facilita o uso no template com sintaxe ()
   */
  readonly dbReady = computed(() => this.dbService.isDbReady());

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Inicializa o formulário com validações
    this.settingsForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    // Configura listeners para mudanças no formulário
    this.setupFormValueChanges();
    
    // Effect para carregar configurações quando o banco estiver pronto
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadSettings();
        this.updateDatabaseStats();
      }
    }, { allowSignalWrites: true });
  }

  // ==================== LIFECYCLE HOOKS ====================
  
  ngOnInit(): void {
    // Carrega as configurações se o banco já estiver pronto
    if (this.dbService.isDbReady()) {
      this.loadSettings();
      this.updateDatabaseStats();
    }
  }

  ngOnDestroy(): void {
    // Limpa todas as subscriptions
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
   * Configura listeners para mudanças no formulário
   * Usa debounceTime para evitar atualizações excessivas
   */
  private setupFormValueChanges(): void {
    this.settingsForm.get('email')?.valueChanges
      .pipe(
        debounceTime(300), // Espera 300ms após a última digitação
        distinctUntilChanged(), // Só emite se o valor realmente mudou
        takeUntil(this.destroy$) // Cancela quando o componente for destruído
      )
      .subscribe(email => {
        this.currentEmail.set(email?.trim() || '');
      });
  }

  /**
   * Atualiza as estatísticas do banco de dados
   * Chamado após operações que modificam o banco
   */
  private updateDatabaseStats(): void {
    try {
      const stats = this.dbService.getDatabaseStats();
      this.dbStatsSignal.set(stats);
    } catch (error) {
      console.error('Erro ao atualizar estatísticas do banco:', error);
      this.dbStatsSignal.set({
        totalSales: 0,
        totalBeerTypes: 0,
        hasSettings: false
      });
    }
  }

  // ==================== MÉTODOS PÚBLICOS - CONFIGURAÇÕES ====================

  /**
   * Carrega as configurações do banco de dados
   * Trata erros e casos onde não há configurações salvas
   */
  loadSettings(): void {
    try {
      const result = this.dbService.executeQuery(
        "SELECT value FROM settings WHERE email = ?",
        ['emailSettings']
      );

      if (result && result.length > 0 && result[0].value) {
        const settings: EmailSettings = JSON.parse(result[0].value);
        
        // Atualiza o formulário e o signal
        this.settingsForm.patchValue({ 
          email: settings.email 
        }, { emitEvent: false }); // emitEvent: false evita loop infinito
        
        this.currentEmail.set(settings.email || '');
      } else {
        // Se não há configurações, limpa o formulário
        this.settingsForm.patchValue({ email: '' }, { emitEvent: false });
        this.currentEmail.set('');
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      this.showErrorMessage('Não foi possível carregar as configurações.');
    }
  }

  /**
   * Salva as configurações no banco de dados
   * Valida antes de salvar e fornece feedback ao usuário
   */
  saveSettings(): void {
    // Marca todos os campos como "touched" para mostrar erros
    this.settingsForm.markAllAsTouched();

    if (this.settingsForm.invalid) {
      this.showErrorMessage('Por favor, insira um e-mail válido.');
      return;
    }

    const email = this.settingsForm.value.email?.trim();
    
    if (!email) {
      this.showErrorMessage('O e-mail não pode estar vazio.');
      return;
    }

    const emailSettings: EmailSettings = {
      email: email,
      isConfigured: true
    };

    try {
      this.dbService.executeRun(
        `INSERT INTO settings (key, value) 
         VALUES (?, ?)
         ON CONFLICT(key) 
         DO UPDATE SET value = excluded.value`,
        ['emailSettings', JSON.stringify(emailSettings)]
      );
      
      this.currentEmail.set(email);
      this.updateDatabaseStats();
      this.showSuccessMessage('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      this.showErrorMessage('Não foi possível salvar as configurações.');
    }
  }

  // ==================== MÉTODOS PÚBLICOS - BANCO DE DADOS ====================

  /**
   * Abre o dialog de confirmação para limpar o banco
   * Atualiza as estatísticas antes de abrir para mostrar dados atuais
   */
  openClearDialog(): void {
    this.updateDatabaseStats();
    this.showClearDialog.set(true);
  }

  /**
   * Fecha o dialog de confirmação
   * Reseta o estado de loading se estiver ativo
   */
  closeClearDialog(): void {
    this.showClearDialog.set(false);
    if (this.isClearing()) {
      this.isClearing.set(false);
    }
  }

  /**
   * Limpa completamente o banco de dados após confirmação
   * Remove todas as vendas e configurações, mantendo apenas dados iniciais
   * Processo assíncrono com feedback visual
   */
  async clearDatabase(): Promise<void> {
    // Ativa o estado de loading
    this.isClearing.set(true);
    
    try {
      // Aguarda a limpeza do banco (operação assíncrona)
      await this.dbService.clearDatabase();
      
      // Recarrega as configurações após limpar
      this.settingsForm.reset();
      this.currentEmail.set('');
      
      // Atualiza as estatísticas do banco
      this.updateDatabaseStats();
      
      // Mostra mensagem de sucesso
      this.showSuccessMessage(
        '✅ Banco de dados limpo com sucesso! Todos os dados foram removidos e o sistema foi reiniciado ao estado inicial.'
      );
      
      // Fecha o modal
      this.showClearDialog.set(false);
      
      // Log para debug
      console.log('✅ Database cleared successfully');
      
    } catch (error) {
      console.error('❌ Erro ao limpar banco de dados:', error);
      this.showErrorMessage(
        '❌ Não foi possível limpar o banco de dados. Por favor, tente novamente ou recarregue a página.'
      );
    } finally {
      // Sempre desativa o loading, mesmo em caso de erro
      this.isClearing.set(false);
    }
  }

  // ==================== MÉTODOS AUXILIARES - VALIDAÇÃO ====================

  /**
   * Verifica se um campo específico do formulário tem erro
   * Útil para exibir mensagens de validação no template
   * @param fieldName Nome do campo a ser validado
   * @returns true se o campo tem erro e foi tocado
   */
  hasFieldError(fieldName: string): boolean {
    const field = this.settingsForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /**
   * Retorna a mensagem de erro específica de um campo
   * @param fieldName Nome do campo
   * @returns Mensagem de erro formatada
   */
  getFieldError(fieldName: string): string {
    const field = this.settingsForm.get(fieldName);
    
    if (!field) {
      return '';
    }
    
    if (field.hasError('required')) {
      return 'Este campo é obrigatório';
    }
    
    if (field.hasError('email')) {
      return 'Por favor, insira um e-mail válido no formato: usuario@exemplo.com';
    }
    
    return 'Erro de validação';
  }

  // ==================== MÉTODOS AUXILIARES - MENSAGENS ====================

  /**
   * Exibe uma mensagem de sucesso usando PrimeNG Toast
   * @param detail Mensagem detalhada a ser exibida
   * @param summary Título da mensagem (opcional)
   */
  private showSuccessMessage(detail: string, summary: string = 'Sucesso'): void {
    this.messageService.add({ 
      severity: 'success', 
      summary, 
      detail,
      life: 4000 // Mensagem visível por 4 segundos
    });
  }

  /**
   * Exibe uma mensagem de erro usando PrimeNG Toast
   * @param detail Mensagem detalhada a ser exibida
   * @param summary Título da mensagem (opcional)
   */
  private showErrorMessage(detail: string, summary: string = 'Erro'): void {
    this.messageService.add({ 
      severity: 'error', 
      summary, 
      detail,
      life: 5000 // Mensagens de erro ficam mais tempo na tela
    });
  }

  /**
   * Exibe uma mensagem de informação usando PrimeNG Toast
   * @param detail Mensagem detalhada a ser exibida
   * @param summary Título da mensagem (opcional)
   */
  private showInfoMessage(detail: string, summary: string = 'Informação'): void {
    this.messageService.add({ 
      severity: 'info', 
      summary, 
      detail,
      life: 3000
    });
  }

  /**
   * Exibe uma mensagem de aviso usando PrimeNG Toast
   * @param detail Mensagem detalhada a ser exibida
   * @param summary Título da mensagem (opcional)
   */
  private showWarningMessage(detail: string, summary: string = 'Atenção'): void {
    this.messageService.add({ 
      severity: 'warn', 
      summary, 
      detail,
      life: 4000
    });
  }

  // ==================== MÉTODOS PÚBLICOS - UTILIDADES ====================

  /**
   * Formata um número para exibição com separadores de milhares
   * @param value Número a ser formatado
   * @returns String formatada (ex: 1.234)
   */
  formatNumber(value: number): string {
    return value.toLocaleString('pt-BR');
  }

  /**
   * Retorna o status do banco de dados em formato legível
   * @returns String com o status atual
   */
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

  /**
   * Verifica se há dados no banco que podem ser limpos
   * @returns true se há dados para limpar
   */
  hasDataToClear(): boolean {
    const stats = this.dbStats();
    return stats.totalSales > 0 || stats.hasSettings;
  }
}