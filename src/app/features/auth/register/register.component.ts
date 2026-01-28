// ========================================
// src/app/features/auth/register/register.component.ts
// Componente de Cadastro
// ========================================

import { Component, OnInit, inject, signal, computed, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';

// App
import { AuthService } from '../../../core/services/auth.service';
import {
  isValidEmail,
  isValidUsername,
  isValidPassword,
  getPasswordError,
  UserRole
} from '../../../core/models/user.model';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    ToastModule,
    SelectModule
  ],
  providers: [MessageService],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  // ==================== INJEÇÃO ====================
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  // ==================== INPUTS/OUTPUTS ====================
  /**
   * Modo embedded: quando true, o componente não redireciona após cadastro
   * e não exibe link para login
   */
  @Input() embedded: boolean = false;

  /**
   * Evento emitido quando um usuário é criado com sucesso (modo embedded)
   */
  @Output() userCreated = new EventEmitter<void>();

  // ==================== SIGNALS ====================
  readonly isLoading = signal<boolean>(false);

  // ==================== OPÇÕES DE PERFIL ====================
  readonly roleOptions = computed(() => {
    const currentUser = this.authService.currentUser();
    const isGestor = currentUser?.desc_role === 'gestor';

    const allOptions: { label: string; value: UserRole }[] = [
      { label: 'Usuário', value: 'user' },
      { label: 'Gestor', value: 'gestor' },
      ...(!isGestor ? [{ label: 'Administrador' as const, value: 'admin' as UserRole }] : [])
    ];

    return allOptions;
  });

  // ==================== FORMULÁRIO ====================
  readonly registerForm: FormGroup;

  // ==================== CONSTRUCTOR ====================
  constructor() {
    this.registerForm = this.fb.group({
      username: ['', [
        Validators.required,
        Validators.minLength(3),
        this.usernameValidator
      ]],
      email: ['', [
        Validators.required,
        Validators.email,
        this.emailValidator
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(6),
        this.passwordValidator
      ]],
      confirmPassword: ['', [Validators.required]],
      role: ['user']  // Perfil padrão: user (usado apenas no modo embedded)
    }, {
      validators: this.passwordMatchValidator  // Validador do form inteiro
    });

    // NOTA: Redirecionamento removido pois este componente também é usado
    // dentro do Menu (aba Configurações > Usuário) quando já está logado.
    // O guard de rota /register já protege o acesso direto se necessário.
  }

  ngOnInit(): void {}

  // ==================== VALIDADORES CUSTOMIZADOS ====================

  /**
   * Validador de username
   */
  private usernameValidator(control: AbstractControl): ValidationErrors | null {
    const username = control.value;

    if (!username) return null;  // required já valida isso

    if (!isValidUsername(username)) {
      return {
        invalidUsername: 'Use apenas letras, números, _ e - (mín. 3 caracteres)'
      };
    }

    return null;
  }

  /**
   * Validador de email
   */
  private emailValidator(control: AbstractControl): ValidationErrors | null {
    const email = control.value;

    if (!email) return null;  // required já valida isso

    if (!isValidEmail(email)) {
      return {
        invalidEmail: 'Email inválido'
      };
    }

    return null;
  }

  /**
   * Validador de senha
   */
  private passwordValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.value;

    if (!password) return null;  // required já valida isso

    if (!isValidPassword(password)) {
      const error = getPasswordError(password);
      return {
        weakPassword: error || 'Senha fraca'
      };
    }

    return null;
  }

  /**
   * Validador de confirmação de senha
   * Aplicado no FormGroup inteiro
   */
  private passwordMatchValidator(form: AbstractControl): ValidationErrors | null {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;

    if (!password || !confirmPassword) return null;

    if (password !== confirmPassword) {
      // Seta erro no campo confirmPassword
      form.get('confirmPassword')?.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }

    // Remove erro se senhas conferem
    const confirmControl = form.get('confirmPassword');
    if (confirmControl?.hasError('passwordMismatch')) {
      confirmControl.setErrors(null);
    }

    return null;
  }

  // ==================== SUBMIT CADASTRO ====================
  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.showError('Preencha todos os campos corretamente');
      return;
    }

    this.isLoading.set(true);

    try {
      const { username, email, password, role } = this.registerForm.value;

      // No modo embedded, usa o role selecionado; senão, sempre 'user'
      const selectedRole: UserRole = this.embedded ? (role || 'user') : 'user';

      // No modo embedded (painel admin), não faz login automático
      // para manter o usuário atual logado
      const autoLogin = !this.embedded;

      const response = await this.authService.register({
        desc_username: username.trim(),
        desc_email: email.trim().toLowerCase(),
        desc_password: password,
        desc_role: selectedRole
      }, autoLogin);

      if (response.success) {
        this.showSuccess(response.message || 'Cadastro realizado com sucesso!');

        if (this.embedded) {
          // Modo embedded: emite evento e limpa formulário
          this.registerForm.reset();
          this.userCreated.emit();
        } else {
          // Modo standalone: redireciona para home
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 1000);
        }
      } else {
        this.showError(response.message || 'Erro ao criar conta');
      }

    } catch (error) {
      console.error('❌ Erro no cadastro:', error);
      this.showError('Erro inesperado. Tente novamente.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ==================== NAVEGAÇÃO ====================
  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  // ==================== VALIDAÇÃO ====================
  hasError(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getError(fieldName: string): string {
    const field = this.registerForm.get(fieldName);

    if (!field) return '';

    if (field.hasError('required')) {
      return 'Campo obrigatório';
    }

    if (field.hasError('minlength')) {
      const minLength = field.errors?.['minlength']?.requiredLength;
      return `Mínimo de ${minLength} caracteres`;
    }

    if (field.hasError('email')) {
      return 'Email inválido';
    }

    if (field.hasError('invalidEmail')) {
      return field.errors?.['invalidEmail'];
    }

    if (field.hasError('invalidUsername')) {
      return field.errors?.['invalidUsername'];
    }

    if (field.hasError('weakPassword')) {
      return field.errors?.['weakPassword'];
    }

    if (field.hasError('passwordMismatch')) {
      return 'As senhas não conferem';
    }

    return 'Campo inválido';
  }

  /**
   * Retorna força da senha em texto
   * Para exibir feedback visual
   */
  getPasswordStrength(): { text: string; color: string; percentage: number } {
    const password = this.registerForm.get('password')?.value || '';

    if (password.length === 0) {
      return { text: '', color: '', percentage: 0 };
    }

    let strength = 0;

    // Comprimento
    if (password.length >= 6) strength += 25;
    if (password.length >= 8) strength += 25;

    // Letras
    if (/[a-z]/.test(password)) strength += 15;
    if (/[A-Z]/.test(password)) strength += 15;

    // Números
    if (/[0-9]/.test(password)) strength += 10;

    // Caracteres especiais
    if (/[^a-zA-Z0-9]/.test(password)) strength += 10;

    if (strength < 40) {
      return { text: 'Fraca', color: '#ef4444', percentage: strength };
    } else if (strength < 70) {
      return { text: 'Média', color: '#f59e0b', percentage: strength };
    } else {
      return { text: 'Forte', color: '#10b981', percentage: strength };
    }
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
      life: 4000
    });
  }

  private showInfo(message: string): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Informação',
      detail: message,
      life: 3000
    });
  }
}

// Export default para lazy loading
export default RegisterComponent;
