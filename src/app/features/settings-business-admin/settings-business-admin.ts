import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { InputMaskModule } from 'primeng/inputmask';

// App
import { DatabaseService } from '../../core/services/database';
import { AuthService } from '../../core/services/auth.service';
import {
  Business,
  BusinessDisplay,
  ESTADOS_BR,
  formatCnpj,
  formatCep,
  isValidCnpjFormat,
  isValidCepFormat
} from '../../core/models/business.model';

interface EmpresaForm {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  cep: string;
  cidade: string;
  estado: string;
  responsavelEmpresa: string;
  gestorEmpresa: number | null;
}

@Component({
  selector: 'app-settings-business-admin',
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
    InputMaskModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './settings-business-admin.html',
  styleUrls: ['./settings-business-admin.scss']
})
export class SettingsBusinessAdminComponent implements OnInit, OnDestroy {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  private readonly destroy$ = new Subject<void>();

  // ==================== SIGNALS ====================
  readonly empresas = signal<BusinessDisplay[]>([]);
  readonly gestores = signal<any[]>([]);
  readonly showDialog = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly isEditing = signal<boolean>(false);
  readonly editingEmpresaId = signal<number | null>(null);

  // Filtros
  readonly filtroRazaoSocial = signal<string>('');
  readonly filtroCnpj = signal<string>('');
  readonly filtroCidade = signal<string>('');
  readonly filtroStatus = signal<number | null>(null);

  // Opções de filtro
  readonly statusOptions = [
    { label: 'Ativa', value: 1 },
    { label: 'Inativa', value: 0 }
  ];

  // Form
  readonly form = signal<EmpresaForm>({
    razaoSocial: '',
    cnpj: '',
    endereco: '',
    cep: '',
    cidade: '',
    estado: '',
    responsavelEmpresa: '',
    gestorEmpresa: null
  });

  // Estados do Brasil
  readonly estados = ESTADOS_BR.map(e => ({ label: e.nome, value: e.sigla }));

  // ==================== COMPUTED ====================
  readonly isAdmin = computed(() => this.authService.isAdmin());
  readonly dbReady = computed(() => this.dbService.isDbReady());

  readonly dialogTitle = computed(() =>
    this.isEditing() ? 'Editar Empresa' : 'Nova Empresa'
  );

  // Lista filtrada de empresas
  readonly empresasFiltradas = computed(() => {
    let resultado = this.empresas();

    const razaoSocial = this.filtroRazaoSocial().toLowerCase().trim();
    if (razaoSocial) {
      resultado = resultado.filter(e =>
        e.desc_razao_social.toLowerCase().includes(razaoSocial)
      );
    }

    const cnpj = this.filtroCnpj().replace(/\D/g, '').trim();
    if (cnpj) {
      resultado = resultado.filter(e =>
        e.desc_cnpj.replace(/\D/g, '').includes(cnpj)
      );
    }

    const cidade = this.filtroCidade().toLowerCase().trim();
    if (cidade) {
      resultado = resultado.filter(e =>
        e.desc_cidade.toLowerCase().includes(cidade)
      );
    }

    const status = this.filtroStatus();
    if (status !== null) {
      resultado = resultado.filter(e => e.int_active === status);
    }

    return resultado;
  });

  readonly temFiltrosAtivos = computed(() =>
    this.filtroRazaoSocial().trim() !== '' ||
    this.filtroCnpj().trim() !== '' ||
    this.filtroCidade().trim() !== '' ||
    this.filtroStatus() !== null
  );

