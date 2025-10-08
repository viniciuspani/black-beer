import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';

// PrimeNG Modules
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';

// App Services and Models
import { BeerType, Sale } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

interface SaleSummary {
  beerName: string;
  cupSize: number;
  quantity: number;
  totalVolume: string;
}

type CupSize = 300 | 500;

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
  // Injeção de dependências (moderna sintaxe)
  private readonly dbService = inject(DatabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);

  // Constantes
  readonly cupSizes: readonly CupSize[] = [300, 500] as const;
  private readonly DEFAULT_CUP_SIZE: CupSize = 300;
  private readonly DEFAULT_QUANTITY = 1;
  private readonly ML_TO_LITERS = 1000;

  // Sinais para estado reativo
  readonly beerTypes = signal<BeerType[]>([]);
  readonly saleForm: FormGroup;
  
  // Sinal computado para o resumo da venda
  readonly saleSummary = computed<SaleSummary | null>(() => {
    if (!this.saleForm?.valid) return null;

    const { beerId, cupSize, quantity } = this.saleForm.value;
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

  // FormControl getters tipados
  get beerId(): FormControl<string | null> {
    return this.saleForm.get('beerId') as FormControl<string | null>;
  }

  get cupSize(): FormControl<CupSize> {
    return this.saleForm.get('cupSize') as FormControl<CupSize>;
  }

  get quantity(): FormControl<number> {
    return this.saleForm.get('quantity') as FormControl<number>;
  }

  constructor() {
    this.saleForm = this.createSaleForm();
    this.setupDatabaseEffect();
  }

  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadBeerTypes();
    }
  }

  // Métodos privados de inicialização
  private createSaleForm(): FormGroup {
    return this.fb.group({
      beerId: [null as string | null, Validators.required],
      cupSize: [this.DEFAULT_CUP_SIZE, Validators.required],
      quantity: [this.DEFAULT_QUANTITY, [Validators.required, Validators.min(1)]]
    });
  }

  private setupDatabaseEffect(): void {
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadBeerTypes();
      }
    });
  }

  // Carregamento de dados
  private loadBeerTypes(): void {
    const beers = this.dbService.executeQuery(
      'SELECT * FROM beer_types ORDER BY name'
    );
    this.beerTypes.set(beers);
  }

  // Métodos públicos para manipulação do formulário
  selectBeer(beerId: string): void {
    this.beerId.setValue(beerId);
  }

  selectCupSize(size: CupSize): void {
    this.cupSize.setValue(size);
  }

  changeQuantity(amount: number): void {
    const newQuantity = this.quantity.value + amount;
    
    if (newQuantity >= 1) {
      this.quantity.setValue(newQuantity);
    }
  }

  // Handler principal de venda
  handleSale(): void {
    if (!this.validateForm()) return;

    const selectedBeer = this.getSelectedBeer();
    if (!selectedBeer) return;

    const newSale = this.createSaleObject(selectedBeer);
    
    this.saveSale(newSale);
  }

  // Métodos privados de validação e processamento
  private validateForm(): boolean {
    if (this.saleForm.invalid) {
      this.showWarning('Selecione uma cerveja para continuar.');
      return false;
    }
    return true;
  }

  private getSelectedBeer(): BeerType | undefined {
    const { beerId } = this.saleForm.value;
    const selectedBeer = this.beerTypes().find(b => b.id === beerId);

    if (!selectedBeer) {
      this.showError('Cerveja selecionada não encontrada.');
    }

    return selectedBeer;
  }

  private createSaleObject(beer: BeerType): Sale {
    const { cupSize, quantity } = this.saleForm.value;
    const totalVolume = cupSize * quantity;

    return {
      id: this.generateSequentialId(),
      beerId: beer.id,
      beerName: beer.name,
      cupSize,
      quantity,
      timestamp: new Date().toISOString(),
      totalVolume,
    };
  }

  private saveSale(sale: Sale): void {
    try {
      this.insertSaleIntoDatabase(sale);
      this.showSuccessMessage(sale);
      this.resetForm();
    } catch (error) {
      this.handleSaleError(error);
    }
  }

  private insertSaleIntoDatabase(sale: Sale): void {
    const query = `
      INSERT INTO sales (id, beerId, beerName, cupSize, quantity, timestamp, totalVolume) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    this.dbService.executeRun(query, [
      sale.id,
      sale.beerId,
      sale.beerName,
      sale.cupSize,
      sale.quantity,
      sale.timestamp,
      sale.totalVolume
    ]);
  }

  private generateSequentialId(): number {
    const existingIds = this.dbService.executeQuery('SELECT id FROM sales');
    
    if (existingIds.length === 0) return 1;
    
    const maxId = Math.max(...existingIds.map(sale => sale.id));
    return maxId + 1;
  }

  private resetForm(): void {
    this.saleForm.reset({
      beerId: null,
      cupSize: this.DEFAULT_CUP_SIZE,
      quantity: this.DEFAULT_QUANTITY
    });
  }

  // Métodos de mensagens
  private showSuccessMessage(sale: Sale): void {
    const totalLiters = (sale.totalVolume / this.ML_TO_LITERS).toFixed(1);
    const detail = `${sale.quantity}x ${sale.beerName} (${sale.cupSize}ml) - Total: ${totalLiters}L`;
    
    this.messageService.add({ 
      severity: 'success', 
      summary: 'Venda Registrada!', 
      detail 
    });
  }

  private showWarning(message: string): void {
    this.messageService.add({ 
      severity: 'warn', 
      summary: 'Atenção', 
      detail: message 
    });
  }

  private showError(message: string): void {
    this.messageService.add({ 
      severity: 'error', 
      summary: 'Erro', 
      detail: message 
    });
  }

  private handleSaleError(error: unknown): void {
    this.showError('Não foi possível registrar a venda.');
    console.error('Erro ao registrar venda:', error);
  }
}