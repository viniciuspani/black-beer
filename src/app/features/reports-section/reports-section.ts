// src/app/features/reports-section/reports-section.ts
import { CommonModule } from '@angular/common';
import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { finalize } from 'rxjs/operators';
import { DatabaseService } from '../../core/services/database';
import { EmailService } from '../../core/services/email.service';
import { SalesService } from '../../core/services/sales.service';
import { EventService } from '../../core/services/event.service';
import { FullReport } from '../../core/models/report.model';
import { TabRefreshService, MainTab } from '../../core/services/tab-refresh.service';

// Registrar componentes do Chart.js ANTES de usar
Chart.register(...registerables);

@Component({
  selector: 'app-reports-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    TableModule,
    DatePickerModule,
    ButtonModule,
    ToastModule,
    SelectModule,
    BaseChartDirective
  ],
  providers: [MessageService],
  templateUrl: './reports-section.html',
  styleUrl: './reports-section.scss'
})
export class ReportsSectionComponent implements OnInit {

  // ==================== SERVIÇOS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly emailService = inject(EmailService);
  private readonly salesService = inject(SalesService);
  private readonly eventService = inject(EventService);
  private readonly messageService = inject(MessageService);
  private readonly tabRefreshService = inject(TabRefreshService);

  // ==================== SIGNALS ====================
  
  /**
   * Período selecionado para filtro rápido
   */
  protected readonly selectedPeriod = signal<'today' | 'week' | 'month' | 'all'>('all');

  /**
   * Evento selecionado para filtro (null = todos os eventos)
   */
  protected readonly selectedEventId = signal<number | null>(null);

  /**
   * Lista de eventos disponíveis para filtro
   */
  protected readonly availableEvents = computed(() => {
    return this.eventService.events();
  });

  /**
   * Data inicial para filtro customizado
   */
  protected startDate = signal<Date | null>(null);

  /**
   * Data final para filtro customizado
   */
  protected endDate = signal<Date | null>(null);

  /**
   * Lista de emails para envio do relatório
   */
  protected emailRecipients = signal<string>('');

  /**
   * Indicador de loading do envio de email
   */
  protected isSendingEmail = signal<boolean>(false);

  /**
   * Progresso do upload (0-100)
   */
  protected uploadProgress = signal<number>(0);

  /**
   * Lista de emails salvos carregados do banco (para o dropdown)
   */
  protected savedEmails = signal<Array<{ label: string; value: string }>>([]);

  /**
   * Email selecionado do dropdown
   */
  protected selectedSavedEmail = signal<string | null>(null);

  /**
   * Relatório completo carregado do banco de dados
   * Signal que armazena o relatório atual
   */
  protected readonly report = signal<FullReport>({
    summary: { totalSales: 0, totalVolumeLiters: 0 },
    salesByCupSize: [],
    salesByBeerType: []
  });

  /**
   * Signal para armazenar o valor total de receita (para uso no template)
   */
  protected readonly totalRevenueSignal = signal<number>(0);

  /**
   * Carrega o relatório do banco de dados
   */
  private async loadReport(): Promise<void> {
    if (!this.dbService.isDbReady()) {
      this.report.set({
        summary: { totalSales: 0, totalVolumeLiters: 0 },
        salesByCupSize: [],
        salesByBeerType: []
      });
      this.totalRevenueSignal.set(0);
      return;
    }

    const start = this.startDate();
    const end = this.endDate();
    const eventId = this.selectedEventId();

    // DatabaseService.getFullReport já faz a filtragem no SQL
    const reportData = await this.dbService.getFullReport(
      start?.toISOString() ?? undefined,
      end?.toISOString() ?? undefined,
      eventId ?? undefined
    );

    this.report.set(reportData);

    // Atualiza o total de receita
    const totalRevenue = await this.salesService.getTotalRevenue(
      start ?? undefined,
      end ?? undefined,
      eventId ?? undefined
    );
    this.totalRevenueSignal.set(totalRevenue);
  }
  
  // ==================== CONFIGURAÇÕES DOS GRÁFICOS ====================
  