  // ==================== CONSTRUCTOR ====================
  constructor() {
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadEmpresas();
        this.loadGestores();
      }
    }, { allowSignalWrites: true });
  }

  // ==================== LIFECYCLE HOOKS ====================
  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadEmpresas();
      this.loadGestores();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== CARREGAR DADOS ====================
  loadEmpresas(): void {
    try {
      const empresas = this.authService.getEmpresasList();
      this.empresas.set(empresas);
      console.log('✅ Empresas carregadas:', empresas.length);
    } catch (error) {
      console.error('❌ Erro ao carregar empresas:', error);
      this.showErrorMessage('Não foi possível carregar a lista de empresas.');
    }
  }

  loadGestores(): void {
    try {
      const gestores = this.authService.getGestoresList();
      this.gestores.set(gestores.map(g => ({
        label: `${g.desc_username} (${g.desc_email})`,
        value: g.num_id
      })));
    } catch (error) {
      console.error('❌ Erro ao carregar gestores:', error);
    }
  }

  // ==================== FILTROS ====================
  limparFiltros(): void {
    this.filtroRazaoSocial.set('');
    this.filtroCnpj.set('');
    this.filtroCidade.set('');
    this.filtroStatus.set(null);
  }

  // ==================== DIALOG ====================
  openCreateDialog(): void {
    this.loadGestores(); // Recarrega lista de gestores para incluir novos cadastros
    this.resetForm();
    this.isEditing.set(false);
    this.editingEmpresaId.set(null);
    this.showDialog.set(true);
  }

  openEditDialog(empresa: BusinessDisplay): void {
    this.loadGestores(); // Recarrega lista de gestores para incluir novos cadastros
    this.form.set({
      razaoSocial: empresa.desc_razao_social,
      cnpj: formatCnpj(empresa.desc_cnpj),
      endereco: empresa.desc_endereco,
      cep: formatCep(empresa.desc_cep),
      cidade: empresa.desc_cidade,
      estado: empresa.desc_estado,
      responsavelEmpresa: empresa.desc_responsavel_empresa,
      gestorEmpresa: empresa.num_gestor_empresa
    });
    this.isEditing.set(true);
    this.editingEmpresaId.set(empresa.num_id);
    this.showDialog.set(true);
  }

  closeDialog(): void {
    this.showDialog.set(false);
    this.resetForm();
  }

  resetForm(): void {
    this.form.set({
      razaoSocial: '',
      cnpj: '',
      endereco: '',
      cep: '',
      cidade: '',
      estado: '',
      responsavelEmpresa: '',
      gestorEmpresa: null
    });
  }

  // ==================== SALVAR EMPRESA ====================
  saveEmpresa(): void {
    const formData = this.form();

    // Validações
    if (!formData.razaoSocial.trim()) {
      this.showWarningMessage('Razão social é obrigatória.');
      return;
    }

    if (!formData.cnpj || !isValidCnpjFormat(formData.cnpj)) {
      this.showWarningMessage('CNPJ inválido. Informe os 14 dígitos.');
      return;
    }

    if (!formData.endereco.trim()) {
      this.showWarningMessage('Endereço é obrigatório.');
      return;
    }

    if (!formData.cep || !isValidCepFormat(formData.cep)) {
      this.showWarningMessage('CEP inválido. Informe os 8 dígitos.');
      return;
    }

    if (!formData.cidade.trim()) {
      this.showWarningMessage('Cidade é obrigatória.');
      return;
    }

    if (!formData.estado) {
      this.showWarningMessage('Estado é obrigatório.');
      return;
    }

    if (!formData.responsavelEmpresa.trim()) {
      this.showWarningMessage('Responsável é obrigatório.');
      return;
    }

    this.isLoading.set(true);

    try {
      if (this.isEditing()) {
        // Atualizar
        const result = this.authService.updateEmpresa(this.editingEmpresaId()!, {
          razaoSocial: formData.razaoSocial,
          cnpj: formData.cnpj,
          endereco: formData.endereco,
          cep: formData.cep,
          cidade: formData.cidade,
          estado: formData.estado,
          responsavelEmpresa: formData.responsavelEmpresa,
          gestorEmpresa: formData.gestorEmpresa
        });

        if (result.success) {
          this.showSuccessMessage(result.message);
          this.closeDialog();
          this.loadEmpresas();
        } else {
          this.showErrorMessage(result.message);
        }
      } else {
        // Criar
        const result = this.authService.createEmpresa({
          razaoSocial: formData.razaoSocial,
          cnpj: formData.cnpj,
          endereco: formData.endereco,
          cep: formData.cep,
          cidade: formData.cidade,
          estado: formData.estado,
          responsavelEmpresa: formData.responsavelEmpresa,
          gestorEmpresa: formData.gestorEmpresa
        });

        if (result.success) {
          this.showSuccessMessage(result.message);
          this.closeDialog();
          this.loadEmpresas();
        } else {
          this.showErrorMessage(result.message);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao salvar empresa:', error);
      this.showErrorMessage('Erro ao salvar empresa. Tente novamente.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ==================== ATIVAR/DESATIVAR EMPRESA ====================
  confirmToggleEmpresa(empresa: BusinessDisplay): void {
    const isActive = empresa.int_active === 1;
    const action = isActive ? 'desativar' : 'ativar';
    const actionCapitalized = isActive ? 'Desativar' : 'Ativar';

    this.confirmationService.confirm({
      message: `Tem certeza que deseja ${action} a empresa "${empresa.desc_razao_social}"?`,
      header: `${actionCapitalized} Empresa`,
      icon: isActive ? 'pi pi-exclamation-triangle' : 'pi pi-check-circle',
      acceptLabel: actionCapitalized,
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: isActive ? 'p-button-danger' : 'p-button-success',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.toggleEmpresaActive(empresa, !isActive);
      }
    });
  }

  private toggleEmpresaActive(empresa: BusinessDisplay, active: boolean): void {
    this.isLoading.set(true);

    try {
      const success = this.authService.toggleEmpresaActive(empresa.num_id, active);

      if (success) {
        const action = active ? 'ativada' : 'desativada';
        this.showSuccessMessage(`Empresa "${empresa.desc_razao_social}" ${action} com sucesso!`);
        this.loadEmpresas();
      } else {
        this.showErrorMessage('Não foi possível alterar o status da empresa.');
      }
    } catch (error) {
      console.error('❌ Erro ao alterar status da empresa:', error);
      this.showErrorMessage('Erro ao alterar status da empresa.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ==================== EXCLUIR EMPRESA ====================
  confirmDeleteEmpresa(empresa: BusinessDisplay): void {
    this.confirmationService.confirm({
      message: `Tem certeza que deseja excluir permanentemente a empresa "${empresa.desc_razao_social}"? Esta ação não pode ser desfeita.`,
      header: 'Excluir Empresa',
      icon: 'pi pi-trash',
      acceptLabel: 'Excluir',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.deleteEmpresa(empresa);
      }
    });
  }

  private deleteEmpresa(empresa: BusinessDisplay): void {
    this.isLoading.set(true);

    try {
      const result = this.authService.deleteEmpresa(empresa.num_id);

      if (result.success) {
        this.showSuccessMessage(result.message);
        this.loadEmpresas();
      } else {
        this.showErrorMessage(result.message);
      }
    } catch (error) {
      console.error('❌ Erro ao excluir empresa:', error);
      this.showErrorMessage('Erro ao excluir empresa.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ==================== FORMATTERS ====================
  formatCnpjDisplay(cnpj: string): string {
    return formatCnpj(cnpj);
  }

  formatCepDisplay(cep: string): string {
    return formatCep(cep);
  }

  getStatusLabel(active: number): string {
    return active === 1 ? 'Ativa' : 'Inativa';
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
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  }

  // ==================== FORM HELPERS ====================
  updateFormField<K extends keyof EmpresaForm>(field: K, value: EmpresaForm[K]): void {
    this.form.update(f => ({ ...f, [field]: value }));
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
