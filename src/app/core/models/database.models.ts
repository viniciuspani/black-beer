/**
 * Modelos consolidados do banco de dados com suporte a sincronização
 * Sistema: Black Beer - Gestão de Vendas
 * Versão: 2.0.0 (Dexie.js + Sync)
 *
 * Este arquivo estende os models existentes adicionando campos de sincronização
 */

import { SyncFields } from './sync.models';

// Re-exportar tipos básicos dos models existentes
export type { BeerType, CupSize } from './beer.model';
export { CUP_SIZES } from './beer.model';
export type { User } from './user.model';
export type { Event } from './event.model';
export type { Comanda } from './comanda.model';
export type { ClientConfig } from './client-config.model';
export * from './sync.models';

/**
 * Sale - Estendido com campos de sincronização
 */
export interface Sale extends SyncFields {
  id?: number;
  beerId: number;
  beerName: string;
  cupSize: 300 | 500 | 1000;
  quantity: number;
  timestamp: string;
  totalVolume: number;
  comandaId?: number | null;
  userId: number;
  eventId?: number | null;
}

/**
 * BeerType - Estendido com campos de sincronização
 */
export interface BeerTypeWithSync extends SyncFields {
  id?: number;
  name: string;
  color: string;
  description: string;
}

/**
 * User - Estendido com campos de sincronização
 */
export interface UserWithSync extends SyncFields {
  id?: number;
  username: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  lastLoginAt?: string;
}

/**
 * Event - Estendido com campos de sincronização
 */
export interface EventWithSync extends SyncFields {
  id?: number;
  nameEvent: string;
  localEvent: string;
  dataEvent: string;
  contactEvent?: string;
  nameContactEvent?: string;
  status: 'planejamento' | 'ativo' | 'finalizado';
}

/**
 * Comanda - Estendido com campos de sincronização
 */
export interface ComandaWithSync extends SyncFields {
  id?: number;
  numero: number;
  status: 'disponivel' | 'em_uso' | 'aguardando_pagamento';
  totalValue: number;
  openedAt: string | null;
  closedAt: string | null;
  paidAt: string | null;
}

/**
 * SalesConfig - Configuração de preços por cerveja e tamanho
 */
export interface SalesConfig extends SyncFields {
  id?: number;
  beerId: number;
  beerName: string;
  price300ml: number;
  price500ml: number;
  price1000ml: number;
  eventId?: number | null;
}

/**
 * EventSale - Estoque de cerveja por evento
 */
export interface EventSale extends SyncFields {
  id?: number;
  beerId: number;
  beerName: string;
  quantidadeLitros: number;
  minLitersAlert: number;
  eventId?: number | null;
}

/**
 * Settings - Configurações gerais (sem sync - local only)
 */
export interface Settings {
  id?: number;
  email: string;
  isConfigured: boolean;
}

/**
 * StockAlertConfig - Configuração de alertas de estoque (sem sync - local only)
 */
export interface StockAlertConfig {
  id: number;
  minLiters: number;
  updatedAt: string;
}

/**
 * ClientConfig - Configuração white-label (sem sync - local only)
 */
export interface ClientConfigLocal {
  id: number;
  companyName?: string;
  logoBase64?: string;
  logoMimeType?: string;
  logoFileName?: string;
  updatedAt: string;
}

/**
 * Type guards para validação em runtime
 */

export function isSale(obj: any): obj is Sale {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.beerId === 'number' &&
    typeof obj.beerName === 'string' &&
    (obj.cupSize === 300 || obj.cupSize === 500 || obj.cupSize === 1000) &&
    typeof obj.quantity === 'number' &&
    typeof obj.timestamp === 'string' &&
    typeof obj.totalVolume === 'number' &&
    typeof obj.userId === 'number'
  );
}

export function isSalesConfig(obj: any): obj is SalesConfig {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.beerId === 'number' &&
    typeof obj.beerName === 'string' &&
    typeof obj.price300ml === 'number' &&
    typeof obj.price500ml === 'number' &&
    typeof obj.price1000ml === 'number'
  );
}

export function isEventSale(obj: any): obj is EventSale {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.beerId === 'number' &&
    typeof obj.beerName === 'string' &&
    typeof obj.quantidadeLitros === 'number' &&
    typeof obj.minLitersAlert === 'number'
  );
}

/**
 * Helpers para conversão de dados
 */

/**
 * Converte boolean para SQLite (0 ou 1)
 */
export function toDbBoolean(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Converte valor SQLite (0 ou 1) para boolean
 */
export function fromDbBoolean(value: number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  return value === 1;
}

/**
 * Gera fingerprint simples do conteúdo de uma venda
 * Usado para detectar duplicatas
 */
export function generateSaleFingerprint(sale: Partial<Sale>): string {
  const data = `${sale.beerId}|${sale.quantity}|${sale.cupSize}|${sale.timestamp}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Constantes do banco de dados
 */
export const DATABASE_CONSTANTS = {
  NAME: 'BlackBeerDB',
  VERSION: 10,
  STORAGE_KEYS: {
    DEVICE_ID: '_black_beer_device_id',
    USER_ID: '_black_beer_user_id',
    DATABASE_MODE: '_black_beer_db_mode',
    LAST_SYNC: '_black_beer_last_sync',
    MIGRATED: '_black_beer_migrated_to_dexie'
  }
} as const;
