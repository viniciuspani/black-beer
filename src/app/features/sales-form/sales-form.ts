// src/app/features/sales-form/sales-form.ts
import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';

// PrimeNG Modules
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';

// App Services and Models
import { BeerType, Sale, CUP_SIZES, CupSize } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

interface SaleSummary {
  beerName: string;
  cupSize: number;
  quantity: number;
  totalVolume: string;
}

@Component({
  selector: 'app-sales-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    ToastModule,
    TagModule
  ],
  providers: [MessageService],
  templateUrl: './sales-form.html',
  styleUrls: ['./sales-form.scss']
})
export class SalesFormComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);

  // ==================== CONSTANTES ====================
  readonly cupSizes: readonly CupSize[] = [CUP_SIZES.SMALL, CUP_SIZES.MEDIUM, CUP_SIZES.LARGE] as const;
  private readonly DEFAULT_CUP_SIZE: CupSize = CUP_SIZES.SMALL;
  private readonly DEFAULT_QUANTITY = 1;
  private readonly ML_TO_LITERS = 1000;

  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  readonly beerTypes = signal<BeerType[]>([]);
  readonly saleForm: FormGroup;
  
  // ==================== COMPUTED SIGNAL PARA RESUMO ====================
  /**
   * Calcula o resumo da venda em tempo real
   * Atualiza automaticamente quando o formulário muda
   */
  readonly saleSummary = computed<SaleSummary | null>(() => {
    if (!this.saleForm?.valid) return null;

    const { beerId, cupSize, quantity } = this.saleForm.value;
    
    // MUDANÇA: beerId agora é number, não string
    const selectedBeer = this.beerTypes().find(b => b.id === beerId);
    
    if (!selectedBeer) return null;

    const totalVolume = (cupSize * quantity) / this.ML_TO_LITERS;

    return {
      beerName: selectedBeer.name,
      cupSize,
      quantity,
      totalVolume: totalVolume.toFixed(1)
    };
  });

  // ==================== FORM CONTROL GETTERS TIPADOS ====================
  /**
   * MUDANÇA: beerId agora é FormControl<number | null>
   * Antes era string | null
   */
  get beerId(): FormControl<number | null> {
    return this.saleForm.get('beerId') as FormControl<number | null>;
  }

  get cupSize(): FormControl<CupSize> {
    return this.saleForm.get('cupSize') as FormControl<CupSize>;
  }

  get quantity(): FormControl<number> {
    return this.saleForm.get('quantity') as FormControl<number>;
  }

  // ==================== CONSTRUCTOR ====================
  constructor() {
    this.saleForm = this.createSaleForm();
    this.setupDatabaseEffect();
  }

  // ==================== LIFECYCLE HOOKS ====================
  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadBeerTypes();
    }
  }

  // ==================== MÉTODOS PRIVADOS DE INICIALIZAÇÃO ====================
  /**
   * Cria o formulário reativo
   * MUDANÇA: beerId agora é number | null em vez de string | null
   */
  private createSaleForm(): FormGroup {
    return this.fb.group({
      beerId: [null as number | null, Validators.required],
      cupSize: [this.DEFAULT_CUP_SIZE, Validators.required],
      quantity: [this.DEFAULT_QUANTITY, [Validators.required, Validators.min(1)]]
    });
  }

  /**
   * Configura effect para carregar dados quando DB estiver pronto
   */
  private setupDatabaseEffect(): void {
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadBeerTypes();
      }
    });
  }

  // ==================== CARREGAMENTO DE DADOS ====================
  /**
   * Carrega tipos de cerveja do banco
   * MUDANÇA: Agora retorna BeerType com id: number
   */
  private loadBeerTypes(): void {
    try {
      const beers = this.dbService.executeQuery(
        'SELECT * FROM beer_types ORDER BY name'
      );
      
      // Garante que IDs são numbers
      const typedBeers: BeerType[] = beers.map(beer => ({
        id: Number(beer.id),              // ← Conversão explícita para number
        name: beer.name,
        color: beer.color,
        description: beer.description
      }));
      
      this.beerTypes.set(typedBeers);
      console.log('✅ Tipos de cerveja carregados:', typedBeers.length);
    } catch (error) {
      console.error('❌ Erro ao carregar tipos de cerveja:', error);
      this.showError('Não foi possível carregar os tipos de cerveja.');
    }
  }

  // ==================== MÉTODOS PÚBLICOS DE MANIPULAÇÃO DO FORM ====================
  /**
   * Seleciona uma cerveja
   * MUDANÇA: beerId agora é number
   */
  selectBeer(beerId: number): void {
    this.beerId.setValue(beerId);
  }

  /**
   * Seleciona o tamanho do copo
   */
  selectCupSize(size: CupSize): void {
    this.cupSize.setValue(size);
  }

  /**
   * Incrementa ou decrementa a quantidade
   */
  changeQuantity(amount: number): void {
    const newQuantity = this.quantity.value + amount;
    
    if (newQuantity >= 1) {
      this.quantity.setValue(newQuantity);
    }
  }

  // ==================== HANDLER PRINCIPAL DE VENDA ====================
  /**
   * Processa a venda quando o formulário é submetido
   * MUDANÇA PRINCIPAL: Não gera mais ID manualmente (usa AUTOINCREMENT)
   */
  handleSale(): void {
    if (!this.validateForm()) return;

    const selectedBeer = this.getSelectedBeer();
    if (!selectedBeer) return;

    const newSale = this.createSaleObject(selectedBeer);
    
    this.saveSale(newSale);
  }

  // ==================== MÉTODOS PRIVADOS DE VALIDAÇÃO ====================
  /**
   * Valida o formulário antes de salvar
   */
  private validateForm(): boolean {
    if (this.saleForm.invalid) {
      this.showWarning('Selecione uma cerveja para continuar.');
      return false;
    }
    return true;
  }

  /**
   * Obtém a cerveja selecionada
   * MUDANÇA: Comparação com number agora
   */
  private getSelectedBeer(): BeerType | undefined {
    const { beerId } = this.saleForm.value;
    
    // beerId agora é number
    const selectedBeer = this.beerTypes().find(b => b.id === beerId);

    if (!selectedBeer) {
      this.showError('Cerveja selecionada não encontrada.');
      console.error('❌ Beer ID não encontrado:', beerId);
    }

    return selectedBeer;
  }

  /**
   * Cria o objeto Sale a partir dos dados do formulário
   * MUDANÇA CRÍTICA: 
   * - id não é mais gerado manualmente (será AUTOINCREMENT)
   * - beerId agora é number
   */
  private createSaleObject(beer: BeerType): Omit<Sale, 'id'> {
    const { cupSize, quantity } = this.saleForm.value;
    const totalVolume = cupSize * quantity;

    // IMPORTANTE: Não incluímos 'id' aqui
    // O banco vai gerar automaticamente via AUTOINCREMENT
    return {
      beerId: beer.id,              // ← number agora (FK para beer_types)
      beerName: beer.name,
      cupSize,
      quantity,
      timestamp: new Date().toISOString(),
      totalVolume,
    };
  }

  /**
   * Salva a venda no banco de dados
   */
  private saveSale(sale: Omit<Sale, 'id'>): void {
    try {
      this.insertSaleIntoDatabase(sale);
      
      // Obtém o ID gerado pelo banco
      const insertedId = this.dbService.getLastInsertId();
      console.log('✅ Venda registrada com ID:', insertedId);
      
      this.showSuccessMessage({
        ...sale,
        id: insertedId
      } as Sale);
      
      this.resetForm();
    } catch (error) {
      this.handleSaleError(error);
    }
  }

  /**
   * Insere a venda no banco de dados
   * MUDANÇA: Não inserimos ID, deixamos o AUTOINCREMENT fazer o trabalho
   * MUDANÇA: beerId agora é number
   */
  private insertSaleIntoDatabase(sale: Omit<Sale, 'id'>): void {
    const query = `
      INSERT INTO sales (beerId, beerName, cupSize, quantity, timestamp, totalVolume) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    // MUDANÇA: Removemos o ID da inserção
    // O banco gera automaticamente via AUTOINCREMENT
    this.dbService.executeRun(query, [
      sale.beerId,        // ← number agora
      sale.beerName,
      sale.cupSize,
      sale.quantity,
      sale.timestamp,
      sale.totalVolume
    ]);
  }

  /**
   * Reseta o formulário para valores padrão
   */
  private resetForm(): void {
    this.saleForm.reset({
      beerId: null,
      cupSize: this.DEFAULT_CUP_SIZE,
      quantity: this.DEFAULT_QUANTITY
    });
  }

  // ==================== MÉTODOS DE MENSAGENS ====================
  /**
   * Exibe mensagem de sucesso após registrar venda
   */
  private showSuccessMessage(sale: Sale): void {
    const totalLiters = (sale.totalVolume / this.ML_TO_LITERS).toFixed(1);
    const detail = `${sale.quantity}x ${sale.beerName} (${sale.cupSize}ml) - Total: ${totalLiters}L`;
    
    this.messageService.add({ 
      severity: 'success', 
      summary: 'Venda Registrada!', 
      detail,
      life: 4000
    });
  }

  /**
   * Exibe aviso ao usuário
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
   * Exibe erro ao usuário
   */
  private showError(message: string): void {
    this.messageService.add({ 
      severity: 'error', 
      summary: 'Erro', 
      detail: message,
      life: 5000
    });
  }

  /**
   * Trata erros ao salvar venda
   */
  private handleSaleError(error: unknown): void {
    this.showError('Não foi possível registrar a venda.');
    console.error('❌ Erro ao registrar venda:', error);
  }

  // ==================== MÉTODOS AUXILIARES ====================
  /**
   * Verifica se há tipos de cerveja carregados
   */
  hasBeerTypes(): boolean {
    return this.beerTypes().length > 0;
  }

  /**
   * Retorna o nome da cerveja selecionada (para debugging)
   */
  getSelectedBeerName(): string {
    const beerId = this.beerId.value;
    if (!beerId) return 'Nenhuma';
    
    const beer = this.beerTypes().find(b => b.id === beerId);
    return beer?.name || 'Desconhecida';
  }
}