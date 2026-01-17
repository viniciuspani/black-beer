// src/app/features/sales-form/sales-form.ts
import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';

// PrimeNG Modules
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';

// App Services and Models
import { BeerType, Sale, CUP_SIZES, CupSize } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';
import { ComandaService } from '../../core/services/comanda.service';
import { Comanda } from '../../core/models/comanda.model';
import { TabRefreshService, MainTab } from '../../core/services/tab-refresh.service';
import { AuthService } from '../../core/services/auth.service';
import { EventService } from '../../core/services/event.service';
import { Event } from '../../core/models/event.model';

interface SaleSummary {
  beerName: string;
  cupSize: number;
  quantity: number;
  totalVolume: string;
}

/**
 * Interface para itens do carrinho de compras
 */
interface CartItem {
  id: string;              // `${beerId}-${cupSize}`
  beerId: number;
  beerName: string;
  beerColor: string;
  cupSize: CupSize;
  quantity: number;
  totalVolume: number;     // em ml
  unitPrice: number;       // preço unitário do copo
  totalPrice: number;      // unitPrice * quantity
}

@Component({
  selector: 'app-sales-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    ToastModule,
    TagModule,
    DialogModule
  ],
  providers: [MessageService],
  templateUrl: './sales-form.html',
  styleUrls: ['./sales-form.scss']
})
export class SalesFormComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly comandaService = inject(ComandaService);
  private readonly authService = inject(AuthService);
  private readonly eventService = inject(EventService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  private readonly tabRefreshService = inject(TabRefreshService);

  // ==================== CONSTANTES ====================
  readonly cupSizes: readonly CupSize[] = [CUP_SIZES.SMALL, CUP_SIZES.MEDIUM, CUP_SIZES.LARGE] as const;
  private readonly DEFAULT_CUP_SIZE: CupSize = CUP_SIZES.SMALL;
  private readonly DEFAULT_QUANTITY = 1;
  private readonly ML_TO_LITERS = 1000;

  // ==================== SIGNALS PARA ESTADO REATIVO ====================
  readonly beerTypes = signal<BeerType[]>([]);
  readonly saleForm: FormGroup;

  // Signals para carrinho de compras
  readonly cartItems = signal<CartItem[]>([]);
  readonly cartTotalPrice = computed(() => {
    return this.cartItems().reduce((sum, item) => sum + item.totalPrice, 0);
  });
  readonly cartTotalVolume = computed(() => {
    return this.cartItems().reduce((sum, item) => sum + item.totalVolume, 0);
  });

  // Signals para modal de comanda
  protected isOpeningComanda = signal(false);
  protected selectedComandaNumero = signal<number | null>(null);
  protected availableComandas = signal<Comanda[]>([]);

  // Signals para modal de erro de estoque
  protected showStockErrorModal = signal(false);
  protected stockErrorMessage = signal('');
  protected stockErrorTitle = signal('Erro de Estoque');

  // Signal para controlar estado do bottom sheet (mobile only)
  protected isBottomSheetExpanded = signal(false);

  // Event management signals
  readonly selectedEventId = signal<number | null>(null);
  readonly availableEvents = computed(() => this.eventService.activeEvents());

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

  // ==================== VALIDAÇÃO DE ESTOQUE ====================
  /**
   * Signals para estados de estoque (atualizados via effects)
   * Não podem ser computed porque chamam métodos async
   */
  readonly hasStockDepleted = signal<boolean>(false);
  readonly currentStock = signal<number | null>(null);
  readonly hasLowStock = signal<boolean>(false);
  readonly hasInsufficientStock = signal<boolean>(false);

  // Mapas de estado de estoque por cerveja (para uso no template)
  readonly lowStockBeers = signal<Set<number>>(new Set());
  readonly depletedStockBeers = signal<Set<number>>(new Set());
  readonly stockByBeer = signal<Map<number, number>>(new Map());

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
    this.setupTabRefreshListener();
    this.setupStockValidationEffect();
  }

  // ==================== LIFECYCLE HOOKS ====================
  async ngOnInit(): Promise<void> {
    // Carrega eventos disponíveis
    await this.eventService.loadEvents();

    if (this.dbService.isDbReady()) {
      this.loadBeerTypes();
    }
  }

  /**
   * Callback quando o evento selecionado muda
   */
  onEventChange(eventId: number | null): void {
    this.selectedEventId.set(eventId);
    console.log('📅 Evento alterado para venda:', eventId || 'Sem evento (geral)');
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

  /**
   * Configura listener para recarregar cervejas quando a aba SALES for ativada
   * Isso garante que novas cervejas criadas no beer-management apareçam aqui
   */
  private setupTabRefreshListener(): void {
    this.tabRefreshService.onMainTabActivated(MainTab.SALES).subscribe(() => {
      console.log('📢 Sales-form: Recebeu notificação para recarregar cervejas');
      if (this.dbService.isDbReady()) {
        this.loadBeerTypes();
      }
    });
  }

  /**
   * Configura effect para atualizar estados de estoque quando form ou evento mudar
   * Usa async para buscar dados do banco
   */
  private setupStockValidationEffect(): void {
    effect(() => {
      const beerId = this.beerId.value;
      const cupSize = this.cupSize.value;
      const quantity = this.quantity.value;
      const eventId = this.selectedEventId();

      // Executa validação async
      this.updateStockSignals(beerId, cupSize, quantity, eventId);
    });
  }

  /**
   * Atualiza signals de estoque de forma assíncrona
   */
  private async updateStockSignals(
    beerId: number | null,
    cupSize: CupSize,
    quantity: number,
    eventId: number | null
  ): Promise<void> {
    // Correção: verifica null/undefined em vez de falsy (0 é ID válido)
    if (beerId === null || beerId === undefined) {
      this.hasStockDepleted.set(false);
      this.currentStock.set(null);
      this.hasLowStock.set(false);
      this.hasInsufficientStock.set(false);
      return;
    }

    try {
      const stock = await this.dbService.getEventStockByBeerId(beerId, eventId);

      if (!stock) {
        this.hasStockDepleted.set(false);
        this.currentStock.set(null);
        this.hasLowStock.set(false);
        this.hasInsufficientStock.set(false);
        return;
      }

      // Atualiza estados de estoque
      this.currentStock.set(stock.quantidadeLitros);
      this.hasStockDepleted.set(stock.quantidadeLitros === 0);
      this.hasLowStock.set(stock.quantidadeLitros > 0 && stock.quantidadeLitros < stock.minLitersAlert);

      // Calcula se há estoque insuficiente para a quantidade solicitada
      const litersToSell = (cupSize * quantity) / this.ML_TO_LITERS;
      this.hasInsufficientStock.set(litersToSell > stock.quantidadeLitros);
    } catch (error) {
      console.error('❌ Erro ao atualizar signals de estoque:', error);
    }
  }

  // ==================== CARREGAMENTO DE DADOS ====================
  /**
   * Carrega tipos de cerveja do banco
   * MUDANÇA: Agora retorna BeerType com id: number
   */
  private async loadBeerTypes(): Promise<void> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) {
        console.warn('⚠️ Database não disponível');
        return;
      }

      const beers = await db.beerTypes.orderBy('name').toArray();

      // Garante que IDs são numbers
      const typedBeers: BeerType[] = beers.map(beer => ({
        id: Number(beer.id),              // ← Conversão explícita para number
        name: beer.name,
        color: beer.color,
        description: beer.description
      }));

      this.beerTypes.set(typedBeers);
      console.log('✅ Tipos de cerveja carregados:', typedBeers.length);

      // Atualiza mapas de estado de estoque
      await this.updateStockMaps(typedBeers);
    } catch (error) {
      console.error('❌ Erro ao carregar tipos de cerveja:', error);
      this.showError('Não foi possível carregar os tipos de cerveja.');
    }
  }

  /**
   * Atualiza os mapas de estado de estoque para todas as cervejas
   */
  private async updateStockMaps(beers: BeerType[]): Promise<void> {
    const eventId = this.selectedEventId();
    const lowStock = new Set<number>();
    const depletedStock = new Set<number>();
    const stockMap = new Map<number, number>();

    for (const beer of beers) {
      const stock = await this.dbService.getEventStockByBeerId(beer.id, eventId);
      if (stock) {
        stockMap.set(beer.id, stock.quantidadeLitros);
        if (stock.quantidadeLitros === 0) {
          depletedStock.add(beer.id);
        } else if (stock.quantidadeLitros > 0 && stock.quantidadeLitros < stock.minLitersAlert) {
          lowStock.add(beer.id);
        }
      }
    }

    this.lowStockBeers.set(lowStock);
    this.depletedStockBeers.set(depletedStock);
    this.stockByBeer.set(stockMap);
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

  // ==================== MÉTODOS DO CARRINHO ====================
  /**
   * Adiciona item ao carrinho
   * Valida estoque e busca preço do banco
   */
  async addToCart(): Promise<void> {
    if (!(await this.validateFormForCart())) return;

    const selectedBeer = this.getSelectedBeer();
    if (!selectedBeer) return;

    const { beerId, cupSize, quantity } = this.saleForm.value;

    // Busca o preço unitário do banco
    const unitPrice = await this.getPriceForCupSize(beerId, cupSize);
    if (unitPrice === null) {
      this.showError(`Preço não configurado para ${selectedBeer.name} (${cupSize}ml). Configure em Configurações > Vendas.`);
      return;
    }

    // Verifica se já existe item no carrinho com mesma cerveja e copo
    const cartItemId = `${beerId}-${cupSize}`;
    const existingItem = this.cartItems().find(item => item.id === cartItemId);

    if (existingItem) {
      // Atualiza quantidade do item existente
      this.updateCartItemQuantity(cartItemId, existingItem.quantity + quantity);
    } else {
      // Adiciona novo item ao carrinho
      const totalVolume = cupSize * quantity;
      const totalPrice = unitPrice * quantity;

      const newItem: CartItem = {
        id: cartItemId,
        beerId,
        beerName: selectedBeer.name,
        beerColor: selectedBeer.color,
        cupSize,
        quantity,
        totalVolume,
        unitPrice,
        totalPrice
      };

      this.cartItems.update(items => [...items, newItem]);
      console.log('✅ Item adicionado ao carrinho:', newItem);
    }

    // Mostra mensagem de sucesso
    this.messageService.add({
      severity: 'success',
      summary: 'Adicionado ao Carrinho',
      detail: `${quantity}x ${selectedBeer.name} (${cupSize}ml)`,
      life: 2000
    });

    // Reseta apenas a quantidade para facilitar adicionar mais itens
    this.quantity.setValue(this.DEFAULT_QUANTITY);
  }

  /**
   * Valida formulário para adicionar ao carrinho
   * Similar ao validateForm() mas também considera estoque já no carrinho
   */
  private async validateFormForCart(): Promise<boolean> {
    if (this.saleForm.invalid) {
      this.showWarning('Selecione uma cerveja para continuar.');
      return false;
    }

    const beerId = this.beerId.value;
    // Correção: verifica null/undefined em vez de falsy (0 é ID válido)
    if (beerId === null || beerId === undefined) {
      this.showWarning('Selecione uma cerveja.');
      return false;
    }

    const { cupSize, quantity } = this.saleForm.value;
    const eventId = this.selectedEventId();
    const stock = await this.dbService.getEventStockByBeerId(beerId, eventId);

    // Se não há registro de estoque, permite adicionar (modo normal)
    if (!stock) {
      console.log(`ℹ️ Sem controle de estoque para beerId ${beerId} [eventId: ${eventId || 'geral'}] - adição permitida`);
      return true;
    }

    const selectedBeer = this.beerTypes().find(b => b.id === beerId);
    const beerName = selectedBeer?.name || 'desta cerveja';

    // Calcula quantos litros já estão no carrinho para esta cerveja
    const litersInCart = this.cartItems()
      .filter(item => item.beerId === beerId)
      .reduce((sum, item) => sum + item.totalVolume, 0) / this.ML_TO_LITERS;

    // Calcula quantos litros estão sendo adicionados
    const litersToAdd = (cupSize * quantity) / this.ML_TO_LITERS;

    // Total que será necessário
    const totalLitersNeeded = litersInCart + litersToAdd;

    // Validação de estoque esgotado
    if (stock.quantidadeLitros === 0) {
      console.log(`❌ Estoque esgotado para beerId ${beerId} (0L) [eventId: ${eventId || 'geral'}]`);
      this.showStockError(
        'Estoque Esgotado!',
        `O estoque de ${beerName} está esgotado (0L disponível).\n\nNão é possível adicionar ao carrinho. Por favor, reponha o estoque em Configurações > Vendas.`
      );
      return false;
    }

    // Validação de estoque insuficiente (considerando o que já está no carrinho)
    if (totalLitersNeeded > stock.quantidadeLitros) {
      console.log(`❌ Estoque insuficiente para beerId ${beerId}: necessário ${totalLitersNeeded}L (${litersInCart}L no carrinho + ${litersToAdd}L agora), disponível ${stock.quantidadeLitros}L [eventId: ${eventId || 'geral'}]`);
      this.showStockError(
        'Estoque Insuficiente!',
        `Você já tem ${litersInCart.toFixed(1)}L de ${beerName} no carrinho.\n\nTentando adicionar mais ${litersToAdd.toFixed(1)}L = ${totalLitersNeeded.toFixed(1)}L total.\n\nEstoque disponível: ${stock.quantidadeLitros.toFixed(1)}L\n\nPor favor, ajuste a quantidade ou reponha o estoque.`
      );
      return false;
    }

    console.log(`✅ Validação OK: ${litersToAdd}L sendo adicionado (${litersInCart}L já no carrinho, ${stock.quantidadeLitros}L disponíveis) [eventId: ${eventId || 'geral'}]`);
    return true;
  }

  /**
   * Busca o preço de uma cerveja para um tamanho de copo específico
   */
  private async getPriceForCupSize(beerId: number, cupSize: CupSize): Promise<number | null> {
    try {
      const priceConfig = await this.dbService.getSalesConfigByBeerId(beerId);

      if (!priceConfig) {
        console.warn(`⚠️ Sem configuração de preço para beerId ${beerId}`);
        return null;
      }

      // Mapeia cupSize para coluna correspondente
      const priceColumn = cupSize === 300 ? 'price300ml' :
                         cupSize === 500 ? 'price500ml' :
                         'price1000ml';

      const price = priceConfig[priceColumn];

      if (price === null || price === undefined) {
        console.warn(`⚠️ Preço não configurado para ${cupSize}ml (beerId ${beerId})`);
        return null;
      }

      return Number(price);
    } catch (error) {
      console.error('❌ Erro ao buscar preço:', error);
      return null;
    }
  }

  /**
   * Atualiza a quantidade de um item no carrinho
   */
  updateCartItemQuantity(itemId: string, newQuantity: number): void {
    if (newQuantity < 1) {
      this.removeFromCart(itemId);
      return;
    }

    this.cartItems.update(items => {
      return items.map(item => {
        if (item.id === itemId) {
          const totalVolume = item.cupSize * newQuantity;
          const totalPrice = item.unitPrice * newQuantity;
          return { ...item, quantity: newQuantity, totalVolume, totalPrice };
        }
        return item;
      });
    });
  }

  /**
   * Incrementa a quantidade de um item do carrinho
   */
  async incrementCartItem(itemId: string): Promise<void> {
    const item = this.cartItems().find(i => i.id === itemId);
    if (!item) return;

    const eventId = this.selectedEventId();

    // Valida estoque antes de incrementar
    const stock = await this.dbService.getEventStockByBeerId(item.beerId, eventId);
    if (stock) {
      const litersInCart = this.cartItems()
        .filter(i => i.beerId === item.beerId)
        .reduce((sum, i) => sum + i.totalVolume, 0) / this.ML_TO_LITERS;

      const litersToAdd = item.cupSize / this.ML_TO_LITERS;
      const totalNeeded = litersInCart + litersToAdd;

      if (totalNeeded > stock.quantidadeLitros) {
        this.showError(`Estoque insuficiente. Disponível: ${stock.quantidadeLitros.toFixed(1)}L`);
        return;
      }
    }

    this.updateCartItemQuantity(itemId, item.quantity + 1);
  }

  /**
   * Decrementa a quantidade de um item do carrinho
   */
  decrementCartItem(itemId: string): void {
    const item = this.cartItems().find(i => i.id === itemId);
    if (!item) return;

    this.updateCartItemQuantity(itemId, item.quantity - 1);
  }

  /**
   * Remove um item do carrinho
   */
  removeFromCart(itemId: string): void {
    this.cartItems.update(items => items.filter(item => item.id !== itemId));

    this.messageService.add({
      severity: 'info',
      summary: 'Item Removido',
      detail: 'Item removido do carrinho',
      life: 2000
    });
  }

  /**
   * Limpa todo o carrinho
   */
  clearCart(): void {
    this.cartItems.set([]);
  }

  /**
   * Verifica se o carrinho tem itens
   */
  hasCartItems(): boolean {
    return this.cartItems().length > 0;
  }

  /**
   * Toggle do estado do bottom sheet (expandir/colapsar)
   */
  toggleBottomSheet(): void {
    this.isBottomSheetExpanded.update(expanded => !expanded);
  }

  // ==================== HANDLER PRINCIPAL DE VENDA ====================
  /**
   * Finaliza a venda processando todos os itens do carrinho
   */
  async finalizeSale(): Promise<void> {
    if (!this.hasCartItems()) {
      this.showWarning('Adicione itens ao carrinho antes de finalizar a venda.');
      return;
    }

    // Valida se o usuário está logado
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.showError('Você precisa estar logado para finalizar uma venda.');
      return;
    }

    // Valida estoque novamente antes de finalizar
    const isValid = await this.validateCartStock();
    if (!isValid) {
      return;
    }

    try {
      const eventId = this.selectedEventId();

      // Registra cada item do carrinho como uma venda
      // Usa for...of para garantir execução sequencial com await
      for (const item of this.cartItems()) {
        const sale: Omit<Sale, 'id'> = {
          beerId: item.beerId,
          beerName: item.beerName,
          cupSize: item.cupSize,
          quantity: item.quantity,
          timestamp: new Date().toISOString(),
          totalVolume: item.totalVolume,
          comandaId: null,
          userId: currentUser.userId,
          eventId
        };

        await this.insertSaleIntoDatabase(sale);
        await this.updateEventStock(sale);
      }

      // Mensagem de sucesso
      const totalItems = this.cartItems().reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = this.cartTotalPrice();
      const totalLiters = (this.cartTotalVolume() / this.ML_TO_LITERS).toFixed(1);

      this.messageService.add({
        severity: 'success',
        summary: 'Venda Finalizada!',
        detail: `${totalItems} item(s) vendido(s) - ${totalLiters}L - R$ ${totalPrice.toFixed(2)}`,
        life: 5000
      });

      // Limpa carrinho e reseta formulário
      this.clearCart();
      this.resetForm();

      // Atualiza os signals de estoque para refletir a nova quantidade
      await this.updateStockMaps(this.beerTypes());

      console.log('✅ Venda finalizada com sucesso');
    } catch (error) {
      this.handleSaleError(error);
    }
  }

  /**
   * Valida estoque para todos os itens do carrinho
   * Retorna false se algum item não tem estoque suficiente
   */
  private async validateCartStock(): Promise<boolean> {
    const eventId = this.selectedEventId();

    for (const item of this.cartItems()) {
      const stock = await this.dbService.getEventStockByBeerId(item.beerId, eventId);

      // Se não há controle de estoque, continua
      if (!stock) continue;

      // Calcula quantos litros deste item precisam
      const litersNeeded = item.totalVolume / this.ML_TO_LITERS;

      // Verifica se há estoque suficiente
      if (litersNeeded > stock.quantidadeLitros) {
        this.showStockError(
          'Estoque Insuficiente!',
          `${item.beerName}: necessário ${litersNeeded.toFixed(1)}L, disponível ${stock.quantidadeLitros.toFixed(1)}L.\n\nPor favor, ajuste o carrinho ou reponha o estoque.`
        );
        return false;
      }
    }

    return true;
  }

  // ==================== MÉTODOS PRIVADOS DE VALIDAÇÃO ====================
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
   * Insere a venda no banco de dados
   * MUDANÇA: Não inserimos ID, deixamos o AUTOINCREMENT fazer o trabalho
   * MUDANÇA: beerId agora é number
   * MUDANÇA V6: Suporte para comandaId opcional
   * MUDANÇA V8: Inclui userId obrigatório para rastrear quem fez a venda
   * MUDANÇA V9: Inclui eventId opcional para vincular a eventos
   */
  private async insertSaleIntoDatabase(sale: Omit<Sale, 'id'>): Promise<void> {
    const db = this.dbService.getDatabase();
    if (!db) {
      throw new Error('Database não disponível');
    }

    // Dexie adiciona o ID automaticamente
    await db.sales.add({
      beerId: sale.beerId,
      beerName: sale.beerName,
      cupSize: sale.cupSize,
      quantity: sale.quantity,
      timestamp: sale.timestamp,
      totalVolume: sale.totalVolume,
      comandaId: sale.comandaId ?? undefined,  // ← NOVO V6: FK opcional para comandas
      userId: sale.userId,        // ← NOVO V8: FK obrigatória para users
      eventId: sale.eventId ?? undefined  // ← NOVO V9: FK opcional para eventos
    });
  }

  /**
   * Atualiza o estoque do evento (se configurado)
   * Converte volume de ml para litros e subtrai do estoque
   * IMPORTANTE: Passa o eventId para subtrair do estoque correto
   */
  private async updateEventStock(sale: Omit<Sale, 'id'>): Promise<void> {
    try {
      // Converte totalVolume (ml) para litros
      const litersToSubtract = sale.totalVolume / this.ML_TO_LITERS;

      // Tenta subtrair do estoque passando o eventId (retorna false se não há estoque configurado)
      const wasSubtracted = await this.dbService.subtractFromEventStock(
        sale.beerId,
        litersToSubtract,
        sale.eventId ?? null  // ← CORREÇÃO: Passa o eventId da venda
      );

      if (wasSubtracted) {
        console.log(`📦 Estoque atualizado: -${litersToSubtract}L de ${sale.beerName} [eventId: ${sale.eventId || 'geral'}]`);

        // Verifica se está abaixo do limite de alerta
        await this.checkStockAlert(sale.beerId, sale.beerName, sale.eventId ?? null);
      } else {
        console.log(`ℹ️ Sem controle de estoque para ${sale.beerName} [eventId: ${sale.eventId || 'geral'}]`);
      }
    } catch (error) {
      // Não propaga o erro - venda já foi registrada com sucesso
      console.error('⚠️ Erro ao atualizar estoque do evento (venda registrada):', error);
    }
  }

  /**
   * Verifica se o estoque de uma cerveja está abaixo do limite e exibe alerta
   * @param beerId ID da cerveja
   * @param beerName Nome da cerveja
   * @param eventId ID do evento (null = estoque geral)
   */
  private async checkStockAlert(beerId: number, beerName: string, eventId: number | null = null): Promise<void> {
    try {
      const stock = await this.dbService.getEventStockByBeerId(beerId, eventId);
      if (!stock) return;

      const config = await this.dbService.getStockAlertConfig();
      const minLiters = config?.minLiters || 5.0;

      // Se estoque está acima do limite, não há alerta
      if (stock.quantidadeLitros >= minLiters) return;

      // Estoque baixo - exibe aviso
      const remainingLiters = stock.quantidadeLitros.toFixed(1);
      this.messageService.add({
        severity: 'warn',
        summary: 'Estoque Baixo!',
        detail: `${beerName}: apenas ${remainingLiters}L restantes (limite: ${minLiters}L)`,
        life: 6000,
        sticky: false
      });

      console.log(`⚠️ ALERTA: ${beerName} com estoque baixo (${remainingLiters}L) [eventId: ${eventId || 'geral'}]`);
    } catch (error) {
      console.error('⚠️ Erro ao verificar alerta de estoque:', error);
    }
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

  // ==================== MÉTODOS DE DETECÇÃO DE PLATAFORMA ====================
  /**
   * Verifica se está em modo desktop (largura >= 768px)
   * @returns true se desktop, false se mobile
   */
  private isDesktop(): boolean {
    return window.innerWidth >= 768;
  }

  /**
   * Exibe erro de estoque de forma apropriada:
   * - Desktop: Modal centralizado
   * - Mobile: Toast notification
   */
  private showStockError(title: string, message: string): void {
    if (this.isDesktop()) {
      // Desktop: Mostra modal
      this.stockErrorTitle.set(title);
      this.stockErrorMessage.set(message);
      this.showStockErrorModal.set(true);
    } else {
      // Mobile: Mostra toast
      this.showError(message);
    }
  }

  /**
   * Fecha o modal de erro de estoque
   */
  protected closeStockErrorModal(): void {
    this.showStockErrorModal.set(false);
  }

  // ==================== MÉTODOS DE MENSAGENS ====================
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
    // Correção: verifica null/undefined em vez de falsy (0 é ID válido)
    if (beerId === null || beerId === undefined) return 'Nenhuma';

    const beer = this.beerTypes().find(b => b.id === beerId);
    return beer?.name || 'Desconhecida';
  }

  /**
   * Verifica se uma cerveja específica tem estoque baixo
   * @param beerId ID da cerveja a verificar
   * @returns true se estoque está ativo E 0 < quantidade < minLitersAlert
   */
  /**
   * Verifica se cerveja está com estoque baixo (usando signal)
   */
  checkLowStockForBeer(beerId: number): boolean {
    return this.lowStockBeers().has(beerId);
  }

  /**
   * Verifica se uma cerveja específica tem estoque esgotado (usando signal)
   */
  checkDepletedStockForBeer(beerId: number): boolean {
    return this.depletedStockBeers().has(beerId);
  }

  /**
   * Retorna a quantidade de estoque de uma cerveja específica (usando signal)
   */
  getStockForBeer(beerId: number): number | null {
    return this.stockByBeer().get(beerId) ?? null;
  }

  // ==================== MÉTODOS DE COMANDA ====================

  /**
   * Abre o modal para selecionar uma comanda
   */
  protected async openComandaDialog(): Promise<void> {
    await this.loadAvailableComandas();
    this.isOpeningComanda.set(true);
  }

  /**
   * Fecha o modal de seleção de comanda
   */
  protected closeComandaDialog(): void {
    this.isOpeningComanda.set(false);
    this.selectedComandaNumero.set(null);
  }

  /**
   * Carrega as comandas disponíveis E em uso do banco
   */
  private async loadAvailableComandas(): Promise<void> {
    const disponivel = await this.comandaService.getAvailableComandas();
    const emUso = await this.comandaService.getInUseComandas();
    const todasComandas = [...disponivel, ...emUso].sort((a, b) => a.numero - b.numero);
    this.availableComandas.set(todasComandas);
  }

  /**
   * Seleciona uma comanda no modal
   */
  protected selectComanda(numero: number): void {
    this.selectedComandaNumero.set(numero);
  }

  /**
   * Finaliza venda com comanda processando todos os itens do carrinho
   */
  protected async finalizeWithComanda(): Promise<void> {
    const comandaNumero = this.selectedComandaNumero();

    if (!comandaNumero) {
      this.showError('Selecione uma comanda');
      return;
    }

    if (!this.hasCartItems()) {
      this.showWarning('Adicione itens ao carrinho antes de finalizar.');
      return;
    }

    // Valida se o usuário está logado
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.showError('Você precisa estar logado para finalizar uma venda.');
      return;
    }

    // Valida estoque novamente antes de finalizar
    const isValid = await this.validateCartStock();
    if (!isValid) {
      return;
    }

    // Buscar a comanda pelo número
    const comanda = await this.dbService.getComandaByNumero(comandaNumero);
    if (!comanda) {
      this.showError(`Comanda ${comandaNumero} não encontrada`);
      return;
    }

    // Abrir a comanda se ainda estiver disponível
    try {
      if (comanda.status === 'disponivel') {
        await this.comandaService.openComanda(comandaNumero);
      }

      const eventId = this.selectedEventId();

      // Processar todos os itens do carrinho vinculados à comanda
      // Usa for...of para garantir execução sequencial com await
      for (const item of this.cartItems()) {
        const sale: Omit<Sale, 'id'> = {
          beerId: item.beerId,
          beerName: item.beerName,
          cupSize: item.cupSize,
          quantity: item.quantity,
          timestamp: new Date().toISOString(),
          totalVolume: item.totalVolume,
          comandaId: comanda.id,
          userId: currentUser.userId,
          eventId
        };

        await this.insertSaleIntoDatabase(sale);
        await this.updateEventStock(sale);
      }

      // Mensagem de sucesso
      const totalItems = this.cartItems().reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = this.cartTotalPrice();

      this.messageService.add({
        severity: 'success',
        summary: 'Venda Registrada',
        detail: `${totalItems} item(s) adicionado(s) à Comanda ${comanda.numero} - R$ ${totalPrice.toFixed(2)}`,
        life: 5000
      });

      // Limpa carrinho, reseta formulário e fecha modal
      this.clearCart();
      this.resetForm();
      this.closeComandaDialog();

      // Atualiza os signals de estoque para refletir a nova quantidade
      await this.updateStockMaps(this.beerTypes());

      console.log('✅ Venda com comanda finalizada com sucesso');
    } catch (error: any) {
      this.showError(error.message || 'Erro ao processar venda com comanda');
    }
  }
}