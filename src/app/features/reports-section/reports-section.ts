// src/app/features/reports-section/reports-section.component.ts
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG 20+ - DatePicker substitui Calendar
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';

// App
import { 
  FullReport, 
  DateRange, 
  PresetPeriod, 
  createPresetDateRange, 
  EMPTY_DATE_RANGE 
} from '../../core/models/report.model';
import { DatabaseService } from '../../core/services/database';

@Component({
  selector: 'app-reports-section',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    // PrimeNG Modules
    CardModule,
    ButtonModule,
    DatePickerModule,  // ← DatePicker em vez de Calendar
    TagModule
  ],
  templateUrl: './reports-section.html',
  styleUrls: ['./reports-section.scss']
})
export class ReportsSectionComponent {
  // Injeção de dependências moderna
  private readonly dbService = inject(DatabaseService);

  // Signals individuais para cada data - melhor para two-way binding
  readonly startDate = signal<Date | null>(null);
  readonly endDate = signal<Date | null>(null);  
  
   /**
   * Computed que retorna a descrição do período do relatório
   * Informa ao usuário qual período está sendo visualizado
   */
   readonly periodDescription = computed<string>(() => {
    const start = this.startDate();
    const end = this.endDate();

    // Se não há filtros, mostra todas as informações
    if (!start && !end) {
      return 'Carregado todas informações do banco de dados';
    }

    // Formata as datas para exibição
    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };

    // Se tem apenas data inicial
    if (start && !end) {
      return `Período: A partir de ${formatDate(start)}`;
    }

    // Se tem apenas data final
    if (!start && end) {
      return `Período: Até ${formatDate(end)}`;
    }

    // Se tem ambas as datas
    if (start && end) {
      return `Período: ${formatDate(start)} até ${formatDate(end)}`;
    }

    return 'Carregado todas informações do banco de dados';
  });



  /**
   * Computed signal que combina as datas em um DateRange
   * É recalculado automaticamente quando startDate ou endDate mudam
   */
  readonly dateRange = computed<DateRange>(() => ({
    startDate: this.startDate(),
    endDate: this.endDate()
  }));

  /**
   * Computed signal para o relatório
   * VANTAGENS:
   * - Lazy evaluation: só calcula quando necessário
   * - Memoização: cacheia resultado se inputs não mudarem
   * - Execução síncrona e previsível
   * - Não causa loops infinitos como effect() pode causar
   */
  readonly report = computed<FullReport | null>(() => {
    // Verifica se o banco está pronto
    if (!this.dbService.isDbReady()) {
      return null;
    }

    const range = this.dateRange();
    return this.dbService.getFullReport(
      range.startDate ?? undefined,
      range.endDate ?? undefined
    );
  });

  /**
   * Expõe o enum para o template
   * Boa prática: evita números mágicos no template
   */
  readonly PresetPeriod = PresetPeriod;

  /**
   * Define um intervalo de datas pré-configurado
   * Função pura extraída para o model - facilita testes
   * 
   * @param days Número de dias atrás (0 = hoje)
   */
  setPresetRange(days: number): void {
    const range = createPresetDateRange(days);
    this.startDate.set(range.startDate);
    this.endDate.set(range.endDate);
  }

  /**
   * Signal para controlar se o relatório deve ser exibido
   * Permite ocultar o relatório ao limpar filtros para melhor UX
   */
  private readonly shouldShowReport = signal<boolean>(true);

  /**
   * Computed que decide se mostra ou não o relatório
   * Combina a existência do relatório com a flag de exibição
   */
  readonly displayReport = computed<FullReport | null>(() => {
    if (!this.shouldShowReport()) {
      return null;
    }
    return this.report();
  });

  /**
   * Limpa os filtros de data E oculta o relatório
   * Melhora a experiência do usuário ao resetar completamente a tela
   * 
   * FLUXO:
   * 1. Oculta o relatório imediatamente (UX responsivo)
   * 2. Limpa as datas dos filtros
   * 3. Reexibe o relatório após 300ms (com dados limpos)
   */
  clearFilters(): void {
    // 1. Oculta o relatório imediatamente
    this.shouldShowReport.set(false);
    
    // 2. Limpa os filtros de data
    this.startDate.set(EMPTY_DATE_RANGE.startDate);
    this.endDate.set(EMPTY_DATE_RANGE.endDate);
    
    // 3. Reexibe o relatório após animação (mostra todos os dados)
    setTimeout(() => {
      this.shouldShowReport.set(true);
    }, 300);
    
  }

  /**
   * Handlers para os eventos do datepicker
   * Necessários para atualizar os signals quando o usuário seleciona datas
   */
  onStartDateSelect(date: Date): void {
    this.startDate.set(date);
  }

  onEndDateSelect(date: Date): void {
    this.endDate.set(date);
  }
}