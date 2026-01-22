// ========================================
// src/app/features/auth/login/login.component.ts
// Componente de Login (Angular 20 otimizado)
// ========================================

import { Component, OnInit, AfterViewInit, inject, signal, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

// App
import { AuthService } from '../../../core/services/auth.service';
import { DatabaseService } from '../../../core/services/database';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly dbService = inject(DatabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  readonly isLoading = signal(false);

  // ViewChild para acessar o input de usuário
  @ViewChild('emailOrUsernameInput') emailOrUsernameInput?: ElementRef<HTMLInputElement>;

  readonly loginForm: FormGroup = this.fb.group({
    emailOrUsername: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [false],
  });

  constructor() {
    // Usa effect para reagir quando o banco estiver pronto
    // effect(() => {
    //   if (this.dbService.isDbReady()) {
    //     console.log('✅ Banco de dados pronto! Listando usuários...');
    //     this.authService.listarUsuarios();
    //   }
    // });

    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/']);
    }
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // Adiciona pequeno delay para garantir que o DOM está pronto
    setTimeout(() => {
      this.emailOrUsernameInput?.nativeElement?.focus();
    }, 100);
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.showError('Preencha todos os campos corretamente');
      return;
    }

    this.isLoading.set(true);

    try {
      const { emailOrUsername, password } = this.loginForm.value;
      const response = await this.authService.login({
        desc_email_or_username: emailOrUsername.trim(),
        desc_password: password,
      });

      if (response.success) {
        this.showSuccess(response.message || 'Login realizado com sucesso!');
        setTimeout(() => this.router.navigate(['menu']), 800);
      } else {
        this.showError(response.message || 'Erro ao fazer login');
      }
    } catch (error) {
      console.error('❌ Erro no login:', error);
      this.showError('Erro inesperado. Tente novamente.');
    } finally {
      this.isLoading.set(false);
    }
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }

  hasError(field: string): boolean {
    const control = this.loginForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getError(field: string): string {
    const control = this.loginForm.get(field);
    if (!control) return '';
    if (control.hasError('required')) return 'Campo obrigatório';
    if (control.hasError('minlength')) return 'Senha deve ter no mínimo 6 caracteres';
    return 'Campo inválido';
  }

  private showSuccess(msg: string): void {
    this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: msg, life: 3000 });
  }

  private showError(msg: string): void {
    this.messageService.add({ severity: 'error', summary: 'Erro', detail: msg, life: 4000 });
  }
}
