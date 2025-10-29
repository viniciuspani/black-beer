// // src/app/features/beer-management/beer-management.ts
// import { Component, OnInit, inject, signal, WritableSignal, effect } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

// // PrimeNG Modules
// import { CardModule } from 'primeng/card';
// import { ButtonModule } from 'primeng/button';
// import { InputTextModule } from 'primeng/inputtext';
// import { InputTextareaModule } from 'primeng/inputtextarea';
// import { ColorPickerModule } from 'primeng/colorpicker';
// import { TableModule } from 'primeng/table';
// import { TagModule } from 'primeng/tag';
// import { ConfirmDialogModule } from 'primeng/confirmdialog';
// import { ToastModule } from 'primeng/toast';
// import { TooltipModule } from 'primeng/tooltip';
// import { ConfirmationService, MessageService } from 'primeng/api';

// // App Services and Models
// import { BeerType, isBeerType } from '../../core/models/beer.model';
// import { DatabaseService } from '../../core/services/database';

// /**
//  * Componente para gerenciar tipos de cerveja
//  * 
//  * MUDANÇAS NA REFATORAÇÃO:
//  * - IDs agora são numbers (INTEGER AUTOINCREMENT)
//  * - Não gera mais IDs baseados em slugs de string
//  * - Usa getLastInsertId() após INSERT
//  * - Validação com type guards
//  * - Melhor tratamento de erros
//  * 
//  * @version 2.0.0
//  */
// @Component({
//   selector: 'app-beer-management',
//   standalone: true,
//   imports: [
//     CommonModule,
//     ReactiveFormsModule,
//     CardModule,
//     ButtonModule,
//     InputTextModule,
//     TextareaModule,
//     ColorPickerModule,
//     TableModule,
//     TagModule,
//     ConfirmDialogModule,
//     ToastModule,
//     TooltipModule
//   ],
//   providers: [ConfirmationService, MessageService],
//   templateUrl: './beer-management.html',
//   styleUrls: ['./beer-management.scss']
// })
// export class BeerManagementComponent implements OnInit {
//   // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
//   private readonly dbService = inject(DatabaseService);
//   private readonly fb = inject(FormBuilder);
//   private readonly confirmationService = inject(ConfirmationService);
//   private readonly messageService = inject(MessageService);

//   // ==================== SIGNALS PARA ESTADO REATIVO ====================
//   readonly beerTypes: WritableSignal<BeerType[]> = signal([]);
//   readonly isAdding = signal(false);
//   readonly beerForm: FormGroup;

//   // ==================== CONSTANTES ====================
//   /**
//    * IDs das cervejas padrão que não podem ser excluídas
//    * MUDANÇA: Agora são numbers em vez de strings
//    */
//   private readonly DEFAULT_BEER_IDS = [1, 2, 3, 4] as const;
//   private readonly DEFAULT_COLOR = '#D4A574';

//   // ==================== CONSTRUCTOR ====================
//   constructor() {
//     this.beerForm = this.createBeerForm();
//     this.setupDatabaseEffect();
//   }

//   // ==================== LIFECYCLE HOOKS ====================
//   ngOnInit(): void {
//     if (this.dbService.isDbReady()) {
//       this.loadBeerTypes();
//     }
//   }

//   // ==================== MÉTODOS PRIVADOS DE INICIALIZAÇÃO ====================
//   /**
//    * Cria o formulário reativo para adicionar cerveja
//    */
//   private createBeerForm(): FormGroup {
//     return this.fb.group({
//       name: ['', [Validators.required, Validators.minLength(3)]],
//       description: [''],
//       color: [this.DEFAULT_COLOR, Validators.required]
//     });
//   }

//   /**
//    * Configura effect para carregar dados quando DB estiver pronto
//    */
//   private setupDatabaseEffect(): void {
//     effect(() => {
//       if (this.dbService.isDbReady()) {
//         this.loadBeerTypes();
//       }
//     });
//   }