  /**
   * Configuração do gráfico de pizza (vendas por cerveja)
   */
  protected pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 15,
          font: { size: 12 },
          color: '#1f2937'
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${label}: ${value} copos (${percentage}%)`;
          }
        }
      }
    }
  };
  
  /**
   * Dados do gráfico de pizza (vendas por cerveja)
   * Usa dados já agregados do report.salesByBeerType
   */
  protected pieChartData = computed<ChartData<'pie'>>(() => {
    const salesByBeer = this.report()?.salesByBeerType ?? [];

    if (salesByBeer.length === 0) {
      return {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [],
          borderWidth: 0
        }]
      };
    }
    
    return {
      labels: salesByBeer.map(item => item.name),
      datasets: [{
        data: salesByBeer.map(item => item.totalCups),
        backgroundColor: salesByBeer.map(item => item.color || '#fbbf24'),
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverBorderWidth: 4,
        hoverBorderColor: '#1f2937'
      }]
    };
  });
  
  /**
   * Configuração do gráfico de barras (vendas por tamanho)
   */
  protected barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `Quantidade: ${context.parsed.y} copos`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          color: '#6b7280'
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      x: {
        ticks: {
          color: '#6b7280'
        },
        grid: {
          display: false
        }
      }
    }
  };
  
  /**
   * Dados do gráfico de barras (vendas por tamanho)
   * Usa dados já agregados do report.salesByCupSize
   */
  protected barChartData = computed<ChartData<'bar'>>(() => {
    const salesBySize = this.report()?.salesByCupSize ?? [];

    if (salesBySize.length === 0) {
      return {
        labels: [],
        datasets: [{
          label: 'Quantidade Vendida',
          data: [],
          backgroundColor: '#fbbf24',
          borderColor: '#d97706',
          borderWidth: 0
        }]
      };
    }
    
    // Ordenar por tamanho
    const sortedSizes = [...salesBySize].sort((a, b) => a.cupSize - b.cupSize);
    
    return {
      labels: sortedSizes.map(item => `${item.cupSize}ml`),
      datasets: [{
        label: 'Quantidade Vendida',
        data: sortedSizes.map(item => item.count),
        backgroundColor: '#fbbf24',
        borderColor: '#d97706',
        borderWidth: 2,
        borderRadius: 8,
        hoverBackgroundColor: '#f59e0b',
        hoverBorderColor: '#b45309',
        hoverBorderWidth: 3
      }]
    };
  });
  
  async ngOnInit(): Promise<void> {
    // Carrega eventos ao inicializar
    await this.eventService.loadEvents();

    // Carrega relatório inicial
    await this.loadReport();

    // Subscription para escutar quando a aba de Relatórios é ativada
    this.tabRefreshService.onMainTabActivated(MainTab.REPORTS).subscribe(() => {
      console.log('🔔 Reports: Aba ativada, atualizando dados...');
      this.refreshData();
    });
  }
  
  // ==================== MÉTODOS DE FILTRO ====================
  
  /**
   * Define o período de filtro rápido
   * Limpa filtro customizado ao usar filtro rápido
   */
  protected async setPeriod(period: 'today' | 'week' | 'month' | 'all'): Promise<void> {
    this.selectedPeriod.set(period);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (period) {
      case 'today':
        this.startDate.set(today);
        this.endDate.set(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59));
        break;

      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        this.startDate.set(weekAgo);
        this.endDate.set(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59));
        break;

      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);
        this.startDate.set(monthAgo);
        this.endDate.set(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59));
        break;

      case 'all':
      default:
        this.startDate.set(null);
        this.endDate.set(null);
        break;
    }

    await this.loadReport();
  }
  
  /**
   * Aplica filtro por range customizado
   */
  protected async applyCustomFilter(): Promise<void> {
    const start = this.startDate();
    const end = this.endDate();

    if (!start || !end) {
      alert('Selecione ambas as datas (inicial e final)');
      return;
    }

    // Validação: data inicial não pode ser maior que data final
    if (start > end) {
      alert('Data inicial não pode ser maior que data final');
      return;
    }

    // Normaliza as datas
    const normalizedStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0);
    const normalizedEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);

    this.startDate.set(normalizedStart);
    this.endDate.set(normalizedEnd);

    // Limpa seleção de período rápido
    this.selectedPeriod.set('all');

    await this.loadReport();
  }
  
  /**
   * Limpa filtro customizado
   */
  protected async clearCustomFilter(): Promise<void> {
    this.startDate.set(null);
    this.endDate.set(null);
    this.selectedPeriod.set('all');
    await this.loadReport();
  }
  
  // ==================== MÉTODOS DE DADOS PARA O TEMPLATE ====================
  
  /**
   * Retorna o total de vendas
   */
  protected getTotalSales(): number {
    return this.report()?.summary?.totalSales ?? 0;
  }
  
  /**
   * Retorna o volume total vendido em litros
   */
  protected getTotalVolume(): string {
    return (this.report()?.summary?.totalVolumeLiters ?? 0).toFixed(2);
  }
  
  /**
   * Retorna a cerveja mais vendida
   */
  protected getTopBeer(): string {
    const salesByBeer = this.report()?.salesByBeerType;

    if (!salesByBeer || salesByBeer.length === 0) {
      return 'N/A';
    }

    // Já vem ordenado por totalLiters DESC do banco
    const topBeer = salesByBeer[0];
    return topBeer.name;
  }
  
  /**
   * Retorna o tamanho preferido
   */
  protected getPreferredSize(): number {
    const salesBySize = this.report()?.salesByCupSize;

    if (!salesBySize || salesBySize.length === 0) {
      return 0;
    }

    // Encontra o tamanho com maior quantidade
    let preferredSize = salesBySize[0];

    for (const sizeData of salesBySize) {
      if (sizeData.count > preferredSize.count) {
        preferredSize = sizeData;
      }
    }

    return preferredSize.cupSize;
  }

  /**
   * Retorna o valor total de vendas em Reais (R$)
   * Delega para o SalesService que encapsula a lógica de negócio
   */
  protected async getTotalRevenue(): Promise<number> {
    const start = this.startDate();
    const end = this.endDate();
    const eventId = this.selectedEventId();

    return await this.salesService.getTotalRevenue(
      start ?? undefined,
      end ?? undefined,
      eventId ?? undefined
    );
  }

  /**
   * Aplica filtro por evento
   */
  protected async setEventFilter(eventId: number | null): Promise<void> {
    this.selectedEventId.set(eventId);
    await this.loadReport();
  }

  /**
   * Retorna o nome do evento selecionado ou "Todos os Eventos"
   */
  protected getSelectedEventName(): string {
    const eventId = this.selectedEventId();
    if (eventId === null) {
      return 'Todos os Eventos';
    }

    const event = this.availableEvents().find(e => e.id === eventId);
    return event ? event.nameEvent : 'Evento não encontrado';
  }
  
  /**
   * Retorna a lista de vendas para a tabela/cards
   * NOTA: Como agora usamos FullReport (dados agregados),
   * precisamos reconstruir a lista de vendas individuais
   * ou adaptar o template para mostrar dados agregados
   */
  protected getSalesList(): any[] {
    // Para manter compatibilidade com o template,
    // retornamos array vazio por enquanto
    // O ideal seria adaptar o template para mostrar dados agregados
    // ou criar um método no DatabaseService que retorne vendas individuais
    return [];
  }
  
  /**
   * Retorna a contagem de vendas
   */
  protected getSalesCount(): number {
    return this.report()?.summary?.totalSales ?? 0;
  }
  
  /**
   * Verifica se há filtro customizado ativo
   */
  protected hasCustomFilter(): boolean {
    return this.startDate() !== null && this.endDate() !== null;
  }

  // ==================== MÉTODOS DE EXPORTAÇÃO E EMAIL ====================

  /**
   * Gera arquivo CSV do relatório atual com encoding UTF-8 BOM
   * Formatado com ponto-e-vírgula (;) como separador de colunas
   * e ponto (.) como separador decimal (compatível com Excel PT-BR)
   *
   * VERSÃO 2.0 - Relatório Detalhado:
   * - Inclui vendas detalhadas por evento com breakdown diário e por usuário
   * - Inclui vendas sem evento vinculado
   * - Mantém compatibilidade com seções agregadas existentes
   */
  private async generateCSV(): Promise<File> {
    const report = this.report();
    const csvLines: string[] = [];

    // Valores default se o report não estiver disponível
    const summary = report?.summary ?? { totalSales: 0, totalVolumeLiters: 0 };
    const salesByBeerType = report?.salesByBeerType ?? [];
    const salesByCupSize = report?.salesByCupSize ?? [];

    // ===========================================
    // HEADER PRINCIPAL
    // ===========================================
    csvLines.push('Relatório de Vendas - Black Beer');
    csvLines.push('Data de Geração;' + new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'));
    csvLines.push(''); // Linha em branco

    // ===========================================
    // RESUMO GERAL
    // ===========================================
    const totalRevenue = await this.getTotalRevenue();
    csvLines.push('=== RESUMO GERAL ===');
    csvLines.push('Total vendas;Volume Total(Litros);Valor Total(R$)');
    csvLines.push(`="${summary.totalSales}";"${summary.totalVolumeLiters.toFixed(2)}";"${totalRevenue.toFixed(2)}"`);
    csvLines.push(''); // Linha em branco

    // ===========================================
    // VENDAS POR TIPO DE CERVEJA
    // ===========================================
    csvLines.push('=== VENDAS POR TIPO DE CERVEJA ===');
    csvLines.push('Cerveja;Quantidade;Volume(Litros);Valor(R$)');

    if (salesByBeerType.length > 0) {
      salesByBeerType.forEach(beer => {
        csvLines.push(`${beer.name};"${beer.totalCups}";"${beer.totalLiters.toFixed(2)}";"${beer.totalRevenue.toFixed(2)}"`);
      });
    } else {
      csvLines.push('Nenhuma venda registrada;;;');
    }

    csvLines.push(''); // Linha em branco

    // ===========================================
    // VENDAS POR TAMANHO DE COPO
    // ===========================================
    csvLines.push('=== VENDAS POR TAMANHO DE COPO ===');
    csvLines.push('Tamanho(ml);Quantidade');

    if (salesByCupSize.length > 0) {
      const sortedSizes = [...salesByCupSize].sort((a, b) => a.cupSize - b.cupSize);
      sortedSizes.forEach(size => {
        csvLines.push(`"${size.cupSize}";"${size.count}"`);
      });
    } else {
      csvLines.push('Nenhuma venda registrada;');
    }

    csvLines.push(''); // Linha em branco

    // ===========================================
    // VENDAS DETALHADAS POR EVENTO (NOVO!)
    // ===========================================
    csvLines.push('=== VENDAS DETALHADAS POR EVENTO ===');
    csvLines.push('');

    const start = this.startDate();
    const end = this.endDate();
    const selectedEventId = this.selectedEventId();

    // Se há um evento selecionado, busca dados desse evento
    if (selectedEventId) {
      const salesByEvent = await this.dbService.getSalesDetailedByEvent(
        selectedEventId,
        start?.toISOString(),
        end?.toISOString()
      );
      const eventTotals = await this.dbService.getEventTotals(selectedEventId);

      if (salesByEvent && salesByEvent.event) {
        const eventData = salesByEvent.event;
        csvLines.push(`EVENTO: ${eventData.nameEvent}`);
        csvLines.push(`Local: ${eventData.localEvent}`);
        csvLines.push(`Data do Evento: ${this.formatDateForCSV(eventData.dataEvent)}`);
        csvLines.push('');

        // Tabela de vendas diárias
        csvLines.push('Data;Usuário;Nº Vendas;Volume (Litros);Receita (R$)');

        if (salesByEvent.sales && salesByEvent.sales.length > 0) {
          salesByEvent.sales.forEach((sale: any) => {
            csvLines.push(
              `${this.formatDateForCSV(sale.saleDate)};` +
              `${sale.username};` +
              `"${sale.salesCount}";` +
              `"${sale.totalLiters.toFixed(2)}";` +
              `"${sale.totalRevenue.toFixed(2)}"`
            );
          });
        }

        // Totais do evento
        if (eventTotals) {
          csvLines.push('');
          csvLines.push('TOTAL DO EVENTO;;;');
          csvLines.push(';Nº Vendas;Volume (Litros);Receita (R$)');
          csvLines.push(
            `Total;"${eventTotals.totalSales}";` +
            `"${eventTotals.totalLiters?.toFixed(2) || '0.00'}";` +
            `"${eventTotals.totalRevenue?.toFixed(2) || '0.00'}"`
          );
        }

        csvLines.push('');
        csvLines.push('---');
        csvLines.push('');
      } else {
        csvLines.push('Nenhuma venda vinculada ao evento selecionado.');
        csvLines.push('');
      }
    } else {
      csvLines.push('Nenhum evento selecionado para detalhamento.');
      csvLines.push('');
    }

    // ===========================================
    // VENDAS SEM EVENTO VINCULADO (NOVO!)
    // ===========================================
    csvLines.push('=== VENDAS SEM EVENTO VINCULADO ===');
    csvLines.push('');

    const salesWithoutEventData = await this.dbService.getSalesDetailedWithoutEvent(
      start?.toISOString(),
      end?.toISOString()
    );
    const salesWithoutEvent = salesWithoutEventData?.sales || [];

    if (salesWithoutEvent.length > 0) {
      csvLines.push('Data;Usuário;Nº Vendas;Volume (Litros);Receita (R$)');

      let totalSales = 0;
      let totalLiters = 0;
      let totalRevenue = 0;

      salesWithoutEvent.forEach((sale: any) => {
        csvLines.push(
          `${this.formatDateForCSV(sale.saleDate)};` +
          `${sale.username};` +
          `"${sale.salesCount}";` +
          `"${sale.totalLiters.toFixed(2)}";` +
          `"${sale.totalRevenue.toFixed(2)}"`
        );

        totalSales += sale.salesCount;
        totalLiters += sale.totalLiters;
        totalRevenue += sale.totalRevenue;
      });

      csvLines.push('');
      csvLines.push('TOTAL SEM EVENTO;;;');
      csvLines.push(';Nº Vendas;Volume (Litros);Receita (R$)');
      csvLines.push(
        `Total;"${totalSales}";` +
        `"${totalLiters.toFixed(2)}";` +
        `"${totalRevenue.toFixed(2)}"`
      );
    } else {
      csvLines.push('Nenhuma venda sem evento registrada no período.');
    }

    csvLines.push('');

    // ===========================================
    // PERÍODO DO RELATÓRIO
    // ===========================================
    csvLines.push('=== PERÍODO DO RELATÓRIO ===');
    csvLines.push('Descrição;Data');

    if (this.hasCustomFilter()) {
      const startDate = this.startDate();
      const endDate = this.endDate();
      csvLines.push('Período;' + (startDate ? startDate.toLocaleDateString('pt-BR') : 'N/A') + ' até ' + (endDate ? endDate.toLocaleDateString('pt-BR') : 'N/A'));
    } else {
      csvLines.push('Período;Todos os registros');
    }

    csvLines.push(''); // Linha em branco
    csvLines.push('Relatório gerado automaticamente pelo sistema Black Beer v2.0');

    // ===========================================
    // CONVERTER PARA BLOB COM UTF-8 BOM
    // ===========================================
    const BOM = '\uFEFF';
    const csvContent = BOM + csvLines.join('\r\n');

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;'
    });

    const fileName = `relatorio-black-beer-${new Date().toISOString().split('T')[0]}.csv`;

    return new File([blob], fileName, {
      type: 'text/csv;charset=utf-8;'
    });
  }

  /**
   * Envia o relatório por email via API
   */
  protected async sendReportByEmail(): Promise<void> {
    // Validar emails
    const emailsInput = this.emailRecipients().trim();
    if (!emailsInput) {
      this.showError('Informe pelo menos um email para envio.');
      return;
    }

    // Separar emails por vírgula
    const recipients = emailsInput
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (recipients.length === 0) {
      this.showError('Informe pelo menos um email válido.');
      return;
    }

    if (recipients.length > 10) {
      this.showError('Máximo de 10 destinatários permitidos.');
      return;
    }

    // Validar formato dos emails
    const validation = this.emailService.validateRecipients(recipients);
    if (!validation.valid) {
      this.showError(`Emails inválidos: ${validation.invalidEmails.join(', ')}`);
      return;
    }

    // Verificar se há dados no relatório
    if ((this.report()?.summary?.totalSales ?? 0) === 0) {
      this.showError('Não há dados para exportar. Faça algumas vendas primeiro.');
      return;
    }

    try {
      this.isSendingEmail.set(true);
      this.uploadProgress.set(0);

      // Gerar CSV
      const csvFile = await this.generateCSV();

      // Enviar via API
      this.emailService.sendEmailWithCSV({
        recipients,
        csvFile,
        onProgress: (progress) => {
          this.uploadProgress.set(progress);
        }
      }).pipe(
        // finalize() garante que o cleanup sempre será executado (sucesso OU erro)
        finalize(() => {
          console.log('✅ Cleanup executado (finalize)');
          this.isSendingEmail.set(false);
          this.uploadProgress.set(0);
        })
      ).subscribe({
        next: (response) => {
          console.log('📧 Resposta final do email service:', response);

          // Verificar se houve erro (campo 'error' presente)
          if (response.error) {
            this.showError(response.error);
            return;
          }

          // Verificar sucesso: se tem 'message' E 'recipients' (formato real da API)
          // OU se tem 'success: true' (formato legado)
          const isSuccess = (response.message && response.recipients !== undefined) || response.success === true;

          if (isSuccess) {
            this.showSuccess(`Relatório enviado com sucesso para ${recipients.length} destinatário(s)!`);
            this.emailRecipients.set(''); // Limpar campo
          } else {
            this.showError(response.message || 'Erro ao enviar relatório por email.');
          }
        },
        error: (error) => {
          console.error('❌ Erro ao enviar email:', error);
          this.showError(error.message || 'Erro ao enviar relatório por email.');
        }
      });
    } catch (error: any) {
      console.error('Erro ao preparar envio:', error);
      this.showError(error.message || 'Erro ao preparar envio do relatório.');
      this.isSendingEmail.set(false);
      this.uploadProgress.set(0);
    }
  }

  /**
   * Baixa o CSV localmente (sem enviar por email)
   */
  protected async downloadCSV(): Promise<void> {
    if ((this.report()?.summary?.totalSales ?? 0) === 0) {
      this.showError('Não há dados para exportar.');
      return;
    }

    try {
      const csvFile = await this.generateCSV();
      const url = URL.createObjectURL(csvFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = csvFile.name;
      link.click();
      URL.revokeObjectURL(url);

      this.showSuccess('Relatório baixado com sucesso!');
    } catch (error) {
      console.error('Erro ao baixar CSV:', error);
      this.showError('Erro ao baixar relatório.');
    }
  }

  // ==================== MÉTODOS DE MENSAGENS ====================

  private showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Sucesso',
      detail: message,
      life: 5000
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

  // ==================== MÉTODOS AUXILIARES PARA CSV ====================

  /**
   * Agrupa vendas por eventId
   * @param sales Array de vendas detalhadas
   * @returns Map com vendas agrupadas por evento
   */
  private groupByEvent(sales: any[]): Map<number, any[]> {
    const grouped = new Map<number, any[]>();

    sales.forEach(sale => {
      const eventId = sale.eventId;
      if (!grouped.has(eventId)) {
        grouped.set(eventId, []);
      }
      grouped.get(eventId)!.push(sale);
    });

    return grouped;
  }

  /**
   * Formata data ISO para formato brasileiro
   * @param isoDate Data em formato ISO string
   * @returns Data formatada em dd/MM/yyyy
   */
  private formatDateForCSV(isoDate: string): string {
    if (!isoDate) return 'N/A';

    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return isoDate;
    }
  }

  // ==================== MÉTODOS PARA EMAILS SALVOS ====================

  /**
   * Carrega emails salvos do banco de dados (configurados no settings-user)
   * Chamado quando o dropdown é aberto
   */
  protected async loadSavedEmails(): Promise<void> {
    try {
      // Buscar emails configurados do banco via email service
      const emails = await this.emailService.getConfiguredEmailsFromDatabase();

      if (emails.length > 0) {
        // Converter array de strings para formato do dropdown
        const emailOptions = emails.map((email: string, index: number) => ({
          label: `${index + 1}. ${email}`,
          value: email
        }));

        this.savedEmails.set(emailOptions);
        console.log('✅ Emails salvos carregados:', emailOptions);
      } else {
        this.savedEmails.set([]);
        console.log('⚠️ Nenhum email configurado no banco');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar emails salvos:', error);
      this.savedEmails.set([]);
      this.showError('Erro ao carregar emails salvos');
    }
  }

  /**
   * Adiciona o email selecionado do dropdown ao campo de destinatários
   * Chamado quando o usuário seleciona um email no dropdown
   */
  protected addSavedEmailToRecipients(): void {
    const selected = this.selectedSavedEmail();

    if (!selected) {
      return;
    }

    const currentRecipients = this.emailRecipients().trim();

    // Se já existe o email, não adicionar duplicado
    if (currentRecipients.includes(selected)) {
      this.showError(`O email "${selected}" já está na lista de destinatários`);
      this.selectedSavedEmail.set(null); // Limpar seleção
      return;
    }

    // Adicionar ao campo de destinatários
    if (currentRecipients === '') {
      // Se vazio, apenas adicionar
      this.emailRecipients.set(selected);
    } else {
      // Se já tem emails, adicionar com vírgula
      this.emailRecipients.set(`${currentRecipients}, ${selected}`);
    }

    // Limpar seleção do dropdown
    this.selectedSavedEmail.set(null);

    console.log('✅ Email adicionado aos destinatários:', selected);
  }

  // ==================== MÉTODO DE REFRESH ====================

  /**
   * Atualiza os dados do relatório
   * Chamado quando a aba de relatórios é ativada
   */
  public async refreshData(): Promise<void> {
    console.log('🔄 Atualizando dados de relatórios...');

    // Recarrega o relatório
    await this.loadReport();

    // Recarrega emails salvos
    this.loadSavedEmails();

    console.log('✅ Dados de relatórios atualizados');
  }
}