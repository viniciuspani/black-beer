// src/app/features/settings-section/settings-section.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';

// App
import { AppSettings } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

interface EmailSettings {
  email: string;
  isConfigured: boolean;
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
    TagModule
  ],
  providers: [MessageService],
  templateUrl: './settings-section.html',
  styleUrls: ['./settings-section.scss']
})
export class SettingsSectionComponent implements OnInit {
  // Injeção de dependências (melhor prática Angular moderna)
  private readonly dbService = inject(DatabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);

  // Formulário reativo
  readonly settingsForm: FormGroup;
  
  // Signals para estado reativo
  readonly currentEmail = signal<string>('');
  
  // Computed signal - calcula automaticamente baseado em outros signals
  readonly isEmailConfigured = computed(() => {
    const email = this.currentEmail();
    return !!email && this.settingsForm.get('email')?.valid === true;
  });



  constructor() {
    // Inicializa o formulário com validações
    this.settingsForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    // Monitora mudanças no campo de email
    this.setupFormValueChanges();
  }

  ngOnInit(): void {
    // Carrega as configurações quando o componente inicializa
    this.loadSettings();
  }

  /**
   * Configura listeners para mudanças no formulário
   * Usa debounceTime para evitar atualizações excessivas
   */
  private setupFormValueChanges(): void {
    this.settingsForm.get('email')?.valueChanges
      .pipe(
        debounceTime(300), // Espera 300ms após a última digitação
        distinctUntilChanged() // Só emite se o valor realmente mudou
      )
      .subscribe(email => {
        this.currentEmail.set(email || '');
      });
  }

  /**
   * Carrega as configurações do banco de dados
   * Trata erros e casos onde não há configurações salvas
   */
  loadSettings(): void {
    try {
      const result = this.dbService.executeQuery(
        "SELECT value FROM settings WHERE key = ?",
        ['emailSettings']
      );

      if (result && result.length > 0 && result[0].value) {
        const settings: EmailSettings = JSON.parse(result[0].value);
        
        // Atualiza o formulário e o signal
        this.settingsForm.patchValue({ 
          email: settings.email 
        }, { emitEvent: false }); // emitEvent: false evita loop infinito
        
        this.currentEmail.set(settings.email);
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
      this.showSuccessMessage('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      this.showErrorMessage('Não foi possível salvar as configurações.');
    }
  }

  /**
   * Métodos auxiliares para exibir mensagens
   * Encapsulam a lógica de toast para reutilização
   */
  private showSuccessMessage(detail: string): void {
    this.messageService.add({ 
      severity: 'success', 
      summary: 'Sucesso', 
      detail,
      life: 3000 
    });
  }

  private showErrorMessage(detail: string): void {
    this.messageService.add({ 
      severity: 'error', 
      summary: 'Erro', 
      detail,
      life: 5000 
    });
  }

  /**
   * Verifica se um campo específico do formulário tem erro
   * Útil para exibir mensagens de validação no template
   */
  hasFieldError(fieldName: string): boolean {
    const field = this.settingsForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /**
   * Retorna o erro específico de um campo
   */
  getFieldError(fieldName: string): string {
    const field = this.settingsForm.get(fieldName);
    
    if (field?.hasError('required')) {
      return 'Este campo é obrigatório';
    }
    
    if (field?.hasError('email')) {
      return 'Por favor, insira um e-mail válido';
    }
    
    return '';
  }
}