import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';

// App
import { DatabaseService } from '../../core/services/database';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/user.model';
import { RegisterComponent } from '../auth/register/register.component';

// Tipo para usuário sem senha (exibição na tabela)
type UserDisplay = Omit<User, 'desc_password_hash'>;

@Component({
  selector: 'app-settings-user',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    ToastModule,
    TagModule,
    TooltipModule,
    TableModule,
    DialogModule,
    ConfirmDialogModule,
    InputTextModule,
    SelectModule,
    RegisterComponent
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './settings-user.html',
  styleUrls: ['./settings-user.scss']
})
export class SettingsUserComponent implements OnInit, OnDestroy {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  private readonly destroy$ = new Subject<void>();

  // ==================== SIGNALS ====================
  readonly usuarios = signal<UserDisplay[]>([]);
  readonly showRegisterDialog = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);

  // Filtros
  readonly filtroNome = signal<string>('');
  readonly filtroEmail = signal<string>('');
  readonly filtroPerfil = signal<string | null>(null);
  readonly filtroStatus = signal<number | null>(null);

  // Opções de filtro
  readonly perfilOptions = [
    { label: 'Administrador', value: 'admin' },
    { label: 'Gestor', value: 'gestor' },
    { label: 'Usuário', value: 'user' }
  ];

  readonly statusOptions = [
    { label: 'Ativo', value: 1 },
    { label: 'Inativo', value: 0 }
  ];

  // ==================== COMPUTED ====================
  readonly currentUserId = computed(() => this.authService.currentUser()?.num_user_id);
  readonly isAdmin = computed(() => this.authService.isAdmin());
  readonly canManageUsers = computed(() => this.authService.canManageUsers());
  readonly dbReady = computed(() => this.dbService.isDbReady());

  // Lista filtrada de usuários
  readonly usuariosFiltrados = computed(() => {
    let resultado = this.usuarios();

    const nome = this.filtroNome().toLowerCase().trim();
    if (nome) {
      resultado = resultado.filter(u =>
        u.desc_username.toLowerCase().includes(nome)
      );
    }

    const email = this.filtroEmail().toLowerCase().trim();
    if (email) {
      resultado = resultado.filter(u =>
        u.desc_email.toLowerCase().includes(email)
      );
    }

    const perfil = this.filtroPerfil();
    if (perfil !== null) {
      resultado = resultado.filter(u => u.desc_role === perfil);
    }

    const status = this.filtroStatus();
    if (status !== null) {
      resultado = resultado.filter(u => u.int_user_active === status);
    }

    return resultado;
  });

  readonly temFiltrosAtivos = computed(() =>
    this.filtroNome().trim() !== '' ||
    this.filtroEmail().trim() !== '' ||
    this.filtroPerfil() !== null ||
    this.filtroStatus() !== null
  );

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Effect para carregar usuários quando o banco estiver pronto
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadUsuarios();
      }
    }, { allowSignalWrites: true });
  }

  // ==================== LIFECYCLE HOOKS ====================
  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadUsuarios();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== CARREGAR USUÁRIOS ====================
  loadUsuarios(): void {
    try {
      const users = this.authService.getUsuariosList();
      this.usuarios.set(users);
      console.log('✅ Usuários carregados:', users.length);
    } catch (error) {
      console.error('❌ Erro ao carregar usuários:', error);
      this.showErrorMessage('Não foi possível carregar a lista de usuários.');
    }
  }

  // ==================== ATIVAR/DESATIVAR USUÁRIO ====================
  confirmToggleUser(user: UserDisplay): void {
    const isActive = user.int_user_active === 1;
    const action = isActive ? 'desativar' : 'ativar';
    const actionCapitalized = isActive ? 'Desativar' : 'Ativar';

    // Não permitir desativar o próprio usuário
    if (user.num_id === this.currentUserId()) {
      this.showWarningMessage('Você não pode desativar sua própria conta.');
      return;
    }

    // Não permitir desativar o admin padrão
    if (user.desc_email === 'admin@blackbeer.com' && isActive) {
      this.showWarningMessage('O administrador padrão não pode ser desativado.');
      return;
    }

    this.confirmationService.confirm({
      message: `Tem certeza que deseja ${action} o usuário "${user.desc_username}"?`,
      header: `${actionCapitalized} Usuário`,
      icon: isActive ? 'pi pi-exclamation-triangle' : 'pi pi-check-circle',
      acceptLabel: actionCapitalized,
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: isActive ? 'p-button-danger' : 'p-button-success',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.toggleUserActive(user, !isActive);
      }
    });
  }

  private toggleUserActive(user: UserDisplay, active: boolean): void {
    this.isLoading.set(true);

    try {
      const success = this.authService.toggleUserActive(user.num_id, active);

      if (success) {
        const action = active ? 'ativado' : 'desativado';
        this.showSuccessMessage(`Usuário "${user.desc_username}" ${action} com sucesso!`);
        this.loadUsuarios();
      } else {
        this.showErrorMessage('Não foi possível alterar o status do usuário.');
      }
    } catch (error) {
      console.error('❌ Erro ao alterar status do usuário:', error);
      this.showErrorMessage('Erro ao alterar status do usuário.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ==================== FILTROS ====================
  limparFiltros(): void {
    this.filtroNome.set('');
    this.filtroEmail.set('');
    this.filtroPerfil.set(null);
    this.filtroStatus.set(null);
  }

  // ==================== DIALOG DE REGISTRO ====================
  openRegisterDialog(): void {
    this.showRegisterDialog.set(true);
  }

  closeRegisterDialog(): void {
    this.showRegisterDialog.set(false);
  }

  onUserCreated(): void {
    this.closeRegisterDialog();
    this.loadUsuarios();
    this.showSuccessMessage('Novo usuário criado com sucesso!');
  }

  // ==================== FORMATTERS ====================
  getRoleLabel(role: string): string {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'gestor': return 'Gestor';
      default: return 'Usuário';
    }
  }

  getRoleSeverity(role: string): 'info' | 'warn' | 'success' {
    switch (role) {
      case 'admin': return 'warn';
      case 'gestor': return 'success';
      default: return 'info';
    }
  }

  getStatusLabel(active: number): string {
    return active === 1 ? 'Ativo' : 'Inativo';
  }

  getStatusSeverity(active: number): 'success' | 'danger' {
    return active === 1 ? 'success' : 'danger';
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
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

  private showWarningMessage(detail: string, summary: string = 'Atenção'): void {
    this.messageService.add({
      severity: 'warn',
      summary,
      detail,
      life: 4000
    });
  }
}
