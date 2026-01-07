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

  // Signals para modal de comanda
  protected isOpeningComanda = signal(false);
  protected selectedComandaNumero = signal<number | null>(null);
  protected availableComandas = signal<Comanda[]>([]);

  // Signals para modal de erro de estoque
  protected showStockErrorModal = signal(false);
  protected stockErrorMessage = signal('');
  protected stockErrorTitle = signal('Erro de Estoque');
  
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
   * Verifica se a cerveja selecionada tem estoque zerado
   * Retorna true se estoque está ativo E quantidade = 0
   */
  readonly hasStockDepleted = computed<boolean>(() => {
    const beerId = this.beerId.value;
    if (!beerId) return false;

    // Busca o estoque da cerveja selecionada
    const stock = this.dbService.getEventStockByBeerId(beerId);

    // Se não tem registro de estoque, estoque está desabilitado
    if (!stock) return false;

    // Verifica se quantidade está zerada
    return stock.quantidadeLitros === 0;
  });

  /**
   * Retorna a quantidade de litros em estoque da cerveja selecionada
   */
  readonly currentStock = computed<number | null>(() => {
    const beerId = this.beerId.value;
    if (!beerId) return null;

    const stock = this.dbService.getEventStockByBeerId(beerId);
    return stock ? stock.quantidadeLitros : null;
  });

  /**
   * Verifica se a cerveja selecionada tem estoque baixo
   * Retorna true se estoque está ativo E 0 < quantidade < minLitersAlert
   */
  readonly hasLowStock = computed<boolean>(() => {
    const beerId = this.beerId.value;
    if (!beerId) return false;

    // Busca o estoque da cerveja selecionada
    const stock = this.dbService.getEventStockByBeerId(beerId);

    // Se não tem registro de estoque, estoque está desabilitado
    if (!stock) return false;

    // Verifica se está entre 0 e o limite de alerta
    return stock.quantidadeLitros > 0 && stock.quantidadeLitros < stock.minLitersAlert;
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

    // Busca o estoque da cerveja selecionada
    const stock = this.dbService.getEventStockByBeerId(beerId);

    // Se não tem registro de estoque, estoque está desabilitado (permite venda)
    if (!stock) return false;

    // Calcula quantos litros serão vendidos
    const litersToSell = (cupSize * quantity) / this.ML_TO_LITERS;

    // Verifica se há estoque suficiente
    return litersToSell > stock.quantidadeLitros;
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
   * IMPORTANTE: Bloqueia venda se estoque zerado ou insuficiente
   * Desktop: Mostra modal de erro
   * Mobile: Mostra toast
   */
  private validateForm(): boolean {
    if (this.saleForm.invalid) {
      this.showWarning('Selecione uma cerveja para continuar.');
      return false;
    }

    const beerId = this.beerId.value;
    if (!beerId) {
      this.showWarning('Selecione uma cerveja.');
      return false;
    }

    // Busca o estoque atual da cerveja
    const stock = this.dbService.getEventStockByBeerId(beerId);

    // Se não há registro de estoque, permite venda (modo normal)
    if (!stock) {
      console.log(`ℹ️ Sem controle de estoque para beerId ${beerId} - venda permitida`);
      return true;
    }

    // Obtém o nome da cerveja para mensagens
    const selectedBeer = this.beerTypes().find(b => b.id === beerId);
    const beerName = selectedBeer?.name || 'desta cerveja';

    // Validação de estoque esgotado
    if (stock.quantidadeLitros === 0) {
      console.log(`❌ Estoque esgotado para beerId ${beerId} (0L)`);
      this.showStockError(
        'Estoque Esgotado!',
        `O estoque de ${beerName} está esgotado (0L disponível).\n\nNão é possível registrar esta venda. Por favor, reponha o estoque em Configurações > Vendas.`
      );
      return false;
    }

    // Calcula quantos litros serão vendidos
    const { cupSize, quantity } = this.saleForm.value;
    const litersToSell = (cupSize * quantity) / this.ML_TO_LITERS;

    // Validação de estoque insuficiente
    if (litersToSell > stock.quantidadeLitros) {
      console.log(`❌ Estoque insuficiente para beerId ${beerId}: necessário ${litersToSell}L, disponível ${stock.quantidadeLitros}L`);
      this.showStockError(
        'Estoque Insuficiente!',
        `Você está tentando vender ${quantity}x copos de ${cupSize}ml (${litersToSell.toFixed(1)}L) de ${beerName}.\n\nEstoque disponível: ${stock.quantidadeLitros.toFixed(1)}L\n\nPor favor, ajuste a quantidade ou reponha o estoque.`
      );
      return false;
    }

    console.log(`✅ Validação OK: ${litersToSell}L de ${stock.quantidadeLitros}L disponíveis`);
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

      // Subtrai do estoque do evento (se configurado)
      this.updateEventStock(sale);

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
   * MUDANÇA V6: Suporte para comandaId opcional
   */
  private insertSaleIntoDatabase(sale: Omit<Sale, 'id'>): void {
    const query = `
      INSERT INTO sales (beerId, beerName, cupSize, quantity, timestamp, totalVolume, comandaId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    // MUDANÇA: Removemos o ID da inserção
    // O banco gera automaticamente via AUTOINCREMENT
    this.dbService.executeRun(query, [
      sale.beerId,        // ← number agora
      sale.beerName,
      sale.cupSize,
      sale.quantity,
      sale.timestamp,
      sale.totalVolume,
      sale.comandaId ?? null  // ← NOVO V6: FK opcional para comandas
    ]);
  }

  /**
   * Atualiza o estoque do evento (se configurado)
   * Converte volume de ml para litros e subtrai do estoque
   */
  private updateEventStock(sale: Omit<Sale, 'id'>): void {
    try {
      // Converte totalVolume (ml) para litros
      const litersToSubtract = sale.totalVolume / this.ML_TO_LITERS;

      // Tenta subtrair do estoque (retorna false se não há estoque configurado)
      const wasSubtracted = this.dbService.subtractFromEventStock(
        sale.beerId,
        litersToSubtract
      );

      if (wasSubtracted) {
        console.log(`📦 Estoque atualizado: -${litersToSubtract}L de ${sale.beerName}`);

        // Verifica se está abaixo do limite de alerta
        this.checkStockAlert(sale.beerId, sale.beerName);
      } else {
        console.log(`ℹ️ Sem controle de estoque para ${sale.beerName}`);
      }
    } catch (error) {
      // Não propaga o erro - venda já foi registrada com sucesso
      console.error('⚠️ Erro ao atualizar estoque do evento (venda registrada):', error);
    }
  }

  /**
   * Verifica se o estoque de uma cerveja está abaixo do limite e exibe alerta
   */
  private checkStockAlert(beerId: number, beerName: string): void {
    try {
      const stock = this.dbService.getEventStockByBeerId(beerId);
      if (!stock) return;

      const config = this.dbService.getStockAlertConfig();
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

      console.log(`⚠️ ALERTA: ${beerName} com estoque baixo (${remainingLiters}L)`);
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

  /**
   * Verifica se uma cerveja específica tem estoque baixo
   * @param beerId ID da cerveja a verificar
   * @returns true se estoque está ativo E 0 < quantidade < minLitersAlert
   */
  checkLowStockForBeer(beerId: number): boolean {
    const stock = this.dbService.getEventStockByBeerId(beerId);
    if (!stock) return false;
    return stock.quantidadeLitros > 0 && stock.quantidadeLitros < stock.minLitersAlert;
  }

  /**
   * Verifica se uma cerveja específica tem estoque esgotado
   * @param beerId ID da cerveja a verificar
   * @returns true se estoque está ativo E quantidade = 0
   */
  checkDepletedStockForBeer(beerId: number): boolean {
    const stock = this.dbService.getEventStockByBeerId(beerId);
    if (!stock) return false;
    return stock.quantidadeLitros === 0;
  }

  /**
   * Retorna a quantidade de estoque de uma cerveja específica
   * @param beerId ID da cerveja
   * @returns Quantidade em litros ou null se não tem controle
   */
  getStockForBeer(beerId: number): number | null {
    const stock = this.dbService.getEventStockByBeerId(beerId);
    return stock ? stock.quantidadeLitros : null;
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
   * Processa a venda vinculada a uma comanda
   */
  protected handleSaleWithComanda(): void {
    const comandaNumero = this.selectedComandaNumero();

    if (!comandaNumero) {
      this.showError('Selecione uma comanda');
      return;
    }

    // Usa o mesmo método validateForm() para garantir consistência
    if (!this.validateForm()) {
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
      if (comanda.status === 'disponivel') {
        this.comandaService.openComanda(comandaNumero);
      }

      // Processar a venda vinculada à comanda
      this.processSaleWithComanda(comanda.id);

      this.closeComandaDialog();
    } catch (error: any) {
      this.showError(error.message || 'Erro ao abrir comanda');
    }
  }

  /**
   * Processa uma venda vinculada a uma comanda específica
   */
  private processSaleWithComanda(comandaId: number): void {
    const { beerId, cupSize, quantity } = this.saleForm.value;
    const selectedBeer = this.beerTypes().find(b => b.id === beerId);

    if (!selectedBeer) {
      this.showError('Cerveja não encontrada');
      return;
    }

    const totalVolume = cupSize * quantity;
    const sale: Omit<Sale, 'id'> = {
      beerId,
      beerName: selectedBeer.name,
      cupSize,
      quantity,
      timestamp: new Date().toISOString(),
      totalVolume,
      comandaId  // Vincular à comanda
    };

    try {
      this.insertSaleIntoDatabase(sale);
      this.updateEventStock(sale);

      const comanda = this.dbService.getComandaById(comandaId);

      // Exibir mensagem de sucesso
      this.messageService.add({
        severity: 'success',
        summary: 'Venda Registrada',
        detail: `Venda adicionada à Comanda ${comanda?.numero}! 🍺`,
        life: 4000
      });

      // NÃO resetar o formulário para permitir adicionar mais itens na mesma comanda
      // this.resetForm();
    } catch (error) {
      this.handleSaleError(error);
    }
  }
}