/**
 * DatabaseV2Service - Implementação com Dexie.js e IndexedDB
 * Sistema: Black Beer - Gestão de Vendas
 * Versão: 2.0.0
 *
 * Substitui o DatabaseService (SQL.js) por uma implementação moderna
 * usando Dexie.js (wrapper sobre IndexedDB).
 *
 * VANTAGENS:
 * - Performance 10-100x melhor em operações de escrita
 * - Assíncrono (não bloqueia UI)
 * - Suporta até 50+ MB de dados (vs 5-10 MB do localStorage)
 * - Transações ACID nativas
 * - Preparado para sincronização com servidor
 *
 * ARQUITETURA:
 * - 10 tabelas principais (espelha schema SQL.js v9)
 * - Campos de sincronização (_localId, _syncStatus, etc.)
 * - Hooks automáticos para preencher metadados
 * - Type safety completo com TypeScript
 */

import Dexie, { Table } from 'dexie';
import { Injectable, signal, WritableSignal, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Constantes para validação de emails
 */
export const EMAIL_CONFIG = {
  MIN_EMAILS: 1,
  MAX_EMAILS: 10,
  SEPARATOR: ';'
} as const;

import {
  BeerType,
  Sale,
  UserWithSync,
  EventWithSync,
  ComandaWithSync,
  SalesConfig,
  EventSale,
  Settings,
  StockAlertConfig,
  ClientConfigLocal,
  DATABASE_CONSTANTS,
  generateSaleFingerprint
} from '../models/database.models';
import { SecureIdGeneratorService } from './sync/secure-id-generator.service';

/**
 * Classe principal do banco de dados Dexie
 */
export class BlackBeerDatabase extends Dexie {
  // ✅ Tabelas principais
  beerTypes!: Table<BeerType, number>;
  sales!: Table<Sale, number>;
  users!: Table<UserWithSync, number>;
  events!: Table<EventWithSync, number>;
  comandas!: Table<ComandaWithSync, number>;

  // ✅ Tabelas de configuração
  salesConfig!: Table<SalesConfig, number>;
  eventSale!: Table<EventSale, number>;
  settings!: Table<Settings, number>;
  stockAlertConfig!: Table<StockAlertConfig, number>;
  clientConfig!: Table<ClientConfigLocal, number>;

  private idGenerator: SecureIdGeneratorService;

  constructor(idGenerator: SecureIdGeneratorService) {
    super(DATABASE_CONSTANTS.NAME);
    this.idGenerator = idGenerator;

    // ✅ SCHEMA VERSION 10 (espelhando SQL.js v9 + campos de sync)
    this.version(10).stores({
      // TABELAS PRINCIPAIS
      // Sintaxe Dexie:
      // '++id' = auto-increment
      // '&name' = unique index
      // '[a+b]' = compound index
      // 'field' = simple index

      beerTypes: `
        ++id,
        &name,
        color,
        _localId,
        _syncStatus,
        createdAt,
        updatedAt
      `.replace(/\s+/g, ' ').trim(),

      sales: `
        ++id,
        beerId,
        timestamp,
        comandaId,
        userId,
        eventId,
        cupSize,
        _localId,
        _userId,
        [_userId+_localId],
        _syncStatus,
        _fingerprint,
        createdAt,
        updatedAt
      `.replace(/\s+/g, ' ').trim(),

      users: `
        ++id,
        &username,
        &email,
        role,
        _localId,
        _syncStatus,
        createdAt,
        updatedAt
      `.replace(/\s+/g, ' ').trim(),

      events: `
        ++id,
        status,
        dataEvent,
        nameEvent,
        _localId,
        _syncStatus,
        createdAt,
        updatedAt
      `.replace(/\s+/g, ' ').trim(),

      comandas: `
        ++id,
        &numero,
        status,
        openedAt,
        closedAt,
        _localId,
        _syncStatus,
        createdAt,
        updatedAt
      `.replace(/\s+/g, ' ').trim(),

      // TABELAS DE CONFIGURAÇÃO

      salesConfig: `
        ++id,
        beerId,
        eventId,
        [beerId+eventId],
        _localId,
        _syncStatus,
        createdAt,
        updatedAt
      `.replace(/\s+/g, ' ').trim(),

      eventSale: `
        ++id,
        beerId,
        eventId,
        [beerId+eventId],
        _localId,
        _syncStatus,
        createdAt,
        updatedAt
      `.replace(/\s+/g, ' ').trim(),

      settings: `
        ++id,
        &email
      `.replace(/\s+/g, ' ').trim(),

      stockAlertConfig: `
        id
      `.replace(/\s+/g, ' ').trim(),

      clientConfig: `
        id
      `.replace(/\s+/g, ' ').trim()
    });

    // ✅ Configurar hooks após definição do schema
    this.setupHooks();
  }

  /**
   * Configura hooks para auto-preencher campos de sincronização
   */
  private setupHooks(): void {
    // Tabelas que precisam de campos de sincronização
    const tablesWithSync: Table<any, number>[] = [
      this.beerTypes,
      this.sales,
      this.users,
      this.events,
      this.comandas,
      this.salesConfig,
      this.eventSale
    ];

    tablesWithSync.forEach(table => {
      // Hook executado ANTES de criar registro
      table.hook('creating', (_primKey, obj, _transaction) => {
        const now = new Date().toISOString();

        // Gerar _localId se não existir
        if (!obj._localId) {
          obj._localId = this.idGenerator.generateSecureId();
        }

        // Definir status de sync como pending
        if (!obj._syncStatus) {
          obj._syncStatus = 'pending';
        }

        // Timestamps
        if (!obj.createdAt) {
          obj.createdAt = now;
        }

        if (!obj.updatedAt) {
          obj.updatedAt = now;
        }

        // Para vendas, adicionar campos específicos
        if (table === this.sales) {
          if (!obj._userId) {
            obj._userId = this.getCurrentUserId();
          }

          if (!obj._fingerprint) {
            obj._fingerprint = generateSaleFingerprint(obj);
          }
        }
      });

      // Hook executado ANTES de atualizar registro
      table.hook('updating', (modifications: any, _primKey, obj: any, _transaction) => {
        // Atualizar timestamp
        modifications.updatedAt = new Date().toISOString();

        // Marcar como pendente de sync (se não foi explicitamente marcado)
        if (modifications._syncStatus === undefined) {
          modifications._syncStatus = 'pending';
        }

        // Para vendas, atualizar fingerprint se dados relevantes mudaram
        if (table === this.sales) {
          const hasRelevantChange =
            modifications.beerId !== undefined ||
            modifications.quantity !== undefined ||
            modifications.cupSize !== undefined ||
            modifications.timestamp !== undefined;

          if (hasRelevantChange) {
            const updatedSale = { ...obj, ...modifications };
            modifications._fingerprint = generateSaleFingerprint(updatedSale);
          }
        }
      });
    });
  }

  /**
   * Obtém ID do usuário atual
   * TODO: Integrar com AuthService quando disponível
   */
  private getCurrentUserId(): string {
    const userId = localStorage.getItem(DATABASE_CONSTANTS.STORAGE_KEYS.USER_ID);
    return userId || 'guest';
  }
}

/**
 * Service Angular para gerenciar o banco de dados Dexie
 */
@Injectable({
  providedIn: 'root'
})
export class DatabaseV2Service {
  private db!: BlackBeerDatabase;
  private isBrowser: boolean;

  // ✅ Signal para indicar quando DB está pronto
  public readonly isDbReady: WritableSignal<boolean> = signal(false);

  constructor(
    idGenerator: SecureIdGeneratorService,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    // Só inicializar Dexie no browser (IndexedDB não existe no SSR)
    if (!this.isBrowser) {
      console.log('⚠️ DatabaseV2Service: SSR detectado, Dexie não será inicializado');
      return;
    }

    console.log('🚀 DatabaseV2Service: Inicializando Dexie.js...');

    this.db = new BlackBeerDatabase(idGenerator);

    // Abrir banco e marcar como pronto
    this.db.open()
      .then(() => {
        this.isDbReady.set(true);
        console.log('✅ DatabaseV2Service: Banco Dexie.js pronto!');
      })
      .catch(err => {
        console.error('❌ DatabaseV2Service: Erro ao abrir banco:', err);
        this.isDbReady.set(false);
      });
  }

  /**
   * Obtém instância do banco Dexie
   * Use para queries avançadas
   */
  getDatabase(): BlackBeerDatabase {
    if (!this.isBrowser) {
      throw new Error('DatabaseV2Service: Dexie não está disponível no SSR');
    }
    return this.db;
  }

  /**
   * Verifica se banco está pronto
   */
  isDatabaseReady(): boolean {
    return this.isBrowser && this.isDbReady();
  }

  /**
   * Aguarda banco estar pronto
   */
  async waitForReady(): Promise<void> {
    if (!this.isBrowser) {
      console.warn('DatabaseV2Service: Tentativa de aguardar DB no SSR, ignorando');
      return Promise.resolve();
    }

    if (this.isDbReady()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.isDbReady()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Obtém estatísticas do banco
   * SSR-safe: retorna zeros se não estiver no browser
   */
  async getDatabaseStats(): Promise<{
    beerTypes: number;
    sales: number;
    users: number;
    events: number;
    comandas: number;
    totalRecords: number;
  }> {
    // Retornar zeros no SSR
    if (!this.isBrowser || !this.db) {
      return {
        beerTypes: 0,
        sales: 0,
        users: 0,
        events: 0,
        comandas: 0,
        totalRecords: 0
      };
    }

    const stats = {
      beerTypes: await this.db.beerTypes.count(),
      sales: await this.db.sales.count(),
      users: await this.db.users.count(),
      events: await this.db.events.count(),
      comandas: await this.db.comandas.count(),
      totalRecords: 0
    };

    stats.totalRecords =
      stats.beerTypes +
      stats.sales +
      stats.users +
      stats.events +
      stats.comandas;

    return stats;
  }

  /**
   * Limpa todos os dados do banco (CUIDADO!)
   * SSR-safe: não faz nada se não estiver no browser
   */
  async clearAllData(): Promise<void> {
    if (!this.isBrowser || !this.db) {
      console.warn('DatabaseV2Service: clearAllData chamado no SSR, ignorando');
      return;
    }

    await this.db.transaction('rw', this.db.tables, async () => {
      await Promise.all(
        this.db.tables.map(table => table.clear())
      );
    });

    console.log('🗑️ Todos os dados foram removidos do banco Dexie');
  }

  /**
   * Deleta o banco completamente
   * SSR-safe: não faz nada se não estiver no browser
   */
  async deleteDatabase(): Promise<void> {
    if (!this.isBrowser || !this.db) {
      console.warn('DatabaseV2Service: deleteDatabase chamado no SSR, ignorando');
      return;
    }

    await this.db.delete();
    console.log('💥 Banco Dexie deletado completamente');
  }

  /**
   * Exporta dados para JSON (backup)
   * SSR-safe: retorna JSON vazio se não estiver no browser
   */
  async exportToJSON(): Promise<string> {
    if (!this.isBrowser || !this.db) {
      console.warn('DatabaseV2Service: exportToJSON chamado no SSR, retornando vazio');
      return JSON.stringify({ exportedAt: new Date().toISOString(), ssr: true }, null, 2);
    }

    const data = {
      beerTypes: await this.db.beerTypes.toArray(),
      sales: await this.db.sales.toArray(),
      users: await this.db.users.toArray(),
      events: await this.db.events.toArray(),
      comandas: await this.db.comandas.toArray(),
      salesConfig: await this.db.salesConfig.toArray(),
      eventSale: await this.db.eventSale.toArray(),
      settings: await this.db.settings.toArray(),
      stockAlertConfig: await this.db.stockAlertConfig.toArray(),
      clientConfig: await this.db.clientConfig.toArray(),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }

  // ==================== USERS ====================

  /**
   * Busca todos os usuários
   * @returns Promise com array de usuários
   */
  async getUsuarios(): Promise<UserWithSync[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    return await this.db.users.toArray();
  }

  // ==================== EVENTS CRUD ====================

  /**
   * Cria um novo evento
   * @param eventData Dados do evento
   * @returns Promise com ID do evento criado ou null se falhar
   */
  async createEvent(eventData: {
    nameEvent: string;
    localEvent: string;
    dataEvent: string;
    contactEvent?: string;
    nameContactEvent?: string;
    status?: 'planejamento' | 'ativo' | 'finalizado';
  }): Promise<number | null> {
    if (!this.isBrowser || !this.db) {
      console.error('❌ Banco de dados não inicializado');
      return null;
    }

    try {
      const now = new Date().toISOString();
      const status = eventData.status || 'planejamento';

      console.log('📝 Criando evento:', eventData);

      const eventId = await this.db.events.add({
        nameEvent: eventData.nameEvent,
        localEvent: eventData.localEvent,
        dataEvent: eventData.dataEvent,
        contactEvent: eventData.contactEvent || undefined,
        nameContactEvent: eventData.nameContactEvent || undefined,
        status,
        createdAt: now,
        updatedAt: now
      });

      console.log('✅ Evento criado com sucesso - ID:', eventId);
      return eventId;
    } catch (error) {
      console.error('❌ Erro ao criar evento:', error);
      console.error('   Detalhes do evento:', eventData);
      return null;
    }
  }

  /**
   * Busca todos os eventos ordenados por data (mais recentes primeiro)
   * @returns Promise com array de eventos
   */
  async getAllEvents(): Promise<EventWithSync[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    return await this.db.events
      .orderBy('dataEvent')
      .reverse()
      .toArray();
  }

  /**
   * Busca eventos por status
   * @param status Status do evento (planejamento, ativo, finalizado)
   * @returns Promise com array de eventos com o status especificado
   */
  async getEventsByStatus(status: 'planejamento' | 'ativo' | 'finalizado'): Promise<EventWithSync[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    return await this.db.events
      .where('status')
      .equals(status)
      .reverse()
      .sortBy('dataEvent');
  }

  /**
   * Busca evento por ID
   * @param id ID do evento
   * @returns Promise com evento ou null se não encontrado
   */
  async getEventById(id: number): Promise<EventWithSync | null> {
    if (!this.isBrowser || !this.db) {
      return null;
    }

    const event = await this.db.events.get(id);
    return event || null;
  }

  /**
   * Atualiza um evento existente
   * @param id ID do evento
   * @param eventData Dados a serem atualizados (parciais)
   * @returns Promise com true se atualizado com sucesso, false caso contrário
   */
  async updateEvent(id: number, eventData: {
    nameEvent?: string;
    localEvent?: string;
    dataEvent?: string;
    contactEvent?: string;
    nameContactEvent?: string;
    status?: 'planejamento' | 'ativo' | 'finalizado';
  }): Promise<boolean> {
    if (!this.isBrowser || !this.db) {
      return false;
    }

    try {
      const now = new Date().toISOString();

      // Criar objeto de atualização apenas com campos definidos
      const updates: any = {
        updatedAt: now
      };

      if (eventData.nameEvent !== undefined) updates.nameEvent = eventData.nameEvent;
      if (eventData.localEvent !== undefined) updates.localEvent = eventData.localEvent;
      if (eventData.dataEvent !== undefined) updates.dataEvent = eventData.dataEvent;
      if (eventData.contactEvent !== undefined) updates.contactEvent = eventData.contactEvent || undefined;
      if (eventData.nameContactEvent !== undefined) updates.nameContactEvent = eventData.nameContactEvent || undefined;
      if (eventData.status !== undefined) updates.status = eventData.status;

      const updateCount = await this.db.events.update(id, updates);

      if (updateCount > 0) {
        console.log('✅ Evento atualizado com sucesso:', id);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Erro ao atualizar evento:', error);
      return false;
    }
  }

  /**
   * Deleta um evento
   * ATENÇÃO: Isso irá:
   * - Deletar configurações de estoque relacionadas (event_sale CASCADE)
   * - Deletar configurações de preços relacionadas (sales_config CASCADE)
   * - Setar eventId = null nas vendas relacionadas
   *
   * @param id ID do evento
   * @returns Promise com true se deletado com sucesso, false caso contrário
   */
  async deleteEvent(id: number): Promise<boolean> {
    if (!this.isBrowser || !this.db) {
      return false;
    }

    try {
      await this.db.transaction('rw', [this.db.events, this.db.eventSale, this.db.salesConfig, this.db.sales], async () => {
        // Deletar configurações de estoque do evento
        await this.db.eventSale.where('eventId').equals(id).delete();

        // Deletar configurações de preço do evento
        await this.db.salesConfig.where('eventId').equals(id).delete();

        // Setar eventId = null nas vendas
        const salesToUpdate = await this.db.sales.where('eventId').equals(id).toArray();
        for (const sale of salesToUpdate) {
          await this.db.sales.update(sale.id!, { eventId: undefined });
        }

        // Deletar o evento
        await this.db.events.delete(id);
      });

      console.log('✅ Evento deletado com sucesso:', id);
      return true;
    } catch (error) {
      console.error('❌ Erro ao deletar evento:', error);
      return false;
    }
  }

  /**
   * Busca eventos ativos (status = 'ativo')
   * Útil para seletor de eventos na tela de vendas
   * @returns Promise com array de eventos ativos
   */
  async getActiveEvents(): Promise<EventWithSync[]> {
    return this.getEventsByStatus('ativo');
  }

  /**
   * Muda o status de um evento
   * @param id ID do evento
   * @param status Novo status
   * @returns Promise com true se atualizado com sucesso, false caso contrário
   */
  async updateEventStatus(id: number, status: 'planejamento' | 'ativo' | 'finalizado'): Promise<boolean> {
    return this.updateEvent(id, { status });
  }

  /**
   * Busca estatísticas de um evento (total de vendas, volume, receita)
   * @param eventId ID do evento
   * @returns Promise com objeto contendo estatísticas do evento
   */
  async getEventStatistics(eventId: number): Promise<{
    totalSales: number;
    totalVolume: number;
    totalRevenue: number;
    salesByBeer: any[];
  }> {
    if (!this.isBrowser || !this.db) {
      return {
        totalSales: 0,
        totalVolume: 0,
        totalRevenue: 0,
        salesByBeer: []
      };
    }

    try {
      // Buscar todas as vendas do evento
      const sales = await this.db.sales.where('eventId').equals(eventId).toArray();

      const totalSales = sales.length;
      const totalVolume = sales.reduce((sum, sale) => sum + (sale.totalVolume || 0), 0);

      // Buscar configurações de preço para calcular receita
      const salesConfig = await this.db.salesConfig
        .where('eventId')
        .equals(eventId)
        .toArray();

      // Criar map de preços por beerId
      const priceMap = new Map<number, SalesConfig>();
      for (const config of salesConfig) {
        priceMap.set(config.beerId, config);
      }

      // Calcular receita total e por cerveja
      let totalRevenue = 0;
      const salesByBeerMap = new Map<number, any>();

      for (const sale of sales) {
        const config = priceMap.get(sale.beerId);
        let saleRevenue = 0;

        if (config) {
          switch (sale.cupSize) {
            case 300:
              saleRevenue = sale.quantity * (config.price300ml || 0);
              break;
            case 500:
              saleRevenue = sale.quantity * (config.price500ml || 0);
              break;
            case 1000:
              saleRevenue = sale.quantity * (config.price1000ml || 0);
              break;
          }
        }

        totalRevenue += saleRevenue;

        // Agrupar por cerveja
        if (!salesByBeerMap.has(sale.beerId)) {
          salesByBeerMap.set(sale.beerId, {
            beerName: sale.beerName,
            salesCount: 0,
            totalQuantity: 0,
            totalVolume: 0,
            revenue: 0
          });
        }

        const beerStats = salesByBeerMap.get(sale.beerId);
        beerStats.salesCount++;
        beerStats.totalQuantity += sale.quantity;
        beerStats.totalVolume += sale.totalVolume;
        beerStats.revenue += saleRevenue;
      }

      // Converter map para array e ordenar por receita
      const salesByBeer = Array.from(salesByBeerMap.values())
        .sort((a, b) => b.revenue - a.revenue);

      return {
        totalSales,
        totalVolume,
        totalRevenue,
        salesByBeer
      };
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas do evento:', error);
      return {
        totalSales: 0,
        totalVolume: 0,
        totalRevenue: 0,
        salesByBeer: []
      };
    }
  }

  /**
   * Busca todas as vendas de um evento com informações do usuário
   * @param eventId ID do evento
   * @param filters Filtros opcionais (startDate, endDate)
   * @returns Promise com array de vendas do evento
   */
  async getSalesByEvent(eventId: number, filters?: { startDate?: string; endDate?: string }): Promise<any[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    try {
      let sales = await this.db.sales
        .where('eventId')
        .equals(eventId)
        .reverse()
        .sortBy('timestamp');

      // Aplicar filtros de data se fornecidos
      if (filters?.startDate) {
        sales = sales.filter(sale => sale.timestamp >= filters.startDate!);
      }
      if (filters?.endDate) {
        sales = sales.filter(sale => sale.timestamp <= filters.endDate!);
      }

      // Buscar informações dos usuários
      const userIds = [...new Set(sales.map(sale => sale.userId))];
      const users = await this.db.users.bulkGet(userIds);
      const userMap = new Map(users.filter(u => u).map(u => [u!.id!, u!.username]));

      // Adicionar username às vendas
      return sales.map(sale => ({
        ...sale,
        username: userMap.get(sale.userId) || 'Desconhecido'
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar vendas do evento:', error);
      return [];
    }
  }

  // ==================== COMANDAS CRUD ====================

  /**
   * Busca todas as comandas ordenadas por número
   * @returns Promise com array de comandas
   */
  async getAllComandas(): Promise<ComandaWithSync[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    return await this.db.comandas.orderBy('numero').toArray();
  }

  /**
   * Busca comandas por status
   * @param status Status da comanda (disponivel, em_uso, aguardando_pagamento)
   * @returns Promise com array de comandas com o status especificado
   */
  async getComandasByStatus(status: string): Promise<ComandaWithSync[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    return await this.db.comandas
      .where('status')
      .equals(status)
      .sortBy('numero');
  }

  /**
   * Busca comanda por número
   * @param numero Número da comanda
   * @returns Promise com comanda ou null se não encontrada
   */
  async getComandaByNumero(numero: number): Promise<ComandaWithSync | null> {
    if (!this.isBrowser || !this.db) {
      return null;
    }

    const comanda = await this.db.comandas.where('numero').equals(numero).first();
    return comanda || null;
  }

  /**
   * Busca comanda por ID
   * @param id ID da comanda
   * @returns Promise com comanda ou null se não encontrada
   */
  async getComandaById(id: number): Promise<ComandaWithSync | null> {
    if (!this.isBrowser || !this.db) {
      return null;
    }

    const comanda = await this.db.comandas.get(id);
    return comanda || null;
  }

  /**
   * Abre uma comanda (muda status de disponivel para em_uso)
   * @param numero Número da comanda a ser aberta
   * @returns Promise com número de registros atualizados
   */
  async openComanda(numero: number): Promise<number> {
    if (!this.isBrowser || !this.db) {
      return 0;
    }

    const now = new Date().toISOString();

    const comanda = await this.getComandaByNumero(numero);
    if (!comanda || comanda.status !== 'disponivel') {
      return 0;
    }

    return await this.db.comandas.update(comanda.id!, {
      status: 'em_uso',
      openedAt: now,
      updatedAt: now
    });
  }

  /**
   * Fecha uma comanda (muda status para aguardando_pagamento e calcula total)
   * @param comandaId ID da comanda a ser fechada
   * @returns Promise que resolve quando a operação é concluída
   */
  async closeComanda(comandaId: number): Promise<void> {
    if (!this.isBrowser || !this.db) {
      return;
    }

    const now = new Date().toISOString();
    const total = await this.calculateComandaTotal(comandaId);

    await this.db.comandas.update(comandaId, {
      status: 'aguardando_pagamento',
      closedAt: now,
      totalValue: total,
      updatedAt: now
    });
  }

  /**
   * Confirma pagamento de uma comanda (libera comanda para reutilização)
   * @param comandaId ID da comanda
   * @returns Promise que resolve quando a operação é concluída
   */
  async confirmPayment(comandaId: number): Promise<void> {
    if (!this.isBrowser || !this.db) {
      return;
    }

    const now = new Date().toISOString();

    await this.db.transaction('rw', [this.db.comandas, this.db.sales], async () => {
      // Resetar comanda para disponível
      await this.db.comandas.update(comandaId, {
        status: 'disponivel',
        paidAt: now,
        totalValue: 0,
        openedAt: undefined,
        closedAt: undefined,
        updatedAt: now
      });

      // Remover vínculo das vendas desta comanda (vendas ficam no histórico)
      const salesToUpdate = await this.db.sales.where('comandaId').equals(comandaId).toArray();
      for (const sale of salesToUpdate) {
        await this.db.sales.update(sale.id!, { comandaId: undefined });
      }
    });
  }

  /**
   * Calcula o valor total de uma comanda baseado em suas vendas
   * @param comandaId ID da comanda
   * @returns Promise com valor total em reais
   */
  async calculateComandaTotal(comandaId: number): Promise<number> {
    if (!this.isBrowser || !this.db) {
      return 0;
    }

    try {
      // Buscar vendas da comanda
      const sales = await this.db.sales.where('comandaId').equals(comandaId).toArray();

      if (sales.length === 0) {
        return 0;
      }

      // Buscar configurações de preço de todas as cervejas nas vendas
      const beerIds = [...new Set(sales.map(s => s.beerId))];
      const salesConfigs = await this.db.salesConfig
        .where('beerId')
        .anyOf(beerIds)
        .toArray();

      // Criar map de preços por beerId
      const priceMap = new Map<number, SalesConfig>();
      for (const config of salesConfigs) {
        priceMap.set(config.beerId, config);
      }

      // Calcular total
      let total = 0;
      for (const sale of sales) {
        const config = priceMap.get(sale.beerId);
        if (config) {
          switch (sale.cupSize) {
            case 300:
              total += sale.quantity * (config.price300ml || 0);
              break;
            case 500:
              total += sale.quantity * (config.price500ml || 0);
              break;
            case 1000:
              total += sale.quantity * (config.price1000ml || 0);
              break;
          }
        }
      }

      return total;
    } catch (error) {
      console.error('❌ Erro ao calcular total da comanda:', error);
      return 0;
    }
  }

  /**
   * Busca todos os itens (vendas) de uma comanda
   * @param comandaId ID da comanda
   * @returns Promise com array de itens da comanda com preços calculados
   */
  async getComandaItems(comandaId: number): Promise<any[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    try {
      // Buscar vendas da comanda
      const sales = await this.db.sales
        .where('comandaId')
        .equals(comandaId)
        .reverse()
        .sortBy('timestamp');

      if (sales.length === 0) {
        return [];
      }

      // Buscar configurações de preço
      const beerIds = [...new Set(sales.map(s => s.beerId))];
      const salesConfigs = await this.db.salesConfig
        .where('beerId')
        .anyOf(beerIds)
        .toArray();

      // Criar map de preços
      const priceMap = new Map<number, SalesConfig>();
      for (const config of salesConfigs) {
        priceMap.set(config.beerId, config);
      }

      // Montar itens com preços
      return sales.map(sale => {
        const config = priceMap.get(sale.beerId);
        let unitPrice = 0;
        let totalPrice = 0;

        if (config) {
          switch (sale.cupSize) {
            case 300:
              unitPrice = config.price300ml || 0;
              break;
            case 500:
              unitPrice = config.price500ml || 0;
              break;
            case 1000:
              unitPrice = config.price1000ml || 0;
              break;
          }
          totalPrice = sale.quantity * unitPrice;
        }

        return {
          saleId: sale.id,
          beerId: sale.beerId,
          beerName: sale.beerName,
          cupSize: sale.cupSize,
          quantity: sale.quantity,
          timestamp: sale.timestamp,
          unitPrice,
          totalPrice
        };
      });
    } catch (error) {
      console.error('❌ Erro ao buscar itens da comanda:', error);
      return [];
    }
  }

  /**
   * Busca comanda completa com seus itens
   * @param comandaId ID da comanda
   * @returns Promise com comanda com array de itens ou null se não encontrada
   */
  async getComandaWithItems(comandaId: number): Promise<any | null> {
    if (!this.isBrowser || !this.db) {
      return null;
    }

    const comanda = await this.getComandaById(comandaId);
    if (!comanda) return null;

    const items = await this.getComandaItems(comandaId);

    return {
      ...comanda,
      items
    };
  }

  // ==================== STOCK MANAGEMENT (Event Sale) ====================

  /**
   * Busca todo o estoque do evento com informações de cor das cervejas
   * @param eventId ID do evento (null = estoque geral)
   * @returns Promise com array de estoque
   */
  async getEventStock(eventId: number | null = null): Promise<EventSale[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    try {
      let stockItems: EventSale[];

      if (eventId !== null) {
        stockItems = await this.db.eventSale
          .where('eventId')
          .equals(eventId)
          .toArray();
      } else {
        stockItems = await this.db.eventSale
          .filter(item => item.eventId === undefined || item.eventId === null)
          .toArray();
      }

      // Buscar cores das cervejas
      const beerIds = stockItems.map(item => item.beerId);
      const beerTypes = await this.db.beerTypes.bulkGet(beerIds);
      const colorMap = new Map(beerTypes.filter(b => b).map(b => [b!.id!, b!.color]));

      // Adicionar cor aos itens de estoque e ordenar por nome
      return stockItems
        .map(item => ({
          ...item,
          color: colorMap.get(item.beerId) || '#000000'
        }))
        .sort((a, b) => a.beerName.localeCompare(b.beerName));
    } catch (error) {
      console.error('❌ Erro ao buscar estoque do evento:', error);
      return [];
    }
  }

  /**
   * Busca estoque de uma cerveja específica
   * @param beerId ID da cerveja
   * @param eventId ID do evento (null = estoque geral)
   * @returns Promise com objeto do estoque ou null
   */
  async getEventStockByBeerId(beerId: number, eventId: number | null = null): Promise<EventSale | null> {
    if (!this.isBrowser || !this.db) {
      return null;
    }

    try {
      let stock: EventSale | undefined;

      if (eventId !== null) {
        stock = await this.db.eventSale
          .where(['beerId', 'eventId'])
          .equals([beerId, eventId])
          .first();
      } else {
        stock = await this.db.eventSale
          .where('beerId')
          .equals(beerId)
          .filter(item => item.eventId === undefined || item.eventId === null)
          .first();
      }

      return stock || null;
    } catch (error) {
      console.error('❌ Erro ao buscar estoque da cerveja:', error);
      return null;
    }
  }

  /**
   * Define ou atualiza a quantidade de litros disponível para uma cerveja no evento
   * @param data Dados do estoque (beerId, beerName, quantidadeLitros, minLitersAlert, eventId)
   * @returns Promise que resolve quando a operação é concluída
   */
  async setEventStock(data: {
    beerId: number;
    beerName: string;
    quantidadeLitros: number;
    minLitersAlert?: number;
    eventId?: number | null;
  }): Promise<void> {
    if (!this.isBrowser || !this.db) {
      return;
    }

    try {
      const { beerId, beerName, quantidadeLitros, minLitersAlert = 5.0, eventId = null } = data;

      // Verifica se já existe registro para esta cerveja e evento
      const existing = await this.getEventStockByBeerId(beerId, eventId);

      if (existing) {
        // Atualiza registro existente
        await this.db.eventSale.update(existing.id!, {
          quantidadeLitros,
          minLitersAlert,
          updatedAt: new Date().toISOString()
        });
        console.log(`✅ Estoque atualizado: ${beerName} = ${quantidadeLitros}L (alerta: ${minLitersAlert}L) [eventId: ${eventId || 'geral'}]`);
      } else {
        // Insere novo registro
        await this.db.eventSale.add({
          beerId,
          beerName,
          quantidadeLitros,
          minLitersAlert,
          eventId: eventId !== null ? eventId : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log(`✅ Estoque criado: ${beerName} = ${quantidadeLitros}L (alerta: ${minLitersAlert}L) [eventId: ${eventId || 'geral'}]`);
      }
    } catch (error) {
      console.error('❌ Erro ao definir estoque do evento:', error);
      throw error;
    }
  }

  /**
   * Remove registro de estoque de uma cerveja (volta ao modo normal)
   * @param beerId ID da cerveja
   * @param eventId ID do evento (null = estoque geral)
   * @returns Promise que resolve quando a operação é concluída
   */
  async removeEventStock(beerId: number, eventId: number | null = null): Promise<void> {
    if (!this.isBrowser || !this.db) {
      return;
    }

    try {
      if (eventId !== null) {
        await this.db.eventSale
          .where(['beerId', 'eventId'])
          .equals([beerId, eventId])
          .delete();
      } else {
        await this.db.eventSale
          .where('beerId')
          .equals(beerId)
          .filter(item => item.eventId === undefined || item.eventId === null)
          .delete();
      }

      console.log('✅ Estoque removido para beerId:', beerId, 'eventId:', eventId || 'geral');
    } catch (error) {
      console.error('❌ Erro ao remover estoque:', error);
      throw error;
    }
  }

  /**
   * Subtrai quantidade vendida do estoque do evento
   * @param beerId ID da cerveja
   * @param litersToSubtract Quantidade em litros a subtrair
   * @param eventId ID do evento (null = estoque geral)
   * @returns Promise com true se subtraiu com sucesso, false se não havia estoque configurado
   */
  async subtractFromEventStock(beerId: number, litersToSubtract: number, eventId: number | null = null): Promise<boolean> {
    if (!this.isBrowser || !this.db) {
      return false;
    }

    try {
      const stock = await this.getEventStockByBeerId(beerId, eventId);

      // Se não há estoque configurado, retorna false (modo normal)
      if (!stock || stock.quantidadeLitros === 0) {
        console.log(`ℹ️ Sem estoque configurado para beerId ${beerId} (eventId: ${eventId || 'geral'})`);
        return false;
      }

      // Calcula novo estoque (não permite negativo)
      const newQuantity = Math.max(0, stock.quantidadeLitros - litersToSubtract);

      // Atualiza estoque
      await this.db.eventSale.update(stock.id!, {
        quantidadeLitros: newQuantity,
        updatedAt: new Date().toISOString()
      });

      console.log(`✅ Estoque subtraído: ${stock.beerName} -${litersToSubtract}L = ${newQuantity}L [eventId: ${eventId || 'geral'}]`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao subtrair do estoque:', error);
      return false;
    }
  }

  /**
   * Verifica se alguma cerveja está com estoque abaixo do limite configurado
   * @param eventId ID do evento (null = estoque geral)
   * @returns Promise com array de cervejas em alerta
   */
  async getStockAlerts(eventId: number | null = null): Promise<EventSale[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    try {
      const config = await this.getStockAlertConfig();
      const minLiters = config?.minLiters || 5.0;

      let stockItems: EventSale[];

      if (eventId !== null) {
        stockItems = await this.db.eventSale
          .where('eventId')
          .equals(eventId)
          .toArray();
      } else {
        stockItems = await this.db.eventSale
          .filter(item => item.eventId === undefined || item.eventId === null)
          .toArray();
      }

      // Filtrar itens com estoque baixo
      const alerts = stockItems.filter(
        item => item.quantidadeLitros > 0 && item.quantidadeLitros < minLiters
      );

      // Buscar cores das cervejas
      const beerIds = alerts.map(item => item.beerId);
      const beerTypes = await this.db.beerTypes.bulkGet(beerIds);
      const colorMap = new Map(beerTypes.filter(b => b).map(b => [b!.id!, b!.color]));

      // Adicionar cor e ordenar por quantidade (menor primeiro)
      return alerts
        .map(item => ({
          ...item,
          color: colorMap.get(item.beerId) || '#000000'
        }))
        .sort((a, b) => a.quantidadeLitros - b.quantidadeLitros);
    } catch (error) {
      console.error('❌ Erro ao buscar alertas de estoque:', error);
      return [];
    }
  }

  // ==================== PRICE MANAGEMENT (Sales Config) ====================

  /**
   * Busca configuração de preços de uma cerveja específica
   * @param beerId ID da cerveja
   * @param eventId ID do evento (null = preços gerais)
   * @returns Promise com configuração de preços ou null
   */
  async getSalesConfigByBeerId(beerId: number, eventId: number | null = null): Promise<SalesConfig | null> {
    if (!this.isBrowser || !this.db) {
      return null;
    }

    try {
      let config: SalesConfig | undefined;

      if (eventId !== null) {
        config = await this.db.salesConfig
          .where(['beerId', 'eventId'])
          .equals([beerId, eventId])
          .first();
      } else {
        config = await this.db.salesConfig
          .where('beerId')
          .equals(beerId)
          .filter(item => item.eventId === undefined || item.eventId === null)
          .first();
      }

      return config || null;
    } catch (error) {
      console.error('❌ Erro ao buscar configuração de preços:', error);
      return null;
    }
  }

  /**
   * Busca todas as configurações de preços
   * @param eventId ID do evento (null = preços gerais)
   * @returns Promise com array de configurações de preços
   */
  async getAllSalesConfig(eventId: number | null = null): Promise<SalesConfig[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    try {
      let configs: SalesConfig[];

      if (eventId !== null) {
        configs = await this.db.salesConfig
          .where('eventId')
          .equals(eventId)
          .toArray();
      } else {
        configs = await this.db.salesConfig
          .filter(item => item.eventId === undefined || item.eventId === null)
          .toArray();
      }

      return configs.sort((a, b) => a.beerName.localeCompare(b.beerName));
    } catch (error) {
      console.error('❌ Erro ao buscar configurações de preços:', error);
      return [];
    }
  }

  /**
   * Define ou atualiza preços de uma cerveja
   * @param data Dados da configuração de preços
   * @returns Promise que resolve quando a operação é concluída
   */
  async setSalesConfig(data: {
    beerId: number;
    beerName: string;
    price300ml: number;
    price500ml: number;
    price1000ml: number;
    eventId?: number | null;
  }): Promise<void> {
    if (!this.isBrowser || !this.db) {
      return;
    }

    try {
      const { beerId, beerName, price300ml, price500ml, price1000ml, eventId = null } = data;

      // Verifica se já existe configuração para esta cerveja e evento
      const existing = await this.getSalesConfigByBeerId(beerId, eventId);

      if (existing) {
        // Atualiza registro existente
        await this.db.salesConfig.update(existing.id!, {
          beerName,
          price300ml,
          price500ml,
          price1000ml,
          updatedAt: new Date().toISOString()
        });
        console.log(`✅ Preços atualizados: ${beerName} [eventId: ${eventId || 'geral'}]`);
      } else {
        // Insere novo registro
        await this.db.salesConfig.add({
          beerId,
          beerName,
          price300ml,
          price500ml,
          price1000ml,
          eventId: eventId !== null ? eventId : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log(`✅ Preços criados: ${beerName} [eventId: ${eventId || 'geral'}]`);
      }
    } catch (error) {
      console.error('❌ Erro ao definir preços:', error);
      throw error;
    }
  }

  /**
   * Remove configuração de preços de uma cerveja
   * @param beerId ID da cerveja
   * @param eventId ID do evento (null = preços gerais)
   * @returns Promise que resolve quando a operação é concluída
   */
  async removeSalesConfig(beerId: number, eventId: number | null = null): Promise<void> {
    if (!this.isBrowser || !this.db) {
      return;
    }

    try {
      if (eventId !== null) {
        await this.db.salesConfig
          .where(['beerId', 'eventId'])
          .equals([beerId, eventId])
          .delete();
      } else {
        await this.db.salesConfig
          .where('beerId')
          .equals(beerId)
          .filter(item => item.eventId === undefined || item.eventId === null)
          .delete();
      }

      console.log('✅ Preços removidos para beerId:', beerId, 'eventId:', eventId || 'geral');
    } catch (error) {
      console.error('❌ Erro ao remover preços:', error);
      throw error;
    }
  }

  // ==================== SETTINGS & CONFIG ====================

  /**
   * Busca lista de emails configurados
   * @returns Promise com array de emails
   */
  async getConfiguredEmails(): Promise<string[]> {
    if (!this.isBrowser || !this.db) {
      return [];
    }

    try {
      const settings = await this.db.settings.toArray();
      return settings.map(s => s.email);
    } catch (error) {
      console.error('❌ Erro ao buscar emails configurados:', error);
      return [];
    }
  }

  /**
   * Busca a configuração de alerta de estoque
   * @returns Promise com objeto contendo minLiters ou null
   */
  async getStockAlertConfig(): Promise<StockAlertConfig | null> {
    if (!this.isBrowser || !this.db) {
      return null;
    }

    try {
      const config = await this.db.stockAlertConfig.get(1);
      return config || null;
    } catch (error) {
      console.error('❌ Erro ao buscar configuração de alerta:', error);
      return null;
    }
  }

  /**
   * Define o limite mínimo de litros para alerta de estoque
   * @param minLiters Limite mínimo em litros
   * @returns Promise que resolve quando a operação é concluída
   */
  async setStockAlertConfig(minLiters: number): Promise<void> {
    if (!this.isBrowser || !this.db) {
      return;
    }

    try {
      const now = new Date().toISOString();
      const existing = await this.db.stockAlertConfig.get(1);

      if (existing) {
        await this.db.stockAlertConfig.update(1, {
          minLiters,
          updatedAt: now
        });
      } else {
        await this.db.stockAlertConfig.add({
          id: 1,
          minLiters,
          updatedAt: now
        });
      }

      console.log('✅ Configuração de alerta atualizada:', minLiters, 'litros');
    } catch (error) {
      console.error('❌ Erro ao definir configuração de alerta:', error);
      throw error;
    }
  }

  // ==================== REPORTS ====================

  /**
   * Busca relatório completo com todas as estatísticas
   * @param startDate Data inicial (opcional)
   * @param endDate Data final (opcional)
   * @param eventId ID do evento (opcional)
   * @returns Promise com relatório completo
   */
  async getFullReport(startDate?: string, endDate?: string, eventId?: number): Promise<any> {
    if (!this.isBrowser || !this.db) {
      return {
        totalSales: 0,
        totalVolume: 0,
        totalRevenue: 0,
        salesByBeer: [],
        salesByCupSize: [],
        period: { startDate, endDate }
      };
    }

    try {
      // Buscar vendas com filtros
      let salesQuery = this.db.sales.toCollection();

      if (eventId !== undefined) {
        salesQuery = this.db.sales.where('eventId').equals(eventId);
      }

      let sales = await salesQuery.toArray();

      // Aplicar filtros de data
      if (startDate) {
        sales = sales.filter(s => s.timestamp >= startDate);
      }
      if (endDate) {
        sales = sales.filter(s => s.timestamp <= endDate);
      }

      // Buscar configurações de preço
      const beerIds = [...new Set(sales.map(s => s.beerId))];
      const salesConfigs = await this.db.salesConfig.bulkGet(beerIds);
      const priceMap = new Map<number, SalesConfig>();
      salesConfigs.filter(c => c).forEach(c => priceMap.set(c!.beerId, c!));

      // Calcular estatísticas
      let totalRevenue = 0;
      const salesByBeerMap = new Map<string, any>();
      const salesByCupSizeMap = new Map<number, any>();

      for (const sale of sales) {
        const config = priceMap.get(sale.beerId);
        let saleRevenue = 0;

        if (config) {
          switch (sale.cupSize) {
            case 300:
              saleRevenue = sale.quantity * (config.price300ml || 0);
              break;
            case 500:
              saleRevenue = sale.quantity * (config.price500ml || 0);
              break;
            case 1000:
              saleRevenue = sale.quantity * (config.price1000ml || 0);
              break;
          }
        }

        totalRevenue += saleRevenue;

        // Agrupar por cerveja
        if (!salesByBeerMap.has(sale.beerName)) {
          salesByBeerMap.set(sale.beerName, {
            beerName: sale.beerName,
            salesCount: 0,
            totalQuantity: 0,
            totalVolume: 0,
            revenue: 0
          });
        }

        const beerStats = salesByBeerMap.get(sale.beerName);
        beerStats.salesCount++;
        beerStats.totalQuantity += sale.quantity;
        beerStats.totalVolume += sale.totalVolume;
        beerStats.revenue += saleRevenue;

        // Agrupar por tamanho de copo
        if (!salesByCupSizeMap.has(sale.cupSize)) {
          salesByCupSizeMap.set(sale.cupSize, {
            cupSize: sale.cupSize,
            salesCount: 0,
            totalQuantity: 0,
            totalVolume: 0,
            revenue: 0
          });
        }

        const cupStats = salesByCupSizeMap.get(sale.cupSize);
        cupStats.salesCount++;
        cupStats.totalQuantity += sale.quantity;
        cupStats.totalVolume += sale.totalVolume;
        cupStats.revenue += saleRevenue;
      }

      return {
        totalSales: sales.length,
        totalVolume: sales.reduce((sum, s) => sum + s.totalVolume, 0),
        totalRevenue,
        salesByBeer: Array.from(salesByBeerMap.values()).sort((a, b) => b.revenue - a.revenue),
        salesByCupSize: Array.from(salesByCupSizeMap.values()).sort((a, b) => a.cupSize - b.cupSize),
        period: { startDate, endDate }
      };
    } catch (error) {
      console.error('❌ Erro ao gerar relatório completo:', error);
      return {
        totalSales: 0,
        totalVolume: 0,
        totalRevenue: 0,
        salesByBeer: [],
        salesByCupSize: [],
        period: { startDate, endDate }
      };
    }
  }

  /**
   * Calcula receita total no período
   * @param startDate Data inicial (opcional)
   * @param endDate Data final (opcional)
   * @param eventId ID do evento (opcional)
   * @returns Promise com receita total
   */
  async getTotalRevenue(startDate?: string, endDate?: string, eventId?: number): Promise<number> {
    if (!this.isBrowser || !this.db) {
      return 0;
    }

    try {
      const report = await this.getFullReport(startDate, endDate, eventId);
      return report.totalRevenue;
    } catch (error) {
      console.error('❌ Erro ao calcular receita total:', error);
      return 0;
    }
  }

  /**
   * Busca vendas detalhadas de um evento
   * @param eventId ID do evento
   * @param startDate Data inicial (opcional)
   * @param endDate Data final (opcional)
   * @returns Promise com relatório detalhado
   */
  async getSalesDetailedByEvent(eventId: number, startDate?: string, endDate?: string): Promise<any> {
    if (!this.isBrowser || !this.db) {
      return {
        event: null,
        sales: [],
        statistics: {
          totalSales: 0,
          totalVolume: 0,
          totalRevenue: 0
        }
      };
    }

    try {
      const event = await this.getEventById(eventId);
      const statistics = await this.getEventStatistics(eventId);

      let sales = await this.db.sales
        .where('eventId')
        .equals(eventId)
        .reverse()
        .sortBy('timestamp');

      // Aplicar filtros de data
      if (startDate) {
        sales = sales.filter(s => s.timestamp >= startDate);
      }
      if (endDate) {
        sales = sales.filter(s => s.timestamp <= endDate);
      }

      // Buscar usernames
      const userIds = [...new Set(sales.map(s => s.userId))];
      const users = await this.db.users.bulkGet(userIds);
      const userMap = new Map(users.filter(u => u).map(u => [u!.id!, u!.username]));

      // Adicionar username às vendas
      const salesWithUsers = sales.map(sale => ({
        ...sale,
        username: userMap.get(sale.userId) || 'Desconhecido'
      }));

      return {
        event,
        sales: salesWithUsers,
        statistics
      };
    } catch (error) {
      console.error('❌ Erro ao buscar vendas detalhadas do evento:', error);
      return {
        event: null,
        sales: [],
        statistics: {
          totalSales: 0,
          totalVolume: 0,
          totalRevenue: 0
        }
      };
    }
  }

  /**
   * Busca vendas detalhadas sem vínculo com evento
   * @param startDate Data inicial (opcional)
   * @param endDate Data final (opcional)
   * @returns Promise com relatório detalhado
   */
  async getSalesDetailedWithoutEvent(startDate?: string, endDate?: string): Promise<any> {
    if (!this.isBrowser || !this.db) {
      return {
        sales: [],
        statistics: {
          totalSales: 0,
          totalVolume: 0,
          totalRevenue: 0
        }
      };
    }

    try {
      let sales = await this.db.sales
        .filter(sale => sale.eventId === undefined || sale.eventId === null)
        .toArray();

      // Aplicar filtros de data
      if (startDate) {
        sales = sales.filter(s => s.timestamp >= startDate);
      }
      if (endDate) {
        sales = sales.filter(s => s.timestamp <= endDate);
      }

      // Ordenar por timestamp (mais recentes primeiro)
      sales.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      // Buscar usernames
      const userIds = [...new Set(sales.map(s => s.userId))];
      const users = await this.db.users.bulkGet(userIds);
      const userMap = new Map(users.filter(u => u).map(u => [u!.id!, u!.username]));

      // Calcular estatísticas
      const totalSales = sales.length;
      const totalVolume = sales.reduce((sum, s) => sum + s.totalVolume, 0);

      // Buscar preços para calcular receita
      const beerIds = [...new Set(sales.map(s => s.beerId))];
      const salesConfigs = await this.db.salesConfig.bulkGet(beerIds);
      const priceMap = new Map<number, SalesConfig>();
      salesConfigs.filter(c => c).forEach(c => priceMap.set(c!.beerId, c!));

      let totalRevenue = 0;
      const salesWithUsers = sales.map(sale => {
        const config = priceMap.get(sale.beerId);
        let saleRevenue = 0;

        if (config) {
          switch (sale.cupSize) {
            case 300:
              saleRevenue = sale.quantity * (config.price300ml || 0);
              break;
            case 500:
              saleRevenue = sale.quantity * (config.price500ml || 0);
              break;
            case 1000:
              saleRevenue = sale.quantity * (config.price1000ml || 0);
              break;
          }
        }

        totalRevenue += saleRevenue;

        return {
          ...sale,
          username: userMap.get(sale.userId) || 'Desconhecido',
          revenue: saleRevenue
        };
      });

      return {
        sales: salesWithUsers,
        statistics: {
          totalSales,
          totalVolume,
          totalRevenue
        }
      };
    } catch (error) {
      console.error('❌ Erro ao buscar vendas sem evento:', error);
      return {
        sales: [],
        statistics: {
          totalSales: 0,
          totalVolume: 0,
          totalRevenue: 0
        }
      };
    }
  }

  /**
   * Busca totais de um evento (resumo)
   * @param eventId ID do evento
   * @returns Promise com totais do evento
   */
  async getEventTotals(eventId: number): Promise<any> {
    if (!this.isBrowser || !this.db) {
      return {
        totalSales: 0,
        totalVolume: 0,
        totalRevenue: 0
      };
    }

    try {
      const statistics = await this.getEventStatistics(eventId);
      return {
        totalSales: statistics.totalSales,
        totalVolume: statistics.totalVolume,
        totalRevenue: statistics.totalRevenue
      };
    } catch (error) {
      console.error('❌ Erro ao buscar totais do evento:', error);
      return {
        totalSales: 0,
        totalVolume: 0,
        totalRevenue: 0
      };
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Retorna o último ID inserido
   * Nota: Em Dexie/IndexedDB, IDs são retornados diretamente pelos métodos add()
   * Este método é mantido para compatibilidade com a API antiga
   * @returns Último ID (sempre retorna 0, use o retorno de add() diretamente)
   */
  getLastInsertId(): number {
    console.warn('⚠️ getLastInsertId() é legacy - use o retorno de add() diretamente');
    return 0;
  }

  /**
   * Verifica se uma tabela existe
   * @param tableName Nome da tabela
   * @returns Promise com true se a tabela existe
   */
  async tableExists(tableName: string): Promise<boolean> {
    if (!this.isBrowser || !this.db) {
      return false;
    }

    const tableNames = this.db.tables.map(t => t.name);
    return tableNames.includes(tableName);
  }

  /**
   * Verifica se uma coluna existe em uma tabela
   * Nota: IndexedDB não tem conceito de colunas - este método verifica índices
   * @param tableName Nome da tabela
   * @param columnName Nome da coluna/índice
   * @returns Promise com true se o índice existe
   */
  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    if (!this.isBrowser || !this.db) {
      return false;
    }

    try {
      const table = this.db.table(tableName);
      if (!table) return false;

      const schema = table.schema;
      return schema.indexes.some(idx => idx.name === columnName) || schema.primKey.name === columnName;
    } catch (error) {
      return false;
    }
  }
}
