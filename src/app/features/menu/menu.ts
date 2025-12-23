import { CommonModule } from '@angular/common';
import { Component, signal, inject } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { SalesFormComponent } from '../sales-form/sales-form';
import { ReportsSectionComponent } from '../reports-section/reports-section';
import { BeerManagementComponent } from '../beer-management/beer-management';
import { SettingsUserComponent } from '../settings-user/settings-user';
import { SettingsSalesComponent } from '../settings-sales/settings-sales';
import { SettingsAdminComponent } from '../settings-admin/settings-admin';
import { HelpComponent } from '../help/help';
import { ClientConfigService } from '../../core/services/client-config.service';
import { AuthService } from '../../core/services/auth.service';


@Component({
  selector: 'app-menu',
   standalone: true,
  imports: [
    CommonModule,
    TabsModule,
    TooltipModule,
    ButtonModule,
    SalesFormComponent,
    BeerManagementComponent,
    ReportsSectionComponent,
    SettingsUserComponent,
    SettingsSalesComponent,
    SettingsAdminComponent,
    HelpComponent,
  ],
   templateUrl: './menu.html',
  styleUrl: './menu.scss'

})
export class Menu {
  private readonly clientConfigService = inject(ClientConfigService);
  private readonly authService = inject(AuthService);

  protected readonly title = signal('black-beer');

  /**
   * Controla qual aba está ativa no mobile
   * 0 = Nova Venda
   * 1 = Relatórios
   * 2 = Cervejas
   * 3 = Configurações
   */
  protected readonly activeTabMobile = signal<number>(0);

  /**
   * Controla qual sub-aba de configurações está ativa
   * 0 = Usuário
   * 1 = Vendas/Estoque
   * 2 = Admin
   * 3 = Ajuda
   */
  protected readonly activeSettingsTab = signal<number>(0);

  /**
   * Atualiza a aba ativa no mobile
   * @param index Índice da aba (0-3)
   */
  protected setActiveTabMobile(index: number): void {
    this.activeTabMobile.set(index);

    // Scroll suave para o topo ao trocar de aba
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Atualiza a sub-aba ativa de configurações
   * @param index Índice da sub-aba (0-2)
   */
  protected setActiveSettingsTab(index: number): void {
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
}
