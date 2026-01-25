import { Routes } from '@angular/router';
// src/app/features/beer-management/beer-management.ts
import { Component, OnInit, inject, signal, WritableSignal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';


// PrimeNG Modules
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ColorPickerModule } from 'primeng/colorpicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';

// App Services and Models
import { BeerType } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';
import { AuthService } from '../../core/services/auth.service';
import { TabRefreshService, MainTab } from '../../core/services/tab-refresh.service';

/**
 * Componente para gerenciar tipos de cerveja
 * 
 * MUDANÇAS NA REFATORAÇÃO:
 * - IDs agora são numbers (INTEGER AUTOINCREMENT)
 * - Não gera mais IDs baseados no nome (slug)
 * - Banco gerencia IDs automaticamente
 * - Validação baseada em name (UNIQUE) em vez de ID
 */
@Component({
  selector: 'app-beer-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    ColorPickerModule,
    TableModule,
    TagModule,
    ConfirmDialogModule,
    ToastModule,
    DialogModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './beer-management.html',
  styleUrls: ['./beer-management.scss']
})
export class BeerManagementComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private dbService = inject(DatabaseService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private tabRefreshService = inject(TabRefreshService);

  // ==================== PERMISSÕES ====================
  /**
   * Verifica se o usuário pode gerenciar cervejas (criar, editar, remover)
   * Apenas admin e gestor têm essa permissão
   */
  readonly canManageBeers = computed(() =>
    this.authService.isAdmin() || this.authService.isGestor()
  );
  

  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  beerTypes: WritableSignal<BeerType[]> = signal([]);
  isAdding = signal(false);
  isEditing = signal(false);
  beerForm: FormGroup;
  editForm: FormGroup;
  currentEditingBeer: BeerType | null = null;

  // ==================== CONSTANTES ====================
  /**
   * IDs das cervejas padrão (DEFAULT SEEDS)
   * MUDANÇA: Agora são numbers (1, 2, 3, 4) em vez de strings ('ipa', 'weiss')
   * 
   * IMPORTANTE: Estes IDs correspondem à ordem de inserção no seed
   * Se mudar a ordem no seed do DatabaseService, precisa mudar aqui!
   */
  private readonly DEFAULT_BEER_IDS = [1, 2, 3, 4];  // ← MUDANÇA: numbers
  private readonly DEFAULT_COLOR = '#D4A574';
  router: any;

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Inicialização do formulário reativo para adicionar
    this.beerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      color: [this.DEFAULT_COLOR, Validators.required]
    });

    // Inicialização do formulário reativo para editar
    this.editForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      color: [this.DEFAULT_COLOR, Validators.required]
    });

    // Effect para recarregar quando DB estiver pronto
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadBeerTypes();
      }
    });
  }

  // ==================== LIFECYCLE HOOKS ====================
  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadBeerTypes();
    }
  }

  // ==================== CARREGAMENTO DE DADOS ====================
  /**
   * Carrega tipos de cerveja do banco
   * MUDANÇA: IDs agora são numbers, converte explicitamente
   */
  loadBeerTypes(): void {
    try {
      const beers = this.dbService.executeQuery(
        'SELECT * FROM prd_beer_types ORDER BY desc_name'
      );

      // Conversão explícita para garantir type safety
      const typedBeers: BeerType[] = beers.map(beer => ({
        num_id: Number(beer.num_id),
        desc_name: beer.desc_name,
        desc_color: beer.desc_color,
        desc_description: beer.desc_description
      }));

      this.beerTypes.set(typedBeers);
      console.log('✅ Beer types carregados:', typedBeers.length);
    } catch (error) {
      console.error('❌ Erro ao carregar beer types:', error);
      this.showError('Não foi possível carregar os tipos de cerveja.');
    }
  }

  // ==================== MÉTODOS DE UI ====================
  /**
   * Alterna entre mostrar/ocultar formulário de adição
   */
  toggleAddForm(): void {
    this.isAdding.update(value => !value);
    this.beerForm.reset({ color: this.DEFAULT_COLOR });
  }

  /**
   * Verifica se uma cerveja é do tipo padrão (não pode ser deletada)
   * MUDANÇA: Compara com numbers agora
   * 
   * @param beerId ID da cerveja a verificar
   * @returns true se é cerveja padrão
   */
  isDefaultBeer(beerId: number): boolean {
    return this.DEFAULT_BEER_IDS.includes(beerId);  // ← number[] includes number
  }

  // ==================== ADICIONAR CERVEJA ====================
  /**
   * Handler para adicionar nova cerveja
   * MUDANÇA CRÍTICA: Não gera mais ID manualmente, banco faz via AUTOINCREMENT
   */
  handleAddBeer(): void {
    if (this.beerForm.invalid) {
      this.showWarning('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const formValue = this.beerForm.value;
    const beerName = formValue.name.trim();

    // Validação: verifica se já existe cerveja com este nome
    if (this.beerNameExists(beerName)) {
      this.showError('Uma cerveja com este nome já existe.');
      return;
    }

    // MUDANÇA: Não criamos objeto com ID, deixamos o banco gerar
    const newBeer = {
      desc_name: beerName,
      desc_description: formValue.description?.trim() || `Cerveja ${beerName}`,
      desc_color: formValue.color
    };

    try {
      // INSERT sem ID - banco gera via AUTOINCREMENT
      this.dbService.executeRun(
        'INSERT INTO prd_beer_types (desc_name, desc_description, desc_color) VALUES (?, ?, ?)',
        [newBeer.desc_name, newBeer.desc_description, newBeer.desc_color]
      );

      // Obtém o ID gerado pelo banco
      const insertedId = this.dbService.getLastInsertId();
      console.log('✅ Cerveja adicionada com ID:', insertedId);

      this.showSuccess(`${newBeer.desc_name} adicionada com sucesso!`);
      this.loadBeerTypes();
      this.toggleAddForm();

      // Notifica sales-form para recarregar lista de cervejas
      this.tabRefreshService.notifyMainTabActivated(MainTab.SALES);
    } catch (error) {
      this.showError('Não foi possível adicionar a cerveja.');
      console.error('❌ Erro ao adicionar cerveja:', error);
    }
  }

  /**
   * Verifica se já existe uma cerveja com o nome fornecido
   * MUDANÇA: Usa query SQL direta em vez de gerar ID e comparar
   * 
   * @param name Nome da cerveja a verificar
   * @returns true se o nome já existe
   */
  private beerNameExists(name: string): boolean {
    try {
      const existing = this.dbService.executeQuery(
        'SELECT num_id FROM prd_beer_types WHERE LOWER(desc_name) = LOWER(?)',
        [name.trim()]
      );
      return existing.length > 0;
    } catch (error) {
      console.error('❌ Erro ao verificar nome da cerveja:', error);
      return false;
    }
  }

  // ==================== EDITAR CERVEJA ====================
  /**
   * Abre modal de edição para uma cerveja
   * @param beer Cerveja a ser editada
   */
  openEditDialog(beer: BeerType): void {
    this.currentEditingBeer = beer;
    this.editForm.patchValue({
      name: beer.desc_name,
      description: beer.desc_description,
      color: beer.desc_color
    });
    this.isEditing.set(true);
  }

  /**
   * Fecha o modal de edição
   */
  closeEditDialog(): void {
    this.isEditing.set(false);
    this.currentEditingBeer = null;
    this.editForm.reset({ color: this.DEFAULT_COLOR });
  }

  /**
   * Salva a edição da cerveja no banco de dados
   */
  handleUpdateBeer(): void {
    if (this.editForm.invalid || !this.currentEditingBeer) {
      this.showWarning('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const formValue = this.editForm.value;
    const beerName = formValue.name.trim();

    // Validação: verifica se já existe outra cerveja com este nome
    if (beerName.toLowerCase() !== this.currentEditingBeer.desc_name.toLowerCase() && this.beerNameExists(beerName)) {
      this.showError('Uma cerveja com este nome já existe.');
      return;
    }

    const updatedBeer = {
      desc_name: beerName,
      desc_description: formValue.description?.trim() || `Cerveja ${beerName}`,
      desc_color: formValue.color
    };

    try {
      // UPDATE no banco de dados
      this.dbService.executeRun(
        'UPDATE prd_beer_types SET desc_name = ?, desc_description = ?, desc_color = ? WHERE num_id = ?',
        [updatedBeer.desc_name, updatedBeer.desc_description, updatedBeer.desc_color, this.currentEditingBeer.num_id]
      );

      console.log('✅ Cerveja atualizada:', updatedBeer.desc_name, '(ID:', this.currentEditingBeer.num_id, ')');

      this.showSuccess(`${updatedBeer.desc_name} foi atualizada com sucesso!`);
      this.loadBeerTypes();
      this.closeEditDialog();

      // Notifica sales-form para recarregar lista de cervejas
      this.tabRefreshService.notifyMainTabActivated(MainTab.SALES);
    } catch (error) {
      this.showError('Não foi possível atualizar a cerveja.');
      console.error('❌ Erro ao atualizar cerveja:', error);
    }
  }

  // ==================== REMOVER CERVEJA ====================
  /**
   * Abre dialog de confirmação para deletar cerveja
   * MUDANÇA: Recebe BeerType com id: number
   * MUDANÇA: Permite deletar todas as cervejas (inclusive padrão)
   */
  confirmDelete(beer: BeerType): void {
    this.confirmationService.confirm({
      message: `Você tem certeza que deseja remover a cerveja "${beer.desc_name}"? Todas as vendas relacionadas também serão removidas.`,
      header: 'Confirmação de Exclusão',
      icon: 'pi pi-info-circle',
      acceptLabel: 'Sim, remover',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.handleDeleteBeer(beer);
      }
    });
  }

  /**
   * Deleta a cerveja e suas vendas relacionadas
   * MUDANÇA: beerId agora é number (FK cascade já remove vendas)
   * 
   * @param beer Cerveja a ser removida
   */
  private handleDeleteBeer(beer: BeerType): void {
    try {
      // CASCADE DELETE já configurado no schema remove vendas automaticamente
      // Mas por segurança, fazemos explicitamente:

      // 1. Remove vendas relacionadas
      this.dbService.executeRun(
        'DELETE FROM prd_sales WHERE num_beer_id = ?',
        [beer.num_id]
      );

      // 2. Remove a cerveja
      this.dbService.executeRun(
        'DELETE FROM prd_beer_types WHERE num_id = ?',
        [beer.num_id]
      );

      console.log('✅ Cerveja removida:', beer.desc_name, '(ID:', beer.num_id, ')');

      this.showSuccess(`${beer.desc_name} foi removida com sucesso.`);
      this.loadBeerTypes();

      // Notifica sales-form para recarregar lista de cervejas
      this.tabRefreshService.notifyMainTabActivated(MainTab.SALES);
    } catch (error) {
      this.showError('Não foi possível remover a cerveja.');
      console.error('❌ Erro ao remover cerveja:', error);
    }
  }

  // ==================== MÉTODOS DE MENSAGENS ====================
  /**
   * Exibe mensagem de sucesso
   */
  private showSuccess(message: string): void {
    this.messageService.add({ 
      severity: 'success', 
      summary: 'Sucesso', 
      detail: message,
      life: 4000
    });
  }

  /**
   * Exibe mensagem de aviso
   */
  private showWarning(message: string): void {
    this.messageService.add({ 
      severity: 'warn', 
      summary: 'Atenção', 
      detail: message,
      life: 3000
    });
  }

  /**
   * Exibe mensagem de erro
   */
  private showError(message: string): void {
    this.messageService.add({ 
      severity: 'error', 
      summary: 'Erro', 
      detail: message,
      life: 5000
    });
  }

  // ==================== MÉTODOS AUXILIARES ====================
  /**
   * Retorna o número total de tipos de cerveja
   */
  getTotalBeerTypes(): number {
    return this.beerTypes().length;
  }

  /**
   * Retorna o número de cervejas customizadas (não-padrão)
   */
  getCustomBeerTypesCount(): number {
    return this.beerTypes().filter(beer => !this.isDefaultBeer(beer.num_id)).length;
  }

  /**
   * Verifica se pode adicionar mais cervejas
   * (Útil se houver limite no futuro)
   */
  canAddMoreBeers(): boolean {
    // Por enquanto, sempre pode adicionar
    // Mas pode implementar limite: return this.getTotalBeerTypes() < 20;
    return true;
  }

  /**
   * Retorna lista de cervejas padrão
   */
  getDefaultBeers(): BeerType[] {
    return this.beerTypes().filter(beer => this.isDefaultBeer(beer.num_id));
  }

  /**
   * Retorna lista de cervejas customizadas
   */
  getCustomBeers(): BeerType[] {
    return this.beerTypes().filter(beer => !this.isDefaultBeer(beer.num_id));
  }

  /**
   * Valida se uma cor é válida (formato hexadecimal)
   */
  isValidColor(color: string): boolean {
    return /^#[0-9A-F]{6}$/i.test(color);
  }

  /**
   * Normaliza a cor para formato hexadecimal
   */
  normalizeColor(color: string): string {
    if (!color) return this.DEFAULT_COLOR;
    
    // Remove espaços
    color = color.trim();
    
    // Adiciona # se não tiver
    if (!color.startsWith('#')) {
      color = '#' + color;
    }
    
    // Valida formato
    if (!this.isValidColor(color)) {
      return this.DEFAULT_COLOR;
    }
    
    return color.toUpperCase();
  }


  
}