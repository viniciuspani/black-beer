import { CommonModule } from '@angular/common';
import { Component, signal, inject, effect, computed } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { AvatarModule } from 'primeng/avatar';
import { SalesFormComponent } from '../sales-form/sales-form';
import { AcompanhamentoComandosComponent } from '../acompanhamento-comandas/acompanhamento-comandas';
import { ReportsSectionComponent } from '../reports-section/reports-section';
import { BeerManagementComponent } from '../beer-management/beer-management';
import { SettingsUserComponent } from '../settings-user/settings-user';
import { SettingsSalesComponent } from '../settings-sales/settings-sales';
import { SettingsAdminComponent } from '../settings-admin/settings-admin';
import { HelpComponent } from '../help/help';
import { EventManagementComponent } from '../event-management/event-management';
import { ClientConfigService } from '../../core/services/client-config.service';
import { AuthService } from '../../core/services/auth.service';
import { TabRefreshService, MainTab, SettingsSubTab } from '../../core/services/tab-refresh.service';
import { MenuItem } from 'primeng/api';


@Component({
  selector: 'app-menu',
   standalone: true,
  imports: [
    CommonModule,
    TabsModule,
    TooltipModule,
    ButtonModule,
    MenuModule,
    AvatarModule,
    SalesFormComponent,
    AcompanhamentoComandosComponent,
    BeerManagementComponent,
    ReportsSectionComponent,
    SettingsUserComponent,
    SettingsSalesComponent,
    SettingsAdminComponent,
    EventManagementComponent,
    HelpComponent,
  ],
   templateUrl: './menu.html',
  styleUrl: './menu.scss'

})
export class Menu {
  private readonly clientConfigService = inject(ClientConfigService);
  private readonly authService = inject(AuthService);
  private readonly tabRefreshService = inject(TabRefreshService);

  protected readonly title = signal('black-beer');

  /**
   * Controla qual aba está ativa no mobile
   * 0 = Nova Venda
   * 1 = Comandas
   * 2 = Relatórios
   * 3 = Cervejas
   * 4 = Configurações
   */
  protected readonly activeTabMobile = signal<number>(0);

  /**
   * Controla qual sub-aba de configurações está ativa
   * 0 = Usuário
   * 1 = Vendas/Estoque
   * 2 = Admin
   * 3 = Eventos
   * 4 = Ajuda
   */
  protected readonly activeSettingsTab = signal<number>(0);

  /**
   * Controla qual aba desktop está ativa
   * Usado para sincronizar com PrimeNG p-tabs
   */
  protected readonly activeTabDesktop = signal<string>('0');

  /**
   * Controla qual sub-aba de configurações está ativa no desktop
   */
  protected readonly activeSettingsTabDesktop = signal<string>('0');

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // Effect para notificar quando mudar aba mobile
    effect(() => {
      const activeTab = this.activeTabMobile();
      console.log(`📱 Aba mobile mudou para: ${activeTab}`);
      // SEMPRE notifica, mesmo se for a mesma aba (garante refresh)
      this.notifyTabChange(activeTab);
    });

    // Effect para notificar quando mudar sub-aba de configurações mobile
    effect(() => {
      const activeSettingsTab = this.activeSettingsTab();
      console.log(`⚙️ Sub-aba mobile de configurações mudou para: ${activeSettingsTab}`);
      // SEMPRE notifica, mesmo se for a mesma aba (garante refresh)
      this.notifySettingsSubTabChange(activeSettingsTab);
    });
  }

  /**
   * Atualiza a aba ativa no mobile
   * @param index Índice da aba (0-3)
   */
  protected setActiveTabMobile(index: number): void {
    const currentTab = this.activeTabMobile();

    // Se clicar na mesma aba, força notificação para refresh
    if (currentTab === index) {
      console.log(`🔄 Mesma aba clicada (${index}), forçando refresh...`);
      this.notifyTabChange(index);

      // Se estiver na aba de Configurações, notifica a sub-aba ativa também
      if (index === 4) {
        this.notifySettingsSubTabChange(this.activeSettingsTab());
      }
    }

    this.activeTabMobile.set(index);

    // Scroll suave para o topo ao trocar de aba
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Atualiza a sub-aba ativa de configurações
   * @param index Índice da sub-aba (0-3)
   */
  protected setActiveSettingsTab(index: number): void {
    const currentSubTab = this.activeSettingsTab();

    // Se clicar na mesma sub-aba, força notificação para refresh
    if (currentSubTab === index) {
      console.log(`🔄 Mesma sub-aba clicada (${index}), forçando refresh...`);
      this.notifySettingsSubTabChange(index);
    }

    this.activeSettingsTab.set(index);

    // Scroll suave para o topo ao trocar de sub-aba
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==================== MÉTODOS PARA LOGO DO CLIENTE ====================

  /**
   * Verifica se existe uma logo do cliente configurada
   */
  protected hasClientLogo(): boolean {
    return this.clientConfigService.hasLogo();
  }

  /**
   * Obtém a URL da logo do cliente (base64 data URL)
   */
  protected getClientLogoUrl(): string | null {
    return this.clientConfigService.getLogoUrl();
  }

  /**
   * Obtém o nome da empresa do cliente
   */
  protected getClientCompanyName(): string | null {
    return this.clientConfigService.getCompanyName();
  }

  // ==================== INFORMAÇÕES DO USUÁRIO ====================

  /**
   * Retorna o usuário logado
   */
  protected readonly currentUser = computed(() => this.authService.getCurrentUser());

  /**
   * Retorna as iniciais do nome do usuário para o avatar
   */
  protected getUserInitials(): string {
    const user = this.currentUser();
    if (!user) return '?';

    const username = user.desc_username || user.desc_email;
    const parts = username.split(' ');

    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return username.substring(0, 2).toUpperCase();
  }

  /**
   * Retorna o nome de exibição do usuário
   */
  protected getUserDisplayName(): string {
    const user = this.currentUser();
    if (!user) return 'Usuário';
    return user.desc_username || user.desc_email;
  }

  /**
   * Retorna a tradução do perfil do usuário
   */
  protected getUserRoleLabel(): string {
    const user = this.currentUser();
    if (!user) return '';
    return user.desc_role === 'admin' ? 'Administrador' : 'Usuário';
  }

  /**
   * Itens do menu dropdown do usuário
   */
  protected readonly userMenuItems: MenuItem[] = [
    {
      label: 'Sair',
      icon: 'pi pi-sign-out',
      command: () => this.logout()
    }
  ];

  // ==================== MÉTODOS DE AUTENTICAÇÃO ====================

  /**
   * Handler de logout que previne comportamento padrão e garante execução em mobile
   * @param event Evento de click/touch
   */
  protected handleLogout(event: Event): void {
    // Prevenir comportamento padrão
    event.preventDefault();
    event.stopPropagation();

    // Executar logout
    this.logout();
  }

  /**
   * Realiza logout do usuário e redireciona para tela de login
   */
  protected logout(): void {
    this.authService.logout();
  }

  // ==================== MÉTODOS DE NOTIFICAÇÃO ====================

  /**
   * Notifica mudança de aba principal via serviço
   * @param tabIndex Índice da aba (0=Vendas, 1=Comandas, 2=Relatórios, 3=Cervejas, 4=Configurações)
   */
  private notifyTabChange(tabIndex: number): void {
    const tabMap: { [key: number]: MainTab } = {
      0: MainTab.SALES,
      1: MainTab.COMMANDS,
      2: MainTab.REPORTS,
      3: MainTab.BEERS,
      4: MainTab.SETTINGS
    };

    const tab = tabMap[tabIndex];
    if (tab) {
      this.tabRefreshService.notifyMainTabActivated(tab);
    }
  }

  /**
   * Notifica mudança de sub-aba de configurações via serviço
   * @param subTabIndex Índice da sub-aba (0=User, 1=Sales, 2=Admin, 3=Events, 4=Help)
   */
  private notifySettingsSubTabChange(subTabIndex: number): void {
    const subTabMap: { [key: number]: SettingsSubTab } = {
      0: SettingsSubTab.USER,
      1: SettingsSubTab.SALES,
      2: SettingsSubTab.ADMIN,
      3: SettingsSubTab.EVENTS,
      4: SettingsSubTab.HELP
    };

    const subTab = subTabMap[subTabIndex];
    if (subTab) {
      this.tabRefreshService.notifySettingsSubTabActivated(subTab);
    }
  }

  /**
   * Handler para clique em aba desktop (intercepta TODOS os cliques)
   * @param tabIndex Índice da aba clicada (0-3)
   */
  protected onTabClick(tabIndex: number): void {
    const currentTab = this.activeTabDesktop();

    console.log(`🖱️ Click na aba desktop: ${tabIndex} (atual: ${currentTab})`);

    // SEMPRE notifica quando clicar, mesmo se já estiver ativa
    this.notifyTabChange(tabIndex);

    // Se for aba de Configurações, notifica sub-aba ativa também
    if (tabIndex === 4) {
      const activeSubTab = parseInt(this.activeSettingsTabDesktop());
      this.notifySettingsSubTabChange(activeSubTab);
    }
  }

  /**
   * Handler para mudança de aba desktop (PrimeNG p-tabs onChange)
   * @param event Evento de mudança de aba
   */
  protected onTabChange(event: any): void {
    const tabIndex = event.index;
    this.activeTabDesktop.set(tabIndex.toString());
    console.log(`🖥️ Aba desktop mudou via onChange: ${tabIndex}`);
    // Não precisa notificar aqui pois onTabClick já fez
  }

  /**
   * Handler para clique em sub-aba de configurações desktop (intercepta TODOS os cliques)
   * @param tabIndex Índice da sub-aba clicada (0-3)
   */
  protected onSettingsTabClick(tabIndex: number): void {
    const currentSubTab = this.activeSettingsTabDesktop();

    console.log(`🖱️ Click na sub-aba desktop de configurações: ${tabIndex} (atual: ${currentSubTab})`);

    // SEMPRE notifica quando clicar, mesmo se já estiver ativa
    this.notifySettingsSubTabChange(tabIndex);
  }

  /**
   * Handler para mudança de sub-aba de configurações desktop (PrimeNG p-tabs onChange)
   * @param event Evento de mudança de aba
   */
  protected onSettingsTabChange(event: any): void {
    const tabIndex = event.index;
    this.activeSettingsTabDesktop.set(tabIndex.toString());
    console.log(`⚙️ Sub-aba desktop de configurações mudou via onChange: ${tabIndex}`);
    // Não precisa notificar aqui pois onSettingsTabClick já fez
  }
}
