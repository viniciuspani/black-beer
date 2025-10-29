// src/app/features/beer-management/beer-management.ts
import { Component, OnInit, inject, signal, WritableSignal, effect } from '@angular/core';
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
import { ConfirmationService, MessageService } from 'primeng/api';

// App Services and Models
import { BeerType } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

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
    ToastModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './beer-management.html',
  styleUrls: ['./beer-management.scss']
})
export class BeerManagementComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private dbService = inject(DatabaseService);
  private fb = inject(FormBuilder);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  beerTypes: WritableSignal<BeerType[]> = signal([]);
  isAdding = signal(false);
  beerForm: FormGroup;

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

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Inicialização do formulário reativo
    this.beerForm = this.fb.group({
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
        'SELECT * FROM beer_types ORDER BY name'
      );
      
      // Conversão explícita para garantir type safety
      const typedBeers: BeerType[] = beers.map(beer => ({
        id: Number(beer.id),           // ← Garante que é number
        name: beer.name,
        color: beer.color,
        description: beer.description
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
      name: beerName,
      description: formValue.description?.trim() || `Cerveja ${beerName}`,
      color: formValue.color
    };

    try {
      // INSERT sem ID - banco gera via AUTOINCREMENT
      this.dbService.executeRun(
        'INSERT INTO beer_types (name, description, color) VALUES (?, ?, ?)',
        [newBeer.name, newBeer.description, newBeer.color]
      );

      // Obtém o ID gerado pelo banco
      const insertedId = this.dbService.getLastInsertId();
      console.log('✅ Cerveja adicionada com ID:', insertedId);

      this.showSuccess(`${newBeer.name} adicionada com sucesso!`);
      this.loadBeerTypes();
      this.toggleAddForm();
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
        'SELECT id FROM beer_types WHERE LOWER(name) = LOWER(?)',
        [name.trim()]
      );
      return existing.length > 0;
    } catch (error) {
      console.error('❌ Erro ao verificar nome da cerveja:', error);
      return false;
    }
  }

  // ==================== REMOVER CERVEJA ====================
  /**
   * Abre dialog de confirmação para deletar cerveja
   * MUDANÇA: Recebe BeerType com id: number
   */
  confirmDelete(beer: BeerType): void {
    // Previne deleção de cervejas padrão
    if (this.isDefaultBeer(beer.id)) {
      this.showWarning('Cervejas padrão não podem ser removidas.');
      return;
    }

    this.confirmationService.confirm({
      message: `Você tem certeza que deseja remover a cerveja "${beer.name}"? Todas as vendas relacionadas também serão removidas.`,
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
        'DELETE FROM sales WHERE beerId = ?', 
        [beer.id]  // ← number agora
      );
      
      // 2. Remove a cerveja
      this.dbService.executeRun(
        'DELETE FROM beer_types WHERE id = ?', 
        [beer.id]  // ← number agora
      );

      console.log('✅ Cerveja removida:', beer.name, '(ID:', beer.id, ')');
      
      this.showSuccess(`${beer.name} foi removida com sucesso.`);
      this.loadBeerTypes();
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
    return this.beerTypes().filter(beer => !this.isDefaultBeer(beer.id)).length;
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
    return this.beerTypes().filter(beer => this.isDefaultBeer(beer.id));
  }

  /**
   * Retorna lista de cervejas customizadas
   */
  getCustomBeers(): BeerType[] {
    return this.beerTypes().filter(beer => !this.isDefaultBeer(beer.id));
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