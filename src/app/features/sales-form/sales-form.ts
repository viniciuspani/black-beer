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
    const selectedBeer = this.beerTypes().find(b => b.num_id === beerId);

    if (!selectedBeer) return null;

    const totalVolume = (cupSize * quantity) / this.ML_TO_LITERS;

    return {
      beerName: selectedBeer.desc_name,
      cupSize,
      quantity,
      totalVolume: totalVolume.toFixed(1)
    };
  });

  // ==================== VALIDAÇÃO DE ESTOQUE ====================
  /**
   * Verifica se a cerveja selecionada tem estoque zerado
   * Retorna true se estoque está ativo E quantidade = 0
   */
  readonly hasStockDepleted = computed<boolean>(() => {
    const beerId = this.beerId.value;
    if (!beerId) return false;

    const eventId = this.selectedEventId();

    // Busca o estoque da cerveja selecionada para o evento atual
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);

    // Se não tem registro de estoque, estoque está desabilitado
    if (!stock) return false;

    // Verifica se quantidade está zerada
    return stock.num_quantidade_litros === 0;
  });

  /**
   * Retorna a quantidade de litros em estoque da cerveja selecionada
   */
  readonly currentStock = computed<number | null>(() => {
    const beerId = this.beerId.value;
    if (!beerId) return null;

    const eventId = this.selectedEventId();
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);
    return stock ? stock.num_quantidade_litros : null;
  });

  /**
   * Verifica se a cerveja selecionada tem estoque baixo
   * Retorna true se estoque está ativo E 0 < quantidade < minLitersAlert
   */
  readonly hasLowStock = computed<boolean>(() => {
    const beerId = this.beerId.value;
    if (!beerId) return false;

    const eventId = this.selectedEventId();

    // Busca o estoque da cerveja selecionada para o evento atual
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);

    // Se não tem registro de estoque, estoque está desabilitado
    if (!stock) return false;

    // Verifica se está entre 0 e o limite de alerta
    return stock.num_quantidade_litros > 0 && stock.num_quantidade_litros < stock.num_min_liters_alert;
  });

  /**
   * Verifica se há estoque insuficiente para a venda solicitada
   * Retorna true se estoque está ativo E quantidade solicitada > estoque disponível
   */
  readonly hasInsufficientStock = computed<boolean>(() => {
    const beerId = this.beerId.value;
    if (!beerId) return false;

    const cupSize = this.cupSize.value;
    const quantity = this.quantity.value;
    const eventId = this.selectedEventId();

    // Busca o estoque da cerveja selecionada para o evento atual
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);

    // Se não tem registro de estoque, estoque está desabilitado (permite venda)
    if (!stock) return false;

    // Calcula quantos litros serão vendidos
    const litersToSell = (cupSize * quantity) / this.ML_TO_LITERS;

    // Verifica se há estoque suficiente
    return litersToSell > stock.num_quantidade_litros;
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
    this.setupTabRefreshListener();
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

  // ==================== CARREGAMENTO DE DADOS ====================
  /**
   * Carrega tipos de cerveja do banco
   * MUDANÇA: Agora retorna BeerType com id: number
   */
  private loadBeerTypes(): void {
    try {
      const beers = this.dbService.executeQuery(
        'SELECT * FROM prd_beer_types ORDER BY desc_name'
      );

      // Garante que IDs são numbers
      const typedBeers: BeerType[] = beers.map(beer => ({
        num_id: Number(beer.num_id),
        desc_name: beer.desc_name,
        desc_color: beer.desc_color,
        desc_description: beer.desc_description
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

  // ==================== MÉTODOS DO CARRINHO ====================
  /**
   * Adiciona item ao carrinho
   * Valida estoque e busca preço do banco
   */
  addToCart(): void {
    if (!this.validateFormForCart()) return;

    const selectedBeer = this.getSelectedBeer();
    if (!selectedBeer) return;

    const { beerId, cupSize, quantity } = this.saleForm.value;

    // Busca o preço unitário do banco
    const unitPrice = this.getPriceForCupSize(beerId, cupSize);
    if (unitPrice === null) {
      this.showError(`Preço não configurado para ${selectedBeer.desc_name} (${cupSize}ml). Configure em Configurações > Vendas.`);
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
        beerName: selectedBeer.desc_name,
        beerColor: selectedBeer.desc_color,
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
      detail: `${quantity}x ${selectedBeer.desc_name} (${cupSize}ml)`,
      life: 2000
    });

    // Reseta apenas a quantidade para facilitar adicionar mais itens
    this.quantity.setValue(this.DEFAULT_QUANTITY);
  }

  /**
   * Valida formulário para adicionar ao carrinho
   * Similar ao validateForm() mas também considera estoque já no carrinho
   */
  private validateFormForCart(): boolean {
    if (this.saleForm.invalid) {
      this.showWarning('Selecione uma cerveja para continuar.');
      return false;
    }

    const beerId = this.beerId.value;
    if (!beerId) {
      this.showWarning('Selecione uma cerveja.');
      return false;
    }

    const { cupSize, quantity } = this.saleForm.value;
    const eventId = this.selectedEventId();
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);

    // Se não há registro de estoque, permite adicionar (modo normal)
    if (!stock) {
      console.log(`ℹ️ Sem controle de estoque para beerId ${beerId} [eventId: ${eventId || 'geral'}] - adição permitida`);
      return true;
    }

    const selectedBeer = this.beerTypes().find(b => b.num_id === beerId);
    const beerName = selectedBeer?.desc_name || 'desta cerveja';

    // Calcula quantos litros já estão no carrinho para esta cerveja
    const litersInCart = this.cartItems()
      .filter(item => item.beerId === beerId)
      .reduce((sum, item) => sum + item.totalVolume, 0) / this.ML_TO_LITERS;

    // Calcula quantos litros estão sendo adicionados
    const litersToAdd = (cupSize * quantity) / this.ML_TO_LITERS;

    // Total que será necessário
    const totalLitersNeeded = litersInCart + litersToAdd;

    // Validação de estoque esgotado
    if (stock.num_quantidade_litros === 0) {
      console.log(`❌ Estoque esgotado para beerId ${beerId} (0L) [eventId: ${eventId || 'geral'}]`);
      this.showStockError(
        'Estoque Esgotado!',
        `O estoque de ${beerName} está esgotado (0L disponível).\n\nNão é possível adicionar ao carrinho. Por favor, reponha o estoque em Configurações > Vendas.`
      );
      return false;
    }

    // Validação de estoque insuficiente (considerando o que já está no carrinho)
    if (totalLitersNeeded > stock.num_quantidade_litros) {
      console.log(`❌ Estoque insuficiente para beerId ${beerId}: necessário ${totalLitersNeeded}L (${litersInCart}L no carrinho + ${litersToAdd}L agora), disponível ${stock.num_quantidade_litros}L [eventId: ${eventId || 'geral'}]`);
      this.showStockError(
        'Estoque Insuficiente!',
        `Você já tem ${litersInCart.toFixed(1)}L de ${beerName} no carrinho.\n\nTentando adicionar mais ${litersToAdd.toFixed(1)}L = ${totalLitersNeeded.toFixed(1)}L total.\n\nEstoque disponível: ${stock.num_quantidade_litros.toFixed(1)}L\n\nPor favor, ajuste a quantidade ou reponha o estoque.`
      );
      return false;
    }

    console.log(`✅ Validação OK: ${litersToAdd}L sendo adicionado (${litersInCart}L já no carrinho, ${stock.num_quantidade_litros}L disponíveis) [eventId: ${eventId || 'geral'}]`);
    return true;
  }

  /**
   * Busca o preço de uma cerveja para um tamanho de copo específico
   */
  private getPriceForCupSize(beerId: number, cupSize: CupSize): number | null {
    try {
      const result = this.dbService.executeQuery(
        'SELECT * FROM config_sales WHERE num_beer_id = ?',
        [beerId]
      );

      if (result.length === 0) {
        console.warn(`⚠️ Sem configuração de preço para beerId ${beerId}`);
        return null;
      }

      const priceConfig = result[0];

      // Mapeia cupSize para coluna correspondente
      const priceColumn = cupSize === 300 ? 'num_price_300ml' :
                         cupSize === 500 ? 'num_price_500ml' :
                         'num_price_1000ml';

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
  incrementCartItem(itemId: string): void {
    const item = this.cartItems().find(i => i.id === itemId);
    if (!item) return;

    const eventId = this.selectedEventId();

    // Valida estoque antes de incrementar
    const stock = this.dbService.getEventStockByBeerId(item.beerId, eventId);
    if (stock) {
      const litersInCart = this.cartItems()
        .filter(i => i.beerId === item.beerId)
        .reduce((sum, i) => sum + i.totalVolume, 0) / this.ML_TO_LITERS;

      const litersToAdd = item.cupSize / this.ML_TO_LITERS;
      const totalNeeded = litersInCart + litersToAdd;

      if (totalNeeded > stock.num_quantidade_litros) {
        this.showError(`Estoque insuficiente. Disponível: ${stock.num_quantidade_litros.toFixed(1)}L`);
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
  finalizeSale(): void {
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
    if (!this.validateCartStock()) {
      return;
    }

    try {
      const eventId = this.selectedEventId();

      // Registra cada item do carrinho como uma venda
      this.cartItems().forEach(item => {
        const sale: Omit<Sale, 'num_id'> = {
          num_beer_id: item.beerId,
          desc_beer_name: item.beerName,
          num_cup_size: item.cupSize,
          num_quantity: item.quantity,
          dt_timestamp: new Date().toISOString(),
          num_total_volume: item.totalVolume,
          num_comanda_id: null,
          num_user_id: currentUser.num_user_id,
          num_event_id: eventId
        };

        this.insertSaleIntoDatabase(sale);
        this.updateEventStock(sale);
      });

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

      console.log('✅ Venda finalizada com sucesso');
    } catch (error) {
      this.handleSaleError(error);
    }
  }

  /**
   * Valida estoque para todos os itens do carrinho
   * Retorna false se algum item não tem estoque suficiente
   */
  private validateCartStock(): boolean {
    const eventId = this.selectedEventId();

    for (const item of this.cartItems()) {
      const stock = this.dbService.getEventStockByBeerId(item.beerId, eventId);

      // Se não há controle de estoque, continua
      if (!stock) continue;

      // Calcula quantos litros deste item precisam
      const litersNeeded = item.totalVolume / this.ML_TO_LITERS;

      // Verifica se há estoque suficiente
      if (litersNeeded > stock.num_quantidade_litros) {
        this.showStockError(
          'Estoque Insuficiente!',
          `${item.beerName}: necessário ${litersNeeded.toFixed(1)}L, disponível ${stock.num_quantidade_litros.toFixed(1)}L.\n\nPor favor, ajuste o carrinho ou reponha o estoque.`
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
    const selectedBeer = this.beerTypes().find(b => b.num_id === beerId);

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
  private insertSaleIntoDatabase(sale: Omit<Sale, 'num_id'>): void {
    const query = `
      INSERT INTO prd_sales (num_beer_id, desc_beer_name, num_cup_size, num_quantity, dt_timestamp, num_total_volume, num_comanda_id, num_user_id, num_event_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // MUDANÇA: Removemos o ID da inserção
    // O banco gera automaticamente via AUTOINCREMENT
    this.dbService.executeRun(query, [
      sale.num_beer_id,
      sale.desc_beer_name,
      sale.num_cup_size,
      sale.num_quantity,
      sale.dt_timestamp,
      sale.num_total_volume,
      sale.num_comanda_id ?? null,
      sale.num_user_id,
      sale.num_event_id ?? null
    ]);
  }

  /**
   * Atualiza o estoque do evento (se configurado)
   * Converte volume de ml para litros e subtrai do estoque
   * IMPORTANTE: Passa o eventId para subtrair do estoque correto
   */
  private updateEventStock(sale: Omit<Sale, 'num_id'>): void {
    try {
      // Converte totalVolume (ml) para litros
      const litersToSubtract = sale.num_total_volume / this.ML_TO_LITERS;

      // Tenta subtrair do estoque passando o eventId (retorna false se não há estoque configurado)
      const wasSubtracted = this.dbService.subtractFromEventStock(
        sale.num_beer_id,
        litersToSubtract,
        sale.num_event_id ?? null
      );

      if (wasSubtracted) {
        console.log(`📦 Estoque atualizado: -${litersToSubtract}L de ${sale.desc_beer_name} [eventId: ${sale.num_event_id || 'geral'}]`);

        // Verifica se está abaixo do limite de alerta
        this.checkStockAlert(sale.num_beer_id, sale.desc_beer_name, sale.num_event_id ?? null);
      } else {
        console.log(`ℹ️ Sem controle de estoque para ${sale.desc_beer_name} [eventId: ${sale.num_event_id || 'geral'}]`);
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
  private checkStockAlert(beerId: number, beerName: string, eventId: number | null = null): void {
    try {
      const stock = this.dbService.getEventStockByBeerId(beerId, eventId);
      if (!stock) return;

      const config = this.dbService.getStockAlertConfig();
      const minLiters = config?.minLiters || 5.0;

      // Se estoque está acima do limite, não há alerta
      if (stock.num_quantidade_litros >= minLiters) return;

      // Estoque baixo - exibe aviso
      const remainingLiters = stock.num_quantidade_litros.toFixed(1);
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
    if (!beerId) return 'Nenhuma';

    const beer = this.beerTypes().find(b => b.num_id === beerId);
    return beer?.desc_name || 'Desconhecida';
  }

  /**
   * Verifica se uma cerveja específica tem estoque baixo
   * @param beerId ID da cerveja a verificar
   * @returns true se estoque está ativo E 0 < quantidade < minLitersAlert
   */
  checkLowStockForBeer(beerId: number): boolean {
    const eventId = this.selectedEventId();
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);
    if (!stock) return false;
    return stock.num_quantidade_litros > 0 && stock.num_quantidade_litros < stock.num_min_liters_alert;
  }

  /**
   * Verifica se uma cerveja específica tem estoque esgotado
   * @param beerId ID da cerveja a verificar
   * @returns true se estoque está ativo E quantidade = 0
   */
  checkDepletedStockForBeer(beerId: number): boolean {
    const eventId = this.selectedEventId();
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);
    if (!stock) return false;
    return stock.num_quantidade_litros === 0;
  }

  /**
   * Retorna a quantidade de estoque de uma cerveja específica
   * @param beerId ID da cerveja
   * @returns Quantidade em litros ou null se não tem controle
   */
  getStockForBeer(beerId: number): number | null {
    const eventId = this.selectedEventId();
    const stock = this.dbService.getEventStockByBeerId(beerId, eventId);
    return stock ? stock.num_quantidade_litros : null;
  }

  // ==================== MÉTODOS DE COMANDA ====================

  /**
   * Abre o modal para selecionar uma comanda
   */
  protected openComandaDialog(): void {
    this.loadAvailableComandas();
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
  private loadAvailableComandas(): void {
    const disponivel = this.comandaService.getAvailableComandas();
    const emUso = this.comandaService.getInUseComandas();
    const todasComandas = [...disponivel, ...emUso].sort((a, b) => a.num_numero - b.num_numero);
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
  protected finalizeWithComanda(): void {
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
    if (!this.validateCartStock()) {
      return;
    }

    // Buscar a comanda pelo número
    const comanda = this.dbService.getComandaByNumero(comandaNumero);
    if (!comanda) {
      this.showError(`Comanda ${comandaNumero} não encontrada`);
      return;
    }

    // Abrir a comanda se ainda estiver disponível
    try {
      if (comanda.desc_status === 'disponivel') {
        this.comandaService.openComanda(comandaNumero);
      }

      const eventId = this.selectedEventId();

      // Processar todos os itens do carrinho vinculados à comanda
      this.cartItems().forEach(item => {
        const sale: Omit<Sale, 'num_id'> = {
          num_beer_id: item.beerId,
          desc_beer_name: item.beerName,
          num_cup_size: item.cupSize,
          num_quantity: item.quantity,
          dt_timestamp: new Date().toISOString(),
          num_total_volume: item.totalVolume,
          num_comanda_id: comanda.num_id,
          num_user_id: currentUser.num_user_id,
          num_event_id: eventId
        };

        this.insertSaleIntoDatabase(sale);
        this.updateEventStock(sale);
      });

      // Mensagem de sucesso
      const totalItems = this.cartItems().reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = this.cartTotalPrice();

      this.messageService.add({
        severity: 'success',
        summary: 'Venda Registrada',
        detail: `${totalItems} item(s) adicionado(s) à Comanda ${comanda.num_numero} - R$ ${totalPrice.toFixed(2)}`,
        life: 5000
      });

      // Limpa carrinho, reseta formulário e fecha modal
      this.clearCart();
      this.resetForm();
      this.closeComandaDialog();

      console.log('✅ Venda com comanda finalizada com sucesso');
    } catch (error: any) {
      this.showError(error.message || 'Erro ao processar venda com comanda');
    }
  }
}