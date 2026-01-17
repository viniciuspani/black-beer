// src/app/core/services/sales.service.ts
import { Injectable, inject } from '@angular/core';
import { DatabaseService } from './database';

/**
 * Serviço de negócio para operações relacionadas a vendas
 *
 * Responsabilidades:
 * - Encapsular lógica de negócio de vendas
 * - Servir como camada intermediária entre componentes e DatabaseService
 * - Processar e formatar dados antes de retornar aos componentes
 *
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private readonly dbService = inject(DatabaseService);

  /**
   * Obtém o valor total de vendas (receita) em R$
   *
   * @param startDate Data inicial do filtro (opcional)
   * @param endDate Data final do filtro (opcional)
   * @param eventId ID do evento para filtrar (opcional)
   * @returns Valor total em reais
   *
   * @example
   * // Obter receita total de todas as vendas
   * const totalRevenue = this.salesService.getTotalRevenue();
   *
   * @example
   * // Obter receita de um período específico
   * const revenue = this.salesService.getTotalRevenue(startDate, endDate);
   *
   * @example
   * // Obter receita de um evento específico
   * const revenue = this.salesService.getTotalRevenue(undefined, undefined, eventId);
   */
  public async getTotalRevenue(startDate?: Date, endDate?: Date, eventId?: number): Promise<number> {
    if (!this.dbService.isDbReady()) {
      console.warn('⚠️ Banco de dados não está pronto');
      return 0;
    }

    // Converter Date para string ISO
    const startStr = startDate?.toISOString();
    const endStr = endDate?.toISOString();

    return await this.dbService.getTotalRevenue(startStr, endStr, eventId);
  }

  /**
   * Verifica se há preços configurados para uma cerveja específica
   *
   * @param beerId ID da cerveja
   * @returns true se há preços configurados, false caso contrário
   */
  public async hasPriceConfiguration(beerId: number): Promise<boolean> {
    const config = await this.dbService.getSalesConfigByBeerId(beerId);
    return config !== null;
  }

  /**
   * Obtém o preço unitário de uma cerveja para um tamanho específico
   *
   * @param beerId ID da cerveja
   * @param cupSize Tamanho do copo (300, 500 ou 1000)
   * @returns Preço em reais ou 0 se não configurado
   */
  public async getUnitPrice(beerId: number, cupSize: 300 | 500 | 1000): Promise<number> {
    const config = await this.dbService.getSalesConfigByBeerId(beerId);

    if (!config) {
      return 0;
    }

    switch (cupSize) {
      case 300:
        return Number(config.price300ml) || 0;
      case 500:
        return Number(config.price500ml) || 0;
      case 1000:
        return Number(config.price1000ml) || 0;
      default:
        return 0;
    }
  }

  /**
   * Calcula o valor de uma venda específica
   *
   * @param beerId ID da cerveja
   * @param cupSize Tamanho do copo
   * @param quantity Quantidade de copos
   * @returns Valor total em reais
   */
  public async calculateSaleValue(
    beerId: number,
    cupSize: 300 | 500 | 1000,
    quantity: number
  ): Promise<number> {
    const unitPrice = await this.getUnitPrice(beerId, cupSize);
    return unitPrice * quantity;
  }
}
