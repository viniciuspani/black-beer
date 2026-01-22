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
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 * - dt_ : Colunas TEXT com DEFAULT CURRENT_TIMESTAMP
 */
export interface Comanda {
  num_id: number;
  num_numero: number;
  desc_status: ComandaStatus;
  num_total_value: number;
  dt_opened_at: string | null;
  dt_closed_at: string | null;
  dt_paid_at: string | null;
  dt_created_at: string;
  dt_updated_at: string;
}

/**
 * Item de venda dentro de uma comanda
 */
export interface ComandaItem {
  num_sale_id: number;
  num_beer_id: number;
  desc_beer_name: string;
  num_cup_size: number;
  num_quantity: number;
  num_unit_price: number;
  num_total_price: number;
  dt_timestamp: string;
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
    typeof obj.num_id === 'number' &&
    typeof obj.num_numero === 'number' &&
    typeof obj.desc_status === 'string' &&
    Object.values(ComandaStatus).includes(obj.desc_status)
  );
}
