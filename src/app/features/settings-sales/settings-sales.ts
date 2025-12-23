// src/app/features/settings-sales/settings-sales.ts
import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

// App
import { BeerType } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

interface BeerStock {
  beerId: number;
  beerName: string;
  color: string;
  quantidadeLitros: number;
  originalQuantity: number; // Para controlar mudanças
}

/**
 * Componente para gerenciar estoque de cervejas por evento
 * Permite configurar quantidade inicial de litros e alertas de estoque baixo
 */
@Component({
  selector: 'app-settings-sales',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputNumberModule,
    ToastModule,
    TagModule,
    TooltipModule
  ],
  providers: [MessageService],
  templateUrl: './settings-sales.html',
  styleUrls: ['./settings-sales.scss']
})
export class SettingsSalesComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly messageService = inject(MessageService);

  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  readonly beerTypes = signal<BeerType[]>([]);
  readonly beerStocks = signal<BeerStock[]>([]);
  readonly minLitersAlert = signal<number>(5.0);
  readonly originalMinLiters = signal<number>(5.0);
  readonly stockAlerts = signal<any[]>([]);
  readonly isSaving = signal<boolean>(false);

  // ==================== CONSTANTES ====================
  private readonly DEFAULT_MIN_LITERS = 5.0;
  private readonly ML_TO_LITERS = 1000;

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Effect para carregar dados quando DB estiver pronto
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadData();
      }
    });
  }

  // ==================== LIFECYCLE HOOKS ====================
  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadData();
    }
  }

  // ==================== CARREGAMENTO DE DADOS ====================
  /**
   * Carrega todos os dados necessários
   */
  private loadData(): void {
    this.loadBeerTypes();
    this.loadAlertConfig();
    this.checkStockAlerts();
  }

  /**
   * Carrega tipos de cerveja do banco
   */
  private loadBeerTypes(): void {
    try {
      const beers = this.dbService.executeQuery(
        'SELECT * FROM beer_types ORDER BY name'
      );

      const typedBeers: BeerType[] = beers.map(beer => ({
        id: Number(beer.id),
        name: beer.name,
        color: beer.color,
        description: beer.description
      }));

      this.beerTypes.set(typedBeers);
      this.loadBeerStocks(typedBeers);
    } catch (error) {
      console.error('❌ Erro ao carregar tipos de cerveja:', error);
      this.showError('Não foi possível carregar os tipos de cerveja.');
    }
  }

  /**
   * Carrega estoques configurados para cada cerveja
   */
  private loadBeerStocks(beers: BeerType[]): void {
    try {
      const stocks: BeerStock[] = beers.map(beer => {
        const eventStock = this.dbService.getEventStockByBeerId(beer.id);
        const quantity = eventStock?.quantidadeLitros || 0;

        return {
          beerId: beer.id,
          beerName: beer.name,
          color: beer.color,
          quantidadeLitros: quantity,
          originalQuantity: quantity
        };
      });

      this.beerStocks.set(stocks);
      console.log('✅ Estoques carregados:', stocks);
    } catch (error) {
      console.error('❌ Erro ao carregar estoques:', error);
      this.showError('Não foi possível carregar os estoques.');
    }
  }

  /**
   * Carrega configuração de alerta de estoque baixo
   */
  private loadAlertConfig(): void {
    try {
      const config = this.dbService.getStockAlertConfig();
      const minLiters = config?.minLiters || this.DEFAULT_MIN_LITERS;

      this.minLitersAlert.set(minLiters);
      this.originalMinLiters.set(minLiters);
      console.log('✅ Configuração de alerta carregada:', minLiters);
    } catch (error) {
      console.error('❌ Erro ao carregar configuração de alerta:', error);
    }
  }

  /**
   * Verifica se há alertas de estoque baixo
   */
  checkStockAlerts(): void {
    try {
      const alerts = this.dbService.getStockAlerts();
      this.stockAlerts.set(alerts);

      if (alerts.length > 0) {
        console.log('⚠️ Alertas de estoque:', alerts);
      }
    } catch (error) {
      console.error('❌ Erro ao verificar alertas:', error);
    }
  }

  // ==================== MÉTODOS PÚBLICOS ====================
  /**
   * Salva a quantidade de litros de uma cerveja
   */
  saveStockForBeer(stock: BeerStock): void {
    try {
      this.dbService.setEventStock(
        stock.beerId,
        stock.beerName,
        stock.quantidadeLitros
      );

      // Atualiza valor original
      const updatedStocks = this.beerStocks().map(s =>
        s.beerId === stock.beerId
          ? { ...s, originalQuantity: stock.quantidadeLitros }
          : s
      );
      this.beerStocks.set(updatedStocks);

      this.showSuccess(`Estoque de ${stock.beerName} salvo: ${stock.quantidadeLitros}L`);
      this.checkStockAlerts();
    } catch (error) {
      console.error('❌ Erro ao salvar estoque:', error);
      this.showError(`Não foi possível salvar o estoque de ${stock.beerName}`);
    }
  }

  /**
   * Salva todos os estoques de uma vez
   */
  saveAllStocks(): void {
    this.isSaving.set(true);
    let savedCount = 0;

    try {
      this.beerStocks().forEach(stock => {
        if (stock.quantidadeLitros !== stock.originalQuantity) {
          this.dbService.setEventStock(
            stock.beerId,
            stock.beerName,
            stock.quantidadeLitros
          );
          savedCount++;
        }
      });

      // Atualiza valores originais
      const updatedStocks = this.beerStocks().map(s => ({
        ...s,
        originalQuantity: s.quantidadeLitros
      }));
      this.beerStocks.set(updatedStocks);

      if (savedCount > 0) {
        this.showSuccess(`${savedCount} estoque(s) salvo(s) com sucesso!`);
        this.checkStockAlerts();
      } else {
        this.showInfo('Nenhuma alteração detectada.');
      }
    } catch (error) {
      console.error('❌ Erro ao salvar estoques:', error);
      this.showError('Erro ao salvar estoques.');
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Salva configuração de alerta de estoque baixo
   */
  saveAlertConfig(): void {
    try {
      const minLiters = this.minLitersAlert();

      if (minLiters < 0) {
        this.showWarning('O valor mínimo não pode ser negativo.');
        return;
      }

      this.dbService.setStockAlertConfig(minLiters);
      this.originalMinLiters.set(minLiters);
      this.showSuccess(`Alerta configurado para ${minLiters}L`);
      this.checkStockAlerts();
    } catch (error) {
      console.error('❌ Erro ao salvar configuração de alerta:', error);
      this.showError('Não foi possível salvar a configuração de alerta.');
    }
  }

  /**
   * Reseta o estoque de uma cerveja (remove do banco, volta ao modo normal)
   */
  resetStockForBeer(stock: BeerStock): void {
    try {
      if (stock.originalQuantity === 0) {
        this.showInfo(`${stock.beerName} já está sem controle de estoque.`);
        return;
      }

      this.dbService.removeEventStock(stock.beerId);

      // Atualiza para 0
      const updatedStocks = this.beerStocks().map(s =>
        s.beerId === stock.beerId
          ? { ...s, quantidadeLitros: 0, originalQuantity: 0 }
          : s
      );
      this.beerStocks.set(updatedStocks);

      this.showSuccess(`Controle de estoque removido para ${stock.beerName}`);
      this.checkStockAlerts();
    } catch (error) {
      console.error('❌ Erro ao resetar estoque:', error);
      this.showError('Erro ao resetar estoque.');
    }
  }

  // ==================== MÉTODOS AUXILIARES ====================
  /**
   * Verifica se um estoque foi modificado
   */
  isStockModified(stock: BeerStock): boolean {
    return stock.quantidadeLitros !== stock.originalQuantity;
  }

  /**
   * Verifica se a configuração de alerta foi modificada
   */
  isAlertConfigModified(): boolean {
    return this.minLitersAlert() !== this.originalMinLiters();
  }

  /**
   * Verifica se algum estoque foi modificado
   */
  hasModifications(): boolean {
    return this.beerStocks().some(stock => this.isStockModified(stock));
  }

  /**
   * Retorna o status da cerveja (Normal, Controle Ativo, Alerta)
   */
  getBeerStatus(stock: BeerStock): 'normal' | 'active' | 'alert' {
    if (stock.quantidadeLitros === 0) return 'normal';
    if (stock.quantidadeLitros < this.minLitersAlert()) return 'alert';
    return 'active';
  }

  /**
   * Retorna a severidade do badge de status
   */
  getStatusSeverity(status: 'normal' | 'active' | 'alert'): 'secondary' | 'success' | 'danger' {
    switch (status) {
      case 'normal': return 'secondary';
      case 'active': return 'success';
      case 'alert': return 'danger';
    }
  }

  /**
   * Retorna o texto do status
   */
  getStatusText(status: 'normal' | 'active' | 'alert'): string {
    switch (status) {
      case 'normal': return 'Sem Controle';
      case 'active': return 'Controle Ativo';
      case 'alert': return 'Estoque Baixo!';
    }
  }

  // ==================== MÉTODOS DE MENSAGENS ====================
  private showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Sucesso',
      detail: message,
      life: 4000
    });
  }

  private showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erro',
      detail: message,
      life: 5000
    });
  }

  private showWarning(message: string): void {
    this.messageService.add({
      severity: 'warn',
      summary: 'Atenção',
      detail: message,
      life: 3000
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
