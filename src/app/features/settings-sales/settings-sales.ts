// src/app/features/settings-sales/settings-sales.ts
import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
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
import { SelectButtonModule } from 'primeng/selectbutton';

// App
import { BeerType } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';
import { TabRefreshService, SettingsSubTab } from '../../core/services/tab-refresh.service';
import { EventService } from '../../core/services/event.service';
import { Event } from '../../core/models/event.model';

interface BeerStock {
  beerId: number;
  beerName: string;
  color: string;
  quantidadeLitros: number;
  minLitersAlert: number; // Limite individual de alerta
  originalQuantity: number; // Para controlar mudanças
  originalMinLitersAlert: number; // Para controlar mudanças no limite
}

interface BeerPrice {
  beerId: number;
  beerName: string;
  color: string;
  price300ml: number;
  price500ml: number;
  price1000ml: number;
  originalPrice300ml: number; // Para controlar mudanças
  originalPrice500ml: number;
  originalPrice1000ml: number;
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
    TooltipModule,
    SelectButtonModule
  ],
  providers: [MessageService],
  templateUrl: './settings-sales.html',
  styleUrls: ['./settings-sales.scss']
})
export class SettingsSalesComponent implements OnInit, OnDestroy {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly eventService = inject(EventService);
  private readonly messageService = inject(MessageService);
  private readonly tabRefreshService = inject(TabRefreshService);

  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  readonly beerTypes = signal<BeerType[]>([]);
  readonly beerStocks = signal<BeerStock[]>([]);
  readonly beerPrices = signal<BeerPrice[]>([]);
  readonly minLitersAlert = signal<number>(5.0);
  readonly originalMinLiters = signal<number>(5.0);
  readonly stockAlerts = signal<any[]>([]);
  readonly isSaving = signal<boolean>(false);

  // Event management signals
  readonly selectedEventId = signal<number | null>(null);
  readonly availableEvents = computed(() => this.eventService.activeEvents());

