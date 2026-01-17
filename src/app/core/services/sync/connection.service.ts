/**
 * ConnectionService - Detecta conectividade com internet e servidor
 * Sistema: Black Beer - Gestão de Vendas
 *
 * Monitora estado de conexão para:
 * - Decidir quando usar modo local vs servidor
 * - Notificar usuário quando conexão é restaurada
 * - Trigger automático de sincronização quando online
 *
 * Estratégias de detecção:
 * 1. navigator.onLine (básico, mas nem sempre confiável)
 * 2. Eventos 'online' e 'offline' do browser
 * 3. Health check periódico com o servidor (mais confiável)
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ConnectionService {
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 segundos
  private readonly HEALTH_CHECK_TIMEOUT = 5000;   // 5 segundos

  private onlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  private serverReachableSubject = new BehaviorSubject<boolean>(false);

  /**
   * Observable que emite true/false quando conexão muda
   * Baseado em navigator.onLine + eventos do browser
   */
  readonly isOnline$: Observable<boolean> = this.onlineSubject.asObservable();

  /**
   * Observable que indica se servidor está acessível
   * Baseado em health checks periódicos
   */
  readonly isServerReachable$: Observable<boolean> = this.serverReachableSubject.asObservable();

  constructor(private http: HttpClient) {
    this.setupEventListeners();
    this.startPeriodicHealthCheck();

    // Fazer health check inicial
    this.checkServerConnection();
  }

  /**
   * Configura listeners para eventos de conectividade do browser
   */
  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      console.log('🟢 Browser detectou conexão online');
      this.updateOnlineStatus();
      this.checkServerConnection(); // Verificar servidor imediatamente
    });

    window.addEventListener('offline', () => {
      console.log('🔴 Browser detectou conexão offline');
      this.updateOnlineStatus();
      this.serverReachableSubject.next(false); // Servidor não está acessível se offline
    });
  }

  /**
   * Atualiza status baseado em navigator.onLine
   */
  private updateOnlineStatus(): void {
    this.onlineSubject.next(navigator.onLine);
  }

  /**
   * Inicia verificação periódica de conexão com servidor
   */
  private startPeriodicHealthCheck(): void {
    interval(this.HEALTH_CHECK_INTERVAL).subscribe(() => {
      if (navigator.onLine) {
        this.checkServerConnection();
      } else {
        this.serverReachableSubject.next(false);
      }
    });
  }

  /**
   * Verifica se servidor está acessível
   * Faz request GET para endpoint de health check
   */
  private async checkServerConnection(): Promise<void> {
    if (!navigator.onLine) {
      this.serverReachableSubject.next(false);
      return;
    }

    try {
      // TODO: Configurar URL do servidor via environment
      const serverUrl = this.getServerUrl();

      if (!serverUrl) {
        // Servidor não configurado ainda
        this.serverReachableSubject.next(false);
        return;
      }

      // Fazer request com timeout
      const isReachable = await this.testServerConnection(serverUrl);
      this.serverReachableSubject.next(isReachable);

      if (isReachable) {
        console.log('✅ Servidor acessível:', serverUrl);
      } else {
        console.log('❌ Servidor não acessível:', serverUrl);
      }
    } catch (error) {
      console.warn('⚠️ Erro ao verificar servidor:', error);
      this.serverReachableSubject.next(false);
    }
  }

  /**
   * Testa conexão com servidor específico
   *
   * @param serverUrl URL base do servidor
   * @returns true se servidor responde
   */
  async testServerConnection(serverUrl: string): Promise<boolean> {
    try {
      const healthUrl = `${serverUrl}/api/health`;

      const response = await this.http
        .get(healthUrl, {
          responseType: 'text',
          observe: 'response'
        })
        .toPromise();

      return response?.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtém URL do servidor configurado
   * TODO: Mover para ConfigService ou Environment
   */
  private getServerUrl(): string | null {
    // Por enquanto, retorna null (servidor não configurado)
    // Será implementado na Fase 5
    return null;

    // Exemplo futuro:
    // return environment.apiUrl;
    // ou
    // return localStorage.getItem('_black_beer_server_url');
  }

  /**
   * Verifica se está online (acesso básico)
   *
   * @returns true se navigator.onLine está true
   */
  isOnline(): boolean {
    return this.onlineSubject.value;
  }

  /**
   * Verifica se servidor está acessível
   *
   * @returns true se último health check foi sucesso
   */
  isServerReachable(): boolean {
    return this.serverReachableSubject.value;
  }

  /**
   * Verifica conectividade completa (online + servidor acessível)
   *
   * @returns true se online E servidor acessível
   */
  isFullyConnected(): boolean {
    return this.isOnline() && this.isServerReachable();
  }

  /**
   * Força verificação imediata de conexão
   * Útil antes de operações críticas
   */
  async forceConnectionCheck(): Promise<boolean> {
    this.updateOnlineStatus();

    if (this.isOnline()) {
      await this.checkServerConnection();
    } else {
      this.serverReachableSubject.next(false);
    }

    return this.isFullyConnected();
  }

  /**
   * Aguarda conexão estar disponível
   * Útil para retry logic
   *
   * @param timeoutMs Tempo máximo de espera em ms
   * @returns Promise que resolve quando conectado ou rejeita se timeout
   */
  async waitForConnection(timeoutMs: number = 30000): Promise<void> {
    if (this.isFullyConnected()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('Timeout aguardando conexão'));
      }, timeoutMs);

      const subscription = this.isServerReachable$.subscribe(isReachable => {
        if (isReachable) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
    });
  }
}
