import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

// PrimeNG
import { CardModule } from 'primeng/card';

// App
import { DatabaseService, EMAIL_CONFIG } from '../../core/services/database';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [
    CommonModule,
    CardModule
  ],
  templateUrl: './help.html',
  styleUrls: ['./help.scss']
})
export class HelpComponent implements OnInit {
  // ==================== INJEÇÃO DE DEPENDÊNCIAS ====================
  private readonly dbService = inject(DatabaseService);

  // ==================== CONSTANTES ====================
  readonly MAX_EMAILS = EMAIL_CONFIG.MAX_EMAILS;
  readonly APP_VERSION = '2.0.0';
  readonly APP_TYPE = 'PWA (Progressive Web App)';
  readonly CURRENT_YEAR = new Date().getFullYear();

  // ==================== COMPUTED SIGNALS ====================

  /**
   * Retorna status do banco
   */
  readonly dbReady = computed(() => this.dbService.isDbReady());

  // ==================== LIFECYCLE HOOKS ====================

  ngOnInit(): void {
    console.log('ℹ️ Componente de ajuda inicializado');
  }

  // ==================== UTILIDADES ====================

  getDatabaseVersion(): number {
    // Retorna versão do schema Dexie (versão 2)
    return 2;
  }

  getSystemStatus(): string {
    return this.dbReady() ? 'Online' : 'Inicializando...';
  }

  isSystemOnline(): boolean {
    return this.dbReady();
  }
}