  // ==================== CONSTANTES ====================
  private readonly DEFAULT_MIN_LITERS = 5.0;

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Effect para carregar dados quando DB estiver pronto
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadData();
      }
    });

    // Subscription para escutar quando a aba de Settings-Sales é ativada
    this.tabRefreshService.onSettingsSubTabActivated(SettingsSubTab.SALES).subscribe(() => {
      console.log('🔔 Settings-Sales: Aba ativada, atualizando dados...');
      this.refreshData();
    });
  }

  // ==================== LIFECYCLE HOOKS ====================
  async ngOnInit(): Promise<void> {
    // Carrega eventos disponíveis
    await this.eventService.loadEvents();

    if (this.dbService.isDbReady()) {
      this.loadData();
    }
  }

  ngOnDestroy(): void {
    // Cleanup se necessário
  }

  /**
   * Método público para forçar atualização dos dados
   * Chamado pelo componente Menu quando a aba é ativada
   */
  public refreshData(): void {
    console.log('🔄 Atualizando dados de settings-sales...');
    this.loadData();
  }

  // ==================== EVENT MANAGEMENT ====================
  /**
   * Callback quando o evento selecionado muda
   * Recarrega os dados filtrados pelo evento
   */
  onEventChange(eventId: number | null): void {
    this.selectedEventId.set(eventId);
    console.log('📅 Evento alterado:', eventId || 'Sem evento (geral)');
    this.loadData();
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
      this.loadBeerPrices(typedBeers);
    } catch (error) {
      console.error('❌ Erro ao carregar tipos de cerveja:', error);
      this.showError('Não foi possível carregar os tipos de cerveja.');
    }
  }

  /**
   * Carrega estoques configurados para cada cerveja
   * IMPORTANTE: originalQuantity > 0 OU existência de eventStock indica controle ativo
   * Se eventStock existe no banco, há controle ativo, mesmo que quantidade seja 0
   */
  private loadBeerStocks(beers: BeerType[]): void {
    try {
      const eventId = this.selectedEventId();
      const stocks: BeerStock[] = beers.map(beer => {
        const eventStock = this.dbService.getEventStockByBeerId(beer.id, eventId);

        // Se não há registro no banco, não há controle ativo
        if (!eventStock) {
          return {
            beerId: beer.id,
            beerName: beer.name,
            color: beer.color,
            quantidadeLitros: 0,
            minLitersAlert: 5.0,
            originalQuantity: 0,
            originalMinLitersAlert: 5.0
          };
        }

        // Se há registro no banco, há controle ativo (mesmo que quantidade seja 0)
        // Para indicar controle ativo quando quantidade é 0, usamos um valor sentinela
        const quantity = eventStock.quantidadeLitros;
        const minAlert = eventStock.minLitersAlert || 5.0;

        // SOLUÇÃO: Se quantidade é 0 mas há registro no banco,
        // originalQuantity deve ser > 0 para indicar controle ativo
        // Usamos 0.001 como sentinela (imperceptível mas > 0)
        const originalQty = quantity === 0 ? 0.001 : quantity;

        return {
          beerId: beer.id,
          beerName: beer.name,
          color: beer.color,
          quantidadeLitros: quantity,
          minLitersAlert: minAlert,
          originalQuantity: originalQty,
          originalMinLitersAlert: minAlert
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
   * Carrega preços configurados para cada cerveja
   */
  private loadBeerPrices(beers: BeerType[]): void {
    try {
      const eventId = this.selectedEventId();
      const prices: BeerPrice[] = beers.map(beer => {
        const salesConfig = this.dbService.getSalesConfigByBeerId(beer.id, eventId);
        const price300ml = salesConfig?.price300ml || 0;
        const price500ml = salesConfig?.price500ml || 0;
        const price1000ml = salesConfig?.price1000ml || 0;

        return {
          beerId: beer.id,
          beerName: beer.name,
          color: beer.color,
          price300ml,
          price500ml,
          price1000ml,
          originalPrice300ml: price300ml,
          originalPrice500ml: price500ml,
          originalPrice1000ml: price1000ml
        };
      });

      this.beerPrices.set(prices);
      console.log('✅ Preços carregados:', prices);
    } catch (error) {
      console.error('❌ Erro ao carregar preços:', error);
      this.showError('Não foi possível carregar os preços.');
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
   * Salva a quantidade de litros e limite de alerta de uma cerveja
   */
  saveStockForBeer(stock: BeerStock): void {
    try {
      const eventId = this.selectedEventId();
      this.dbService.setEventStock(
        stock.beerId,
        stock.beerName,
        stock.quantidadeLitros,
        stock.minLitersAlert,
        eventId
      );

      // Atualiza valores originais
      const updatedStocks = this.beerStocks().map(s =>
        s.beerId === stock.beerId
          ? { ...s, originalQuantity: stock.quantidadeLitros, originalMinLitersAlert: stock.minLitersAlert }
          : s
      );
      this.beerStocks.set(updatedStocks);

      this.showSuccess(`Estoque de ${stock.beerName} salvo: ${stock.quantidadeLitros}L (alerta: ${stock.minLitersAlert}L)`);
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
      const eventId = this.selectedEventId();
      this.beerStocks().forEach(stock => {
        const hasChanges =
          stock.quantidadeLitros !== stock.originalQuantity ||
          stock.minLitersAlert !== stock.originalMinLitersAlert;

        if (hasChanges) {
          this.dbService.setEventStock(
            stock.beerId,
            stock.beerName,
            stock.quantidadeLitros,
            stock.minLitersAlert,
            eventId
          );
          savedCount++;
        }
      });

      // Atualiza valores originais
      const updatedStocks = this.beerStocks().map(s => ({
        ...s,
        originalQuantity: s.quantidadeLitros,
        originalMinLitersAlert: s.minLitersAlert
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
   * Salva a configuração de preços de uma cerveja
   */
  savePriceForBeer(price: BeerPrice): void {
    try {
      const eventId = this.selectedEventId();
      this.dbService.setSalesConfig(
        price.beerId,
        price.beerName,
        price.price300ml,
        price.price500ml,
        price.price1000ml,
        eventId
      );

      // Atualiza valor original
      const updatedPrices = this.beerPrices().map(p =>
        p.beerId === price.beerId
          ? {
              ...p,
              originalPrice300ml: price.price300ml,
              originalPrice500ml: price.price500ml,
              originalPrice1000ml: price.price1000ml
            }
          : p
      );
      this.beerPrices.set(updatedPrices);

      this.showSuccess(`Preços de ${price.beerName} salvos com sucesso!`);
    } catch (error) {
      console.error('❌ Erro ao salvar preços:', error);
      this.showError(`Não foi possível salvar os preços de ${price.beerName}`);
    }
  }

  /**
   * Salva todos os preços de uma vez
   */
  saveAllPrices(): void {
    this.isSaving.set(true);
    let savedCount = 0;

    try {
      const eventId = this.selectedEventId();
      this.beerPrices().forEach(price => {
        const hasChanges =
          price.price300ml !== price.originalPrice300ml ||
          price.price500ml !== price.originalPrice500ml ||
          price.price1000ml !== price.originalPrice1000ml;

        if (hasChanges) {
          this.dbService.setSalesConfig(
            price.beerId,
            price.beerName,
            price.price300ml,
            price.price500ml,
            price.price1000ml,
            eventId
          );
          savedCount++;
        }
      });

      // Atualiza valores originais
      const updatedPrices = this.beerPrices().map(p => ({
        ...p,
        originalPrice300ml: p.price300ml,
        originalPrice500ml: p.price500ml,
        originalPrice1000ml: p.price1000ml
      }));
      this.beerPrices.set(updatedPrices);

      if (savedCount > 0) {
        this.showSuccess(`${savedCount} preço(s) salvo(s) com sucesso!`);
      } else {
        this.showInfo('Nenhuma alteração detectada.');
      }
    } catch (error) {
      console.error('❌ Erro ao salvar preços:', error);
      this.showError('Erro ao salvar preços.');
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Verifica se uma cerveja tem alterações nos preços
   */
  hasPriceChanges(price: BeerPrice): boolean {
    return (
      price.price300ml !== price.originalPrice300ml ||
      price.price500ml !== price.originalPrice500ml ||
      price.price1000ml !== price.originalPrice1000ml
    );
  }

  /**
   * Reseta o estoque de uma cerveja (remove do banco, volta ao modo normal)
   * Este método só deve ser chamado quando o usuário clicar no botão "Remover Controle"
   */
  resetStockForBeer(stock: BeerStock): void {
    try {
      // Verifica se há controle ativo (originalQuantity > 0 OU quantidadeLitros > 0)
      if (stock.originalQuantity === 0 && stock.quantidadeLitros === 0) {
        this.showInfo(`${stock.beerName} já está sem controle de estoque.`);
        return;
      }

      // Remove do banco de dados
      this.dbService.removeEventStock(stock.beerId);

      // Atualiza para valores padrão (sem controle)
      const updatedStocks = this.beerStocks().map(s =>
        s.beerId === stock.beerId
          ? { ...s, quantidadeLitros: 0, minLitersAlert: 5.0, originalQuantity: 0, originalMinLitersAlert: 5.0 }
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
    return stock.quantidadeLitros !== stock.originalQuantity ||
           stock.minLitersAlert !== stock.originalMinLitersAlert;
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
   * Retorna o status da cerveja (Normal, Controle Ativo, Alerta, Esgotado)
   * IMPORTANTE: O controle só é removido quando o usuário clicar em "Remover Controle"
   * Mesmo com quantidade 0, se originalQuantity > 0, o controle continua ativo
   */
  getBeerStatus(stock: BeerStock): 'normal' | 'active' | 'alert' | 'depleted' {
    // Se originalQuantity === 0 E quantidadeLitros === 0, significa que não tem controle ativo
    if (stock.originalQuantity === 0 && stock.quantidadeLitros === 0) return 'normal';

    // Se tem controle ativo (originalQuantity > 0 OU quantidadeLitros > 0)
    // mas a quantidade atual está zerada, retorna 'depleted'
    if (stock.quantidadeLitros === 0) return 'depleted';

    // Se está abaixo do limite individual
    if (stock.quantidadeLitros < stock.minLitersAlert) return 'alert';

    // Se tem controle ativo e acima do limite
    return 'active';
  }

  /**
   * Retorna a severidade do badge de status
   */
  getStatusSeverity(status: 'normal' | 'active' | 'alert' | 'depleted'): 'secondary' | 'success' | 'danger' | 'warning' {
    switch (status) {
      case 'normal': return 'secondary';
      case 'active': return 'success';
      case 'alert': return 'warning';
      case 'depleted': return 'danger';
    }
  }

  /**
   * Retorna o texto do status
   */
  getStatusText(status: 'normal' | 'active' | 'alert' | 'depleted'): string {
    switch (status) {
      case 'normal': return 'Sem Controle';
      case 'active': return 'Controle Ativo';
      case 'alert': return 'Estoque Baixo!';
      case 'depleted': return 'Estoque Esgotado!';
    }
  }

  /**
   * Retorna a classe CSS do display de estoque baseado na quantidade
   * - Vermelho: quantidadeLitros === 0 (estoque esgotado)
   * - Amarelo: 0 < quantidadeLitros < minLitersAlert (estoque baixo)
   * - Verde: quantidadeLitros >= minLitersAlert (estoque OK)
   */
  getStockDisplayClass(stock: BeerStock): string {
    // Se não tem controle ativo, não exibe o display
    if (stock.originalQuantity === 0 && stock.quantidadeLitros === 0) {
      return '';
    }

    // Usa originalQuantity pois é o valor atual salvo no banco
    const currentStock = stock.originalQuantity;

    // Estoque esgotado = vermelho
    if (currentStock === 0 || currentStock === 0.001) { // 0.001 é o sentinela para estoque zerado
      return 'stock-depleted';
    }

    // Estoque baixo (abaixo do limite) = amarelo
    if (currentStock < stock.minLitersAlert) {
      return 'stock-low';
    }

    // Estoque OK (acima do limite) = verde
    return 'stock-ok';
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