//   // ==================== CARREGAMENTO DE DADOS ====================
//   /**
//    * Carrega todos os tipos de cerveja do banco
//    * MUDANÇA: Valida tipos com type guard e converte IDs para number
//    */
//   loadBeerTypes(): void {
//     try {
//       const beers = this.dbService.executeQuery(
//         'SELECT * FROM beer_types ORDER BY name'
//       );
      
//       // Conversão e validação com type guard
//       const typedBeers: BeerType[] = beers
//         .map(beer => ({
//           id: Number(beer.id),          // ← Converte para number
//           name: beer.name,
//           color: beer.color || this.DEFAULT_COLOR,
//           description: beer.description || ''
//         }))
//         .filter(isBeerType);            // ← Valida com type guard
      
//       this.beerTypes.set(typedBeers);
//       console.log('✅ Tipos de cerveja carregados:', typedBeers.length);
//     } catch (error) {
//       console.error('❌ Erro ao carregar tipos de cerveja:', error);
//       this.showError('Não foi possível carregar os tipos de cerveja.');
//     }
//   }

//   // ==================== MÉTODOS PÚBLICOS - UI INTERACTIONS ====================
//   /**
//    * Alterna a exibição do formulário de adicionar cerveja
//    */
//   toggleAddForm(): void {
//     this.isAdding.update(value => !value);
//     if (!this.isAdding()) {
//       this.beerForm.reset({ color: this.DEFAULT_COLOR });
//     }
//   }

//   /**
//    * Verifica se uma cerveja é padrão (não pode ser excluída)
//    * MUDANÇA: Comparação com number agora
//    */
//   isDefaultBeer(beerId: number): boolean {
//     return this.DEFAULT_BEER_IDS.includes(beerId);
//   }

//   // ==================== ADICIONAR CERVEJA ====================
//   /**
//    * Handler para adicionar nova cerveja
//    * MUDANÇA CRÍTICA: Não gera mais ID manualmente
//    */
//   handleAddBeer(): void {
//     if (!this.validateForm()) return;

//     const newBeer = this.createBeerFromForm();
    
//     if (this.beerAlreadyExists(newBeer.name)) {
//       this.showError('Uma cerveja com este nome já existe.');
//       return;
//     }

//     this.insertBeer(newBeer);
//   }

//   /**
//    * Valida o formulário antes de adicionar
//    */
//   private validateForm(): boolean {
//     if (this.beerForm.invalid) {
//       this.showWarning('Por favor, preencha todos os campos obrigatórios.');
//       this.beerForm.markAllAsTouched();
//       return false;
//     }
//     return true;
//   }

//   /**
//    * Cria objeto BeerType a partir do formulário
//    * MUDANÇA: Não inclui ID - será gerado pelo AUTOINCREMENT
//    */
//   private createBeerFromForm(): Omit<BeerType, 'id'> {
//     const formValue = this.beerForm.value;
    
//     return {
//       name: formValue.name.trim(),
//       description: formValue.description?.trim() || `Cerveja ${formValue.name}`,
//       color: formValue.color || this.DEFAULT_COLOR
//     };
//   }

//   /**
//    * Verifica se já existe uma cerveja com o mesmo nome
//    * Case-insensitive para evitar duplicatas
//    */
//   private beerAlreadyExists(name: string): boolean {
//     try {
//       const existing = this.dbService.executeQuery(
//         'SELECT id FROM beer_types WHERE LOWER(name) = LOWER(?)',
//         [name.trim()]
//       );
//       return existing.length > 0;
//     } catch (error) {
//       console.error('❌ Erro ao verificar cerveja existente:', error);
//       return false;
//     }
//   }

//   /**
//    * Insere a cerveja no banco de dados
//    * MUDANÇA: Query não inclui ID - banco gera automaticamente
//    */
//   private insertBeer(beer: Omit<BeerType, 'id'>): void {
//     try {
//       // INSERT sem ID - AUTOINCREMENT faz o trabalho
//       this.dbService.executeRun(
//         'INSERT INTO beer_types (name, description, color) VALUES (?, ?, ?)',
//         [beer.name, beer.description, beer.color]
//       );
      
