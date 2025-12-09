// src/app/features/reports-section/reports-section.ts
import { CommonModule } from '@angular/common';
import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { DatabaseService } from '../../core/services/database';
import { FullReport } from '../../core/models/report.model';

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
    BaseChartDirective
  ],
  templateUrl: './reports-section.html',
  styleUrl: './reports-section.scss'
})
export class ReportsSectionComponent implements OnInit {
  
  // ==================== SERVIÇOS ====================
  private readonly dbService = inject(DatabaseService);
  
  // ==================== SIGNALS ====================
  
  /**
   * Período selecionado para filtro rápido
   */
  protected readonly selectedPeriod = signal<'today' | 'week' | 'month' | 'all'>('all');
  
  /**
   * Data inicial para filtro customizado
   */
  protected startDate = signal<Date | null>(null);
  
  /**
   * Data final para filtro customizado
   */
  protected endDate = signal<Date | null>(null);
  
  /**
   * Relatório completo carregado do banco de dados
   * Computed que reage a mudanças de filtro
   */
  protected readonly report = computed<FullReport>(() => {
    if (!this.dbService.isDbReady()) {
      return {
        summary: { totalSales: 0, totalVolumeLiters: 0 },
        salesByCupSize: [],
        salesByBeerType: []
      };
    }
    
    const start = this.startDate();
    const end = this.endDate();
    
    // DatabaseService.getFullReport já faz a filtragem no SQL
    return this.dbService.getFullReport(
      start ?? undefined,
      end ?? undefined
    );
  });
  
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
    const salesByBeer = this.report().salesByBeerType;
    
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
    const salesBySize = this.report().salesByCupSize;
    
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
  
  ngOnInit(): void {
    // Nada a fazer aqui - o computed 'report' já carrega os dados automaticamente
    // quando dbService.isDbReady() muda para true
  }
  
  // ==================== MÉTODOS DE FILTRO ====================
  
  /**
   * Define o período de filtro rápido
   * Limpa filtro customizado ao usar filtro rápido
   */
  protected setPeriod(period: 'today' | 'week' | 'month' | 'all'): void {
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
  }
  
  /**
   * Aplica filtro por range customizado
   */
  protected applyCustomFilter(): void {
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
  }
  
  /**
   * Limpa filtro customizado
   */
  protected clearCustomFilter(): void {
    this.startDate.set(null);
    this.endDate.set(null);
    this.selectedPeriod.set('all');
  }
  
  // ==================== MÉTODOS DE DADOS PARA O TEMPLATE ====================
  
  /**
   * Retorna o total de vendas
   */
  protected getTotalSales(): number {
    return this.report().summary.totalSales;
  }
  
  /**
   * Retorna o volume total vendido em litros
   */
  protected getTotalVolume(): string {
    return this.report().summary.totalVolumeLiters.toFixed(2);
  }
  
  /**
   * Retorna a cerveja mais vendida
   */
  protected getTopBeer(): string {
    const salesByBeer = this.report().salesByBeerType;
    
    if (salesByBeer.length === 0) {
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
    const salesBySize = this.report().salesByCupSize;
    
    if (salesBySize.length === 0) {
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
    return this.report().summary.totalSales;
  }
  
  /**
   * Verifica se há filtro customizado ativo
   */
  protected hasCustomFilter(): boolean {
    return this.startDate() !== null && this.endDate() !== null;
  }
}