

// src/app/features/sales-form/sales-form.component.ts
import { Component, OnInit, inject, signal, WritableSignal, computed, EffectRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
// import { v4 as uuidv4 } from 'uuid'; // Para gerar IDs únicos

// PrimeNG Modules
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';

// App Services and Models
import { BeerType, Sale } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

@Component({
  selector: 'app-sales-form',
  standalone: true,
  imports: [
    CommonModule,
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
  // Injeção de dependências
  private dbService = inject(DatabaseService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  // Sinais para estado reativo
  beerTypes: WritableSignal<BeerType[]> = signal([]);
  saleForm: FormGroup;
  
  // Sinal computado para o resumo da venda
  saleSummary = computed(() => {
    if (!this.saleForm || !this.saleForm.valid) {
      return null;
    }
    const { beerId, cupSize, quantity } = this.saleForm.value;
    const selectedBeer = this.beerTypes().find(b => b.id === beerId);
    if (!selectedBeer) {
      return null;
    }
    const totalVolume = (cupSize * quantity) / 1000; // Em litros

    return {
      beerName: selectedBeer.name,
      cupSize,
      quantity,
      totalVolume: totalVolume.toFixed(1)
    };
  });

  constructor() {
    this.saleForm = this.fb.group({
      beerId: [null, Validators.required],
      cupSize: [300, Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]]
    });

    // Reage à prontidão do banco de dados para carregar as cervejas
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadBeerTypes();
      }
    });
  }

  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadBeerTypes();
    }
  }

  loadBeerTypes(): void {
    const beers = this.dbService.executeQuery('SELECT * FROM beer_types ORDER BY name');
    this.beerTypes.set(beers);
  }

  // Métodos para manipulação do formulário
  selectBeer(beerId: string): void {
    this.beerId.setValue(beerId);
  }

  selectCupSize(size: 300 | 500): void {
    this.cupSize.setValue(size);
  }

  changeQuantity(amount: number): void {
    const currentQuantity = this.quantity.value;
    const newQuantity = currentQuantity + amount;
    if (newQuantity >= 1) {
      this.quantity.setValue(newQuantity);
    }
  }

  // Getters para fácil acesso aos FormControls no template
  get beerId(): FormControl {
    return this.saleForm.get('beerId') as FormControl;
  }
  get cupSize(): FormControl {
    return this.saleForm.get('cupSize') as FormControl;
  }
  get quantity(): FormControl {
    return this.saleForm.get('quantity') as FormControl;
  }
  
  handleSale(): void {
    if (this.saleForm.invalid) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Selecione uma cerveja para continuar.' });
      return;
    }
    
    const { beerId, cupSize, quantity } = this.saleForm.value;
    const selectedBeer = this.beerTypes().find(b => b.id === beerId);

    if (!selectedBeer) {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Cerveja selecionada não encontrada.' });
        return;
    }

    const newSale: Sale = {
      id: this.generateSequentialId(), // Geração do ID sequencial,
      beerId: selectedBeer.id,
      beerName: selectedBeer.name,
      cupSize,
      quantity,
      timestamp: new Date().toISOString(),
      totalVolume: cupSize * quantity,
    };

    try {
        this.dbService.executeRun(
            'INSERT INTO sales (id, beerId, beerName, cupSize, quantity, timestamp, totalVolume) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [newSale.id, newSale.beerId, newSale.beerName, newSale.cupSize, newSale.quantity, newSale.timestamp, newSale.totalVolume]
        );
        
        const totalLiters = (newSale.totalVolume / 1000).toFixed(1);
        this.messageService.add({ 
            severity: 'success', 
            summary: 'Venda Registrada!', 
            detail: `${quantity}x ${selectedBeer.name} (${cupSize}ml) - Total: ${totalLiters}L` 
        });

        this.saleForm.reset({
            beerId: null,
            cupSize: 300,
            quantity: 1
        });
    } catch(error) {
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível registrar a venda.' });
        console.error("Erro ao registrar venda:", error);
    }
  }

  generateSequentialId(): number {
    // Obter todos os IDs existentes no banco de dados
    const existingIds = this.dbService.executeQuery('SELECT id FROM sales');
    const idNumbers = existingIds.map((sale: { id: number }) => sale.id);
  
    // Determinar o próximo ID sequencial
    const nextId = idNumbers.length > 0 ? Math.max(...idNumbers) + 1 : 1;
  
    return nextId;
  }
}