//       // Obtém o ID gerado pelo banco
//       const insertedId = this.dbService.getLastInsertId();
//       console.log('✅ Cerveja adicionada com ID:', insertedId);
      
//       this.showSuccess(`${beer.name} adicionada com sucesso!`);
//       this.loadBeerTypes();
//       this.toggleAddForm();
//     } catch (error) {
//       console.error('❌ Erro ao adicionar cerveja:', error);
//       this.showError('Não foi possível adicionar a cerveja.');
//     }
//   }

//   // ==================== REMOVER CERVEJA ====================
//   /**
//    * Solicita confirmação antes de deletar uma cerveja
//    * MUDANÇA: beerId agora é number
//    */
//   confirmDelete(beer: BeerType): void {
//     // Não permite deletar cervejas padrão
//     if (this.isDefaultBeer(beer.id)) {
//       this.showWarning('Cervejas padrão não podem ser removidas.');
//       return;
//     }

//     // Verifica se há vendas associadas
//     if (this.beerHasSales(beer.id)) {
//       this.confirmDeleteWithSales(beer);
//     } else {
//       this.confirmDeleteWithoutSales(beer);
//     }
//   }

//   /**
//    * Verifica se a cerveja tem vendas associadas
//    * MUDANÇA: Usa beerId como number na query
//    */
//   private beerHasSales(beerId: number): boolean {
//     try {
//       const sales = this.dbService.executeQuery(
//         'SELECT COUNT(*) as count FROM sales WHERE beerId = ?',
//         [beerId]
//       );
//       return Number(sales[0]?.count || 0) > 0;
//     } catch (error) {
//       console.error('❌ Erro ao verificar vendas:', error);
//       return false;
//     }
//   }

//   /**
//    * Confirmação para cerveja sem vendas
//    */
//   private confirmDeleteWithoutSales(beer: BeerType): void {
//     this.confirmationService.confirm({
//       message: `Você tem certeza que deseja remover a cerveja "${beer.name}"?`,
//       header: 'Confirmação de Exclusão',
//       icon: 'pi pi-info-circle',
//       acceptLabel: 'Sim, remover',
//       rejectLabel: 'Cancelar',
//       acceptButtonStyleClass: 'p-button-danger',
//       accept: () => {
//         this.handleDeleteBeer(beer);
//       }
//     });
//   }

//   /**
//    * Confirmação para cerveja COM vendas (aviso sobre CASCADE)
//    */
//   private confirmDeleteWithSales(beer: BeerType): void {
//     const salesCount = this.getSalesCount(beer.id);
    
//     this.confirmationService.confirm({
//       message: `⚠️ A cerveja "${beer.name}" possui ${salesCount} venda(s) registrada(s). 
//                 Ao remover esta cerveja, TODAS as vendas associadas também serão removidas. 
//                 Esta ação não pode ser desfeita. Deseja continuar?`,
//       header: 'ATENÇÃO: Exclusão em Cascata',
//       icon: 'pi pi-exclamation-triangle',
//       acceptLabel: 'Sim, remover tudo',
//       rejectLabel: 'Cancelar',
//       acceptButtonStyleClass: 'p-button-danger',
//       accept: () => {
//         this.handleDeleteBeer(beer);
//       }
//     });
//   }

//   /**
//    * Obtém a contagem de vendas de uma cerveja
//    */
//   private getSalesCount(beerId: number): number {
//     try {
//       const result = this.dbService.executeQuery(
//         'SELECT COUNT(*) as count FROM sales WHERE beerId = ?',
//         [beerId]
//       );
//       return Number(result[0]?.count || 0);
//     } catch (error) {
//       console.error('❌ Erro ao contar vendas:', error);
//       return 0;
//     }
//   }

