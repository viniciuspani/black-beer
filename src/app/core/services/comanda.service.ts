// src/app/core/services/comanda.service.ts
import { Injectable, inject } from '@angular/core';
import { DatabaseService } from './database';
import { Comanda, ComandaStatus, ComandaWithItems } from '../models/comanda.model';

/**
 * Serviço de negócio para gerenciamento de comandas
 * Encapsula a lógica de negócio e valida operações
 */
@Injectable({
  providedIn: 'root'
})
export class ComandaService {
  private readonly dbService = inject(DatabaseService);

  /**
   * Lista todas as comandas disponíveis para uso
   * @returns Array de comandas com status 'disponivel'
   */
  public async getAvailableComandas(): Promise<Comanda[]> {
    const comandas = await this.dbService.getComandasByStatus(ComandaStatus.DISPONIVEL);
    return comandas.filter(c => c.id !== undefined) as Comanda[];
  }

  /**
   * Lista comandas que estão em uso
   * @returns Array de comandas com status 'em_uso'
   */
  public async getInUseComandas(): Promise<Comanda[]> {
    const comandas = await this.dbService.getComandasByStatus(ComandaStatus.EM_USO);
    return comandas.filter(c => c.id !== undefined) as Comanda[];
  }

  /**
   * Lista comandas aguardando pagamento
   * @returns Array de comandas com status 'aguardando_pagamento'
   */
  public async getPendingPaymentComandas(): Promise<Comanda[]> {
    const comandas = await this.dbService.getComandasByStatus(ComandaStatus.AGUARDANDO_PAGAMENTO);
    return comandas.filter(c => c.id !== undefined) as Comanda[];
  }

  /**
   * Abre uma comanda para uso
   * @param numero Número da comanda a ser aberta
   * @throws Error se comanda não estiver disponível
   */
  public async openComanda(numero: number): Promise<void> {
    const comanda = await this.dbService.getComandaByNumero(numero);

    if (!comanda) {
      throw new Error(`Comanda ${numero} não encontrada`);
    }

    if (comanda.status !== ComandaStatus.DISPONIVEL) {
      throw new Error(`Comanda ${numero} não está disponível (status: ${comanda.status})`);
    }

    await this.dbService.openComanda(numero);
  }

  /**
   * Fecha uma comanda e calcula o total
   * @param comandaId ID da comanda a ser fechada
   * @returns Valor total da comanda em reais
   * @throws Error se comanda não estiver em uso
   */
  public async closeComanda(comandaId: number): Promise<number> {
    const comanda = await this.dbService.getComandaById(comandaId);

    if (!comanda) {
      throw new Error(`Comanda ID ${comandaId} não encontrada`);
    }

    if (comanda.status !== ComandaStatus.EM_USO) {
      throw new Error(`Comanda ${comanda.numero} não está em uso`);
    }

    // Valida se há itens na comanda
    const items = await this.dbService.getComandaItems(comandaId);
    if (items.length === 0) {
      throw new Error(`Comanda ${comanda.numero} não possui itens para fechar`);
    }

    await this.dbService.closeComanda(comandaId);

    // Retorna o valor total calculado
    const updatedComanda = await this.dbService.getComandaById(comandaId);
    return updatedComanda?.totalValue ?? 0;
  }

  /**
   * Confirma o pagamento de uma comanda e a libera para reutilização
   * @param comandaId ID da comanda
   * @throws Error se comanda não estiver aguardando pagamento
   */
  public async confirmPayment(comandaId: number): Promise<void> {
    const comanda = await this.dbService.getComandaById(comandaId);

    if (!comanda) {
      throw new Error(`Comanda ID ${comandaId} não encontrada`);
    }

    if (comanda.status !== ComandaStatus.AGUARDANDO_PAGAMENTO) {
      throw new Error(`Comanda ${comanda.numero} não está aguardando pagamento`);
    }

    await this.dbService.confirmPayment(comandaId);
  }

  /**
   * Busca uma comanda completa com todos os seus itens
   * @param comandaId ID da comanda
   * @returns Comanda com array de itens ou null se não encontrada
   */
  public async getComandaWithItems(comandaId: number): Promise<ComandaWithItems | null> {
    return await this.dbService.getComandaWithItems(comandaId);
  }

  /**
   * Valida se todos os itens de uma comanda têm preços configurados
   * @param comandaId ID da comanda
   * @returns true se todos os itens têm preços, false caso contrário
   */
  public async validateComandaPricing(comandaId: number): Promise<boolean> {
    const items = await this.dbService.getComandaItems(comandaId);

    if (items.length === 0) {
      return true; // Comanda vazia é válida
    }

    // Verifica se todos os itens têm preço unitário maior que zero
    return items.every(item => item.unitPrice > 0);
  }

  /**
   * Busca comanda por número
   * @param numero Número da comanda
   * @returns Comanda ou null se não encontrada
   */
  public async getComandaByNumero(numero: number): Promise<Comanda | null> {
    const comanda = await this.dbService.getComandaByNumero(numero);
    if (comanda && comanda.id !== undefined) {
      return comanda as Comanda;
    }
    return null;
  }

  /**
   * Busca comanda por ID
   * @param id ID da comanda
   * @returns Comanda ou null se não encontrada
   */
  public async getComandaById(id: number): Promise<Comanda | null> {
    const comanda = await this.dbService.getComandaById(id);
    if (comanda && comanda.id !== undefined) {
      return comanda as Comanda;
    }
    return null;
  }

  /**
   * Lista todas as comandas do sistema
   * @returns Array com todas as comandas
   */
  public async getAllComandas(): Promise<Comanda[]> {
    const comandas = await this.dbService.getAllComandas();
    return comandas.filter(c => c.id !== undefined) as Comanda[];
  }
}
