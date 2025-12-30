// src/app/core/services/tab-refresh.service.ts
import { Injectable } from '@angular/core';
import { Subject, Observable, Observer } from 'rxjs';

/**
 * Identificadores das abas principais
 */
export enum MainTab {
  SALES = 'sales',
  REPORTS = 'reports',
  BEERS = 'beers',
  SETTINGS = 'settings'
}

/**
 * Identificadores das sub-abas de configurações
 */
export enum SettingsSubTab {
  USER = 'user',
  SALES = 'sales',
  ADMIN = 'admin',
  HELP = 'help'
}

/**
 * Serviço global para gerenciar atualização de dados quando abas são ativadas
 *
 * Funciona como um Event Bus que notifica componentes quando suas abas ficam ativas,
 * permitindo que cada componente atualize seus dados automaticamente.
 *
 * @example
 * // No componente que precisa ser atualizado:
 * constructor(private tabRefresh: TabRefreshService) {
 *   this.tabRefresh.onTabActivated(MainTab.REPORTS).subscribe(() => {
 *     this.loadData();
 *   });
 * }
 *
 * // No Menu component:
 * this.tabRefresh.notifyTabActivated(MainTab.REPORTS);
 */
@Injectable({
  providedIn: 'root'
})
export class TabRefreshService {

  // Subject para notificar ativação de abas principais
  private mainTabActivated = new Subject<MainTab>();

  // Subject para notificar ativação de sub-abas de configurações
  private settingsSubTabActivated = new Subject<SettingsSubTab>();

  /**
   * Observable geral de ativação de abas principais
   */
  readonly mainTabActivated$ = this.mainTabActivated.asObservable();

  /**
   * Observable geral de ativação de sub-abas de configurações
   */
  readonly settingsSubTabActivated$ = this.settingsSubTabActivated.asObservable();

  /**
   * Notifica que uma aba principal foi ativada
   * @param tab Identificador da aba ativada
   */
  notifyMainTabActivated(tab: MainTab): void {
    console.log(`📢 TabRefresh: Aba principal ativada: ${tab}`);
    this.mainTabActivated.next(tab);
  }

  /**
   * Notifica que uma sub-aba de configurações foi ativada
   * @param subTab Identificador da sub-aba ativada
   */
  notifySettingsSubTabActivated(subTab: SettingsSubTab): void {
    console.log(`📢 TabRefresh: Sub-aba de configurações ativada: ${subTab}`);
    this.settingsSubTabActivated.next(subTab);
  }

  /**
   * Retorna um Observable filtrado para uma aba específica
   * @param tab Aba que o componente quer escutar
   * @returns Observable que emite quando a aba específica é ativada
   *
   * @example
   * this.tabRefresh.onMainTabActivated(MainTab.REPORTS).subscribe(() => {
   *   console.log('Relatórios ativado, atualizando dados...');
   *   this.refreshData();
   * });
   */
  onMainTabActivated(tab: MainTab): Observable<void> {
    return new Observable<void>((observer: { next: () => void }) => {
      const subscription = this.mainTabActivated$.subscribe(activatedTab => {
        if (activatedTab === tab) {
          observer.next();
        }
      });
      return () => subscription.unsubscribe();
    });
  }

  /**
   * Retorna um Observable filtrado para uma sub-aba específica
   * @param subTab Sub-aba que o componente quer escutar
   * @returns Observable que emite quando a sub-aba específica é ativada
   */
  onSettingsSubTabActivated(subTab: SettingsSubTab): Observable<void> {
    return new Observable<void>((observer: { next: () => void }) => {
      const subscription = this.settingsSubTabActivated$.subscribe(activatedSubTab => {
        if (activatedSubTab === subTab) {
          observer.next();
        }
      });
      return () => subscription.unsubscribe();
    });
  }
}