//   /**
//    * Executa a remoção da cerveja
//    * MUDANÇA: Foreign Key CASCADE remove vendas automaticamente
//    */
//   private handleDeleteBeer(beer: BeerType): void {
//     try {
//       // Com ON DELETE CASCADE no schema, não precisa deletar vendas manualmente
//       // O banco faz isso automaticamente!
//       this.dbService.executeRun(
//         'DELETE FROM beer_types WHERE id = ?',
//         [beer.id]
//       );
      
//       this.showSuccess(`${beer.name} foi removida com sucesso.`);
//       this.loadBeerTypes();
//       console.log('✅ Cerveja removida (ID: ' + beer.id + ')');
//     } catch (error) {
//       console.error('❌ Erro ao remover cerveja:', error);
//       this.showError('Não foi possível remover a cerveja.');
//     }
//   }

//   // ==================== MÉTODOS DE MENSAGENS ====================
//   /**
//    * Exibe mensagem de sucesso
//    */
//   private showSuccess(message: string): void {
//     this.messageService.add({ 
//       severity: 'success', 
//       summary: 'Sucesso', 
//       detail: message,
//       life: 4000
//     });
//   }

//   /**
//    * Exibe mensagem de erro
//    */
//   private showError(message: string): void {
//     this.messageService.add({ 
//       severity: 'error', 
//       summary: 'Erro', 
//       detail: message,
//       life: 5000
//     });
//   }

//   /**
//    * Exibe mensagem de aviso
//    */
//   private showWarning(message: string): void {
//     this.messageService.add({ 
//       severity: 'warn', 
//       summary: 'Atenção', 
//       detail: message,
//       life: 4000
//     });
//   }

//   /**
//    * Exibe mensagem informativa
//    */
//   private showInfo(message: string): void {
//     this.messageService.add({ 
//       severity: 'info', 
//       summary: 'Informação', 
//       detail: message,
//       life: 3000
//     });
//   }

//   // ==================== MÉTODOS AUXILIARES ====================
//   /**
//    * Obtém a quantidade total de cervejas
//    */
//   getTotalBeers(): number {
//     return this.beerTypes().length;
//   }

//   /**
//    * Obtém a quantidade de cervejas customizadas (não padrão)
//    */
//   getCustomBeersCount(): number {
//     return this.beerTypes().filter(beer => !this.isDefaultBeer(beer.id)).length;
//   }

//   /**
//    * Verifica se pode adicionar mais cervejas (limite opcional)
//    */
//   canAddMoreBeers(maxLimit: number = 20): boolean {
//     return this.getTotalBeers() < maxLimit;
//   }

//   /**
//    * Formata o nome para exibição (primeira letra maiúscula)
//    */
//   formatBeerName(name: string): string {
//     return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
//   }

//   /**
//    * Verifica se o formulário tem erros em um campo específico
//    */
//   hasError(fieldName: string): boolean {
//     const field = this.beerForm.get(fieldName);
//     return !!(field && field.invalid && (field.dirty || field.touched));
//   }

//   /**
//    * Obtém mensagem de erro de um campo específico
//    */
//   getErrorMessage(fieldName: string): string {
//     const field = this.beerForm.get(fieldName);
    
//     if (!field || !field.errors) return '';
    
//     if (field.errors['required']) {
//       return 'Este campo é obrigatório';
//     }
    
//     if (field.errors['minlength']) {
//       const minLength = field.errors['minlength'].requiredLength;
//       return `Mínimo de ${minLength} caracteres`;
//     }
    
//     return 'Erro de validação';
//   }

//   /**
//    * Retorna estatísticas das cervejas para debug/admin
//    */
//   getBeerStatistics(): {
//     total: number;
//     default: number;
//     custom: number;
//     withSales: number;
//   } {
//     const beers = this.beerTypes();
    
//     return {
//       total: beers.length,
//       default: beers.filter(b => this.isDefaultBeer(b.id)).length,
//       custom: beers.filter(b => !this.isDefaultBeer(b.id)).length,
//       withSales: beers.filter(b => this.beerHasSales(b.id)).length
//     };
//   }
// }