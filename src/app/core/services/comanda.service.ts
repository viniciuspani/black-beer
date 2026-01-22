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
  public getAvailableComandas(): Comanda[] {
    return this.dbService.getComandasByStatus(ComandaStatus.DISPONIVEL);
  }

  /**
   * Lista comandas que estão em uso
   * @returns Array de comandas com status 'em_uso'
   */
  public getInUseComandas(): Comanda[] {
    return this.dbService.getComandasByStatus(ComandaStatus.EM_USO);
  }

  /**
   * Lista comandas aguardando pagamento
   * @returns Array de comandas com status 'aguardando_pagamento'
   */
  public getPendingPaymentComandas(): Comanda[] {
    return this.dbService.getComandasByStatus(ComandaStatus.AGUARDANDO_PAGAMENTO);
  }

  /**
   * Abre uma comanda para uso
   * @param numero Número da comanda a ser aberta
   * @throws Error se comanda não estiver disponível
   */
  public openComanda(numero: number): void {
    const comanda = this.dbService.getComandaByNumero(numero);

    if (!comanda) {
      throw new Error(`Comanda ${numero} não encontrada`);
    }

    if (comanda.status !== ComandaStatus.DISPONIVEL) {
      throw new Error(`Comanda ${numero} não está disponível (status: ${comanda.status})`);
    }

    this.dbService.openComanda(numero);
  }

  /**
   * Fecha uma comanda e calcula o total
   * @param comandaId ID da comanda a ser fechada
   * @returns Valor total da comanda em reais
   * @throws Error se comanda não estiver em uso
   */
  public closeComanda(comandaId: number): number {
    const comanda = this.dbService.getComandaById(comandaId);

    if (!comanda) {
      throw new Error(`Comanda ID ${comandaId} não encontrada`);
    }

    if (comanda.status !== ComandaStatus.EM_USO) {
      throw new Error(`Comanda ${comanda.numero} não está em uso`);
    }

    // Valida se há itens na comanda
    const items = this.dbService.getComandaItems(comandaId);
    if (items.length === 0) {
      throw new Error(`Comanda ${comanda.numero} não possui itens para fechar`);
    }

    this.dbService.closeComanda(comandaId);

    // Retorna o valor total calculado
    const updatedComanda = this.dbService.getComandaById(comandaId);
    return updatedComanda?.totalValue ?? 0;
  }

  /**
   * Confirma o pagamento de uma comanda e a libera para reutilização
   * @param comandaId ID da comanda
   * @throws Error se comanda não estiver aguardando pagamento
   */
  public confirmPayment(comandaId: number): void {
    const comanda = this.dbService.getComandaById(comandaId);

    if (!comanda) {
      throw new Error(`Comanda ID ${comandaId} não encontrada`);
    }

    if (comanda.status !== ComandaStatus.AGUARDANDO_PAGAMENTO) {
      throw new Error(`Comanda ${comanda.numero} não está aguardando pagamento`);
    }

    this.dbService.confirmPayment(comandaId);
  }

  /**
   * Busca uma comanda completa com todos os seus itens
   * @param comandaId ID da comanda
   * @returns Comanda com array de itens ou null se não encontrada
   */
  public getComandaWithItems(comandaId: number): ComandaWithItems | null {
    return this.dbService.getComandaWithItems(comandaId);
  }

  /**
   * Valida se todos os itens de uma comanda têm preços configurados
   * @param comandaId ID da comanda
   * @returns true se todos os itens têm preços, false caso contrário
   */
  public validateComandaPricing(comandaId: number): boolean {
    const items = this.dbService.getComandaItems(comandaId);

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
  public getComandaByNumero(numero: number): Comanda | null {
    return this.dbService.getComandaByNumero(numero);
  }

  /**
   * Busca comanda por ID
   * @param id ID da comanda
   * @returns Comanda ou null se não encontrada
   */
  public getComandaById(id: number): Comanda | null {
    return this.dbService.getComandaById(id);
  }

  /**
   * Lista todas as comandas do sistema
   * @returns Array com todas as comandas
   */
  public getAllComandas(): Comanda[] {
    return this.dbService.getAllComandas();
  }
}
