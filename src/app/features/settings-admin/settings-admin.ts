import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';

// App
import { DatabaseService } from '../../core/services/database';

/**
 * Interface para as estatísticas do banco de dados
 */
interface DatabaseStats {
  beerTypes: number;
  sales: number;
  users: number;
  events: number;
  comandas: number;
  totalRecords: number;
  // Propriedades para o template
  totalSales: number;
  totalBeerTypes: number;
  hasSettings: boolean;
}

@Component({
  selector: 'app-settings-admin',
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    ToastModule,
    DialogModule,
    DividerModule
  ],
  providers: [MessageService],
  templateUrl: './settings-admin.html',
  styleUrls: ['./settings-admin.scss']
})
export class SettingsAdminComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);
  private readonly messageService = inject(MessageService);

  // ==================== SIGNALS ====================

  /**
   * Indica se o processo de limpeza está em andamento
   */
  readonly isClearing = signal<boolean>(false);

  /**
   * Controla a visibilidade do dialog de confirmação
   */
  readonly showClearDialog = signal<boolean>(false);

  /**
   * Armazena as estatísticas do banco de dados
   */
  private readonly dbStatsSignal = signal<DatabaseStats>({
    beerTypes: 0,
    sales: 0,
    users: 0,
    events: 0,
    comandas: 0,
    totalRecords: 0,
    totalSales: 0,
    totalBeerTypes: 0,
    hasSettings: false
  });

  // ==================== COMPUTED SIGNALS ====================

  /**
   * Retorna as estatísticas do banco de dados
   */
  readonly dbStats = computed(() => {
    return this.dbStatsSignal();
  });

  /**
   * Retorna status do banco
   */
  readonly dbReady = computed(() => this.dbService.isDbReady());

  // ==================== LIFECYCLE HOOKS ====================

  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.updateDatabaseStats();
    }
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
   * Atualiza as estatísticas do banco de dados
   */
  private async updateDatabaseStats(): Promise<void> {
    try {
      const stats = await this.dbService.getDatabaseStats();
      // Adiciona propriedades para compatibilidade com o template
      this.dbStatsSignal.set({
        ...stats,
        totalSales: stats.sales,
        totalBeerTypes: stats.beerTypes,
        hasSettings: stats.totalRecords > 0
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar estatísticas:', error);
      this.dbStatsSignal.set({
        beerTypes: 0,
        sales: 0,
        users: 0,
        events: 0,
        comandas: 0,
        totalRecords: 0,
        totalSales: 0,
        totalBeerTypes: 0,
        hasSettings: false
      });
    }
  }

  // ==================== LIMPAR BANCO ====================

  openClearDialog(): void {
    this.updateDatabaseStats();
    this.showClearDialog.set(true);
  }

  closeClearDialog(): void {
    this.showClearDialog.set(false);
    if (this.isClearing()) {
      this.isClearing.set(false);
    }
  }

  async clearDatabase(): Promise<void> {
    this.isClearing.set(true);

    try {
      await this.dbService.clearDatabase();
      this.updateDatabaseStats();

      this.showSuccessMessage(
        '✅ Banco de dados limpo com sucesso! Todos os dados foram removidos e o sistema foi reiniciado ao estado inicial.'
      );

      this.showClearDialog.set(false);

    } catch (error) {
      console.error('❌ Erro ao limpar banco de dados:', error);
      this.showErrorMessage(
        '❌ Não foi possível limpar o banco de dados. Por favor, tente novamente ou recarregue a página.'
      );
    } finally {
      this.isClearing.set(false);
    }
  }

  // ==================== MENSAGENS ====================

  private showSuccessMessage(detail: string, summary: string = 'Sucesso'): void {
    this.messageService.add({
      severity: 'success',
      summary,
      detail,
      life: 4000
    });
  }

  private showErrorMessage(detail: string, summary: string = 'Erro'): void {
    this.messageService.add({
      severity: 'error',
      summary,
      detail,
      life: 5000
    });
  }

  // ==================== UTILIDADES ====================

  formatNumber(value: number): string {
    return value.toLocaleString('pt-BR');
  }

  getDatabaseStatus(): string {
    if (!this.dbReady()) {
      return 'Inicializando...';
    }

    const stats = this.dbStats();
    if (stats.totalRecords === 0) {
      return 'Vazio';
    }

    return 'Operacional';
  }

  hasDataToClear(): boolean {
    const stats = this.dbStats();
    return stats.totalRecords > 0;
  }

  getDatabaseVersion(): number {
    // Retorna versão do schema Dexie (versão 2)
    return 2;
  }
}
