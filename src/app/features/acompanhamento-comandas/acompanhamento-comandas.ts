// src/app/features/acompanhamento-comandas/acompanhamento-comandas.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ComandaService } from '../../core/services/comanda.service';
import { TabRefreshService, MainTab } from '../../core/services/tab-refresh.service';
import { Comanda, ComandaStatus, ComandaWithItems } from '../../core/models/comanda.model';

@Component({
  selector: 'app-acompanhamento-comandas',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    ToastModule,
    TagModule
  ],
  providers: [MessageService],
  templateUrl: './acompanhamento-comandas.html',
  styleUrl: './acompanhamento-comandas.scss'
})
export class AcompanhamentoComandosComponent implements OnInit {
  private readonly comandaService = inject(ComandaService);
  private readonly messageService = inject(MessageService);
  private readonly tabRefreshService = inject(TabRefreshService);

  // Signals para dados
  protected comandasDisponiveis = signal<Comanda[]>([]);
  protected comandasEmUso = signal<ComandaWithItems[]>([]);
  protected comandasAguardandoPagamento = signal<ComandaWithItems[]>([]);

  // Computed para totais
  protected totalDisponiveis = computed(() => this.comandasDisponiveis().length);
  protected totalEmUso = computed(() => this.comandasEmUso().length);
  protected totalAguardando = computed(() => this.comandasAguardandoPagamento().length);

  ngOnInit(): void {
    // Observa quando a tab de comandas é ativada para atualizar dados
    this.tabRefreshService.onMainTabActivated(MainTab.COMMANDS).subscribe(() => {
      this.refreshData();
    });

    // Carrega dados iniciais
    this.loadInitialData();
  }

  /**
   * Carrega dados iniciais ao montar o componente
   */
  private loadInitialData(): void {
    this.refreshData();
  }

  /**
   * Atualiza todos os dados das comandas
   */
  protected refreshData(): void {
    // Carregar comandas disponíveis
    const disponiveis = this.comandaService.getAvailableComandas();
    this.comandasDisponiveis.set(disponiveis);

    // Carregar comandas em uso com seus itens
    const emUso = this.comandaService.getInUseComandas();
    const emUsoWithItems = emUso
      .map(c => this.comandaService.getComandaWithItems(c.id))
      .filter(c => c !== null) as ComandaWithItems[];
    this.comandasEmUso.set(emUsoWithItems);

    // Carregar comandas aguardando pagamento com seus itens
    const aguardando = this.comandaService.getPendingPaymentComandas();
    const aguardandoWithItems = aguardando
      .map(c => this.comandaService.getComandaWithItems(c.id))
      .filter(c => c !== null) as ComandaWithItems[];
    this.comandasAguardandoPagamento.set(aguardandoWithItems);
  }

  /**
   * Fecha uma comanda e move para aguardando pagamento
   * @param comandaId ID da comanda a ser fechada
   */
  protected fecharComanda(comandaId: number): void {
    try {
      const total = this.comandaService.closeComanda(comandaId);
      this.refreshData();
      this.showSuccess(`Comanda fechada! Total: R$ ${total.toFixed(2)}`);
    } catch (error: any) {
      this.showError(error.message || 'Erro ao fechar comanda');
    }
  }

  /**
   * Confirma o pagamento de uma comanda e a libera
   * @param comandaId ID da comanda
   */
  protected confirmarPagamento(comandaId: number): void {
    try {
      this.comandaService.confirmPayment(comandaId);
      this.refreshData();
      this.showSuccess('Pagamento confirmado! Comanda disponível novamente.');
    } catch (error: any) {
      this.showError(error.message || 'Erro ao confirmar pagamento');
    }
  }

  /**
   * Exibe mensagem de sucesso
   * @param message Mensagem a ser exibida
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
   * Exibe mensagem de erro
   * @param message Mensagem a ser exibida
   */
  private showError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erro',
      detail: message,
      life: 5000
    });
  }
}
