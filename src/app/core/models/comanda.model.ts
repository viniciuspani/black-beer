// src/app/core/models/comanda.model.ts

/**
 * Status possíveis de uma comanda
 */
export enum ComandaStatus {
  DISPONIVEL = 'disponivel',
  EM_USO = 'em_uso',
  AGUARDANDO_PAGAMENTO = 'aguardando_pagamento'
}

/**
 * Interface da comanda no banco de dados
 */
export interface Comanda {
  id: number;
  numero: number;
  status: ComandaStatus;
  totalValue: number;
  openedAt: string | null;
  closedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Item de venda dentro de uma comanda
 */
export interface ComandaItem {
  saleId: number;
  beerId: number;
  beerName: string;
  cupSize: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  timestamp: string;
}

/**
 * Comanda completa com seus itens de venda
 */
export interface ComandaWithItems extends Comanda {
  items: ComandaItem[];
}

/**
 * Type guard para verificar se um objeto é uma Comanda válida
 */
export function isComanda(obj: any): obj is Comanda {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.numero === 'number' &&
    typeof obj.status === 'string' &&
    Object.values(ComandaStatus).includes(obj.status)
  );
}
