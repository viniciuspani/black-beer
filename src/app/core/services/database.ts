// src/app/core/services/database.ts
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import initSqlJs, { type Database } from 'sql.js';
import { BeerType, Sale } from '../models/beer.model';
import { FullReport, SalesSummary, SalesByCupSize, SalesByBeerType } from '../models/report.model';
import { isPlatformBrowser } from '@angular/common';

const DB_STORAGE_KEY = 'black_beer_sqlite_db_v10'; // v10 padronização de colunas
const DB_VERSION = 10; // Versionamento do schema

/**
 * Constantes para validação de emails
 */
export const EMAIL_CONFIG = {
  MIN_EMAILS: 1,
  MAX_EMAILS: 10,
  SEPARATOR: ';'
} as const;

declare global {
  interface Window {
    initSqlJs: any;
  }
}

/**
 * Serviço responsável por gerenciar o banco de dados SQLite da aplicação
 *
 * VERSÃO ATUAL: 10 (padronização de colunas)
 *
 * CONVENÇÃO DE NOMENCLATURA:
 * - num_ → Colunas INTEGER e REAL (ex: num_id, num_quantity, num_price_300ml)
 * - desc_ → Colunas TEXT para dados gerais (ex: desc_name, desc_email)
 * - dt_ → Colunas TEXT com TIMESTAMP (ex: dt_created_at, dt_timestamp)
 *
 * CARACTERÍSTICAS:
 * - IDs INTEGER com auto-increment em todas as tabelas
 * - Gestão completa de usuários (autenticação e autorização)
 * - Sistema de eventos de venda com estoque e preços isolados
 * - Gestão de comandas/tabs para clientes
 * - Configuração de preços por cerveja e tamanho de copo
 * - Controle de estoque com alertas personalizados
 * - White-label (logo e nome da empresa)
 * - Relatórios detalhados com filtros por data e evento
 *
 * @version 10.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  private db: Database | null = null;
  public isDbReady = signal<boolean>(false);
  private platformId = inject(PLATFORM_ID);
  private SQL: any = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeDatabase();
    }
  }

  /**
   * Inicializa o banco de dados SQLite
   * Carrega banco existente ou cria novo se não existir
   */
  private async initializeDatabase(): Promise<void> {
    try {
      const initSqlJs = (await import('sql.js')).default;
      this.SQL = await initSqlJs({
        locateFile: (file: string) => `assets/${file}`
      });

      // Tentar carregar banco existente V10
      const savedDb = localStorage.getItem(DB_STORAGE_KEY);

      if (!savedDb) {
        // Não há DB, criar novo
        console.log('🔄 Criando novo banco de dados (versão 10)...');
        this.createNewDatabase();
      } else {
        // Carrega banco existente
        const dbArray = this.stringToUint8Array(savedDb);
        this.db = new this.SQL.Database(dbArray);

        const currentVersion = this.getCurrentDbVersion();
        console.log(`📦 Banco de dados carregado. Versão: ${currentVersion}`);

        // Validação do schema
        await this.validateAndFixSchema();
      }

      this.isDbReady.set(true);
    } catch (err) {
      console.error("❌ Erro na inicialização do banco:", err);
    }
  }

  /**
   * Cria um novo banco de dados do zero com schema v10
   */
  private createNewDatabase(): void {
    this.db = new this.SQL.Database();
    this.createSchemaV10();
    this.seedInitialData();
    this.setStoredVersion(DB_VERSION);
    this.persist();
  }

  /**
   * Cria o schema do banco de dados versão 10 (padronização de colunas)
   *
   * CONVENÇÃO DE NOMENCLATURA:
   * - num_ → Colunas INTEGER e REAL
   * - desc_ → Colunas TEXT (dados gerais)
   * - dt_ → Colunas TEXT com TIMESTAMP
   *
   * ESTRUTURA COMPLETA DO BANCO DE DADOS:
   *
   * TABELAS PRINCIPAIS:
   * - prd_beer_types: Tipos de cerveja disponíveis
   * - prd_sales: Registro de vendas
   * - prd_users: Usuários do sistema
   * - prd_events: Eventos de venda
   * - prd_comandas: Gestão de comandas/tabs
   *
   * TABELAS DE CONFIGURAÇÃO:
   * - config_settings: Configurações gerais (emails)
   * - config_client: White-label (logo e nome)
   * - config_sales: Preços por cerveja
   * - config_event_sale: Estoque por cerveja
   * - config_stock_alert: Alertas de estoque
   *
   * RELACIONAMENTOS:
   * - prd_sales.num_beer_id → prd_beer_types.num_id (CASCADE)
   * - prd_sales.num_user_id → prd_users.num_id
   * - prd_sales.num_comanda_id → prd_comandas.num_id (SET NULL)
   * - prd_sales.num_event_id → prd_events.num_id (SET NULL)
   */
  private createSchemaV10(): void {
    if (!this.db) return;

    const schema = `
      -- Tabela de tipos de cerveja
      CREATE TABLE IF NOT EXISTS prd_beer_types (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        desc_name TEXT NOT NULL UNIQUE,
        desc_color TEXT NOT NULL DEFAULT '#D4A574',
        desc_description TEXT
      );

      -- Tabela de vendas
      CREATE TABLE IF NOT EXISTS prd_sales (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_beer_id INTEGER NOT NULL,
        desc_beer_name TEXT NOT NULL,
        num_cup_size INTEGER NOT NULL CHECK(num_cup_size IN (300, 500, 1000)),
        num_quantity INTEGER NOT NULL CHECK(num_quantity > 0),
        dt_timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        num_total_volume REAL NOT NULL CHECK(num_total_volume > 0),
        num_comanda_id INTEGER,
        num_user_id INTEGER NOT NULL,
        num_event_id INTEGER,
        FOREIGN KEY (num_beer_id) REFERENCES prd_beer_types(num_id) ON DELETE CASCADE,
        FOREIGN KEY (num_comanda_id) REFERENCES prd_comandas(num_id) ON DELETE SET NULL,
        FOREIGN KEY (num_user_id) REFERENCES prd_users(num_id),
        FOREIGN KEY (num_event_id) REFERENCES prd_events(num_id) ON DELETE SET NULL
      );

      -- Índices para prd_sales
      CREATE INDEX IF NOT EXISTS idx_sales_dt_timestamp ON prd_sales(dt_timestamp);
      CREATE INDEX IF NOT EXISTS idx_sales_num_beer_id ON prd_sales(num_beer_id);
      CREATE INDEX IF NOT EXISTS idx_sales_num_comanda_id ON prd_sales(num_comanda_id);
      CREATE INDEX IF NOT EXISTS idx_sales_num_user_id ON prd_sales(num_user_id);
      CREATE INDEX IF NOT EXISTS idx_sales_num_event_id ON prd_sales(num_event_id);

      -- Tabela de configurações
      CREATE TABLE IF NOT EXISTS config_settings (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        desc_email TEXT NOT NULL UNIQUE,
        num_is_configured INTEGER NOT NULL DEFAULT 0 CHECK(num_is_configured IN (0, 1))
      );

      -- Tabela de usuários
      CREATE TABLE IF NOT EXISTS prd_users (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        desc_username TEXT NOT NULL UNIQUE,
        desc_email TEXT NOT NULL UNIQUE,
        desc_password_hash TEXT NOT NULL,
        desc_role TEXT NOT NULL CHECK(desc_role IN ('user', 'admin')) DEFAULT 'user',
        dt_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dt_last_login_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_users_desc_email ON prd_users(desc_email);
      CREATE INDEX IF NOT EXISTS idx_users_desc_username ON prd_users(desc_username);

      -- Tabela de eventos
      CREATE TABLE IF NOT EXISTS prd_events (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        desc_name_event TEXT NOT NULL,
        desc_local_event TEXT NOT NULL,
        dt_data_event TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        desc_contact_event TEXT,
        desc_name_contact_event TEXT,
        desc_status TEXT NOT NULL CHECK(desc_status IN ('planejamento', 'ativo', 'finalizado')) DEFAULT 'planejamento',
        dt_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dt_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_events_desc_status ON prd_events(desc_status);
      CREATE INDEX IF NOT EXISTS idx_events_dt_data_event ON prd_events(dt_data_event);

      -- Tabela de configurações do cliente (white-label)
      CREATE TABLE IF NOT EXISTS config_client (
        num_id INTEGER PRIMARY KEY CHECK(num_id = 1),
        desc_company_name TEXT,
        desc_logo_base64 TEXT,
        desc_logo_mime_type TEXT,
        desc_logo_file_name TEXT,
        dt_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de estoque por evento
      CREATE TABLE IF NOT EXISTS config_event_sale (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_beer_id INTEGER NOT NULL,
        desc_beer_name TEXT NOT NULL,
        num_quantidade_litros REAL NOT NULL DEFAULT 0 CHECK(num_quantidade_litros >= 0),
        num_min_liters_alert REAL DEFAULT 5.0 CHECK(num_min_liters_alert >= 0),
        num_event_id INTEGER,
        dt_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dt_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (num_beer_id) REFERENCES prd_beer_types(num_id) ON DELETE CASCADE,
        FOREIGN KEY (num_event_id) REFERENCES prd_events(num_id) ON DELETE CASCADE,
        UNIQUE(num_beer_id, num_event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_event_sale_num_beer_id ON config_event_sale(num_beer_id);
      CREATE INDEX IF NOT EXISTS idx_event_sale_num_event_id ON config_event_sale(num_event_id);

      -- Tabela de configuração de alertas de estoque
      CREATE TABLE IF NOT EXISTS config_stock_alert (
        num_id INTEGER PRIMARY KEY CHECK(num_id = 1),
        num_min_liters REAL NOT NULL DEFAULT 5.0 CHECK(num_min_liters >= 0),
        dt_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Insere configuração padrão de alerta (5 litros)
      INSERT OR IGNORE INTO config_stock_alert (num_id, num_min_liters) VALUES (1, 5.0);

      -- Tabela de configuração de preços por cerveja
      CREATE TABLE IF NOT EXISTS config_sales (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_beer_id INTEGER NOT NULL,
        desc_beer_name TEXT NOT NULL,
        num_price_300ml REAL NOT NULL DEFAULT 0 CHECK(num_price_300ml >= 0),
        num_price_500ml REAL NOT NULL DEFAULT 0 CHECK(num_price_500ml >= 0),
        num_price_1000ml REAL NOT NULL DEFAULT 0 CHECK(num_price_1000ml >= 0),
        num_event_id INTEGER,
        dt_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dt_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (num_beer_id) REFERENCES prd_beer_types(num_id) ON DELETE CASCADE,
        FOREIGN KEY (num_event_id) REFERENCES prd_events(num_id) ON DELETE CASCADE,
        UNIQUE(num_beer_id, num_event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sales_config_num_beer_id ON config_sales(num_beer_id);
      CREATE INDEX IF NOT EXISTS idx_sales_config_num_event_id ON config_sales(num_event_id);

      -- Tabela de comandas
      CREATE TABLE IF NOT EXISTS prd_comandas (
        num_id INTEGER PRIMARY KEY AUTOINCREMENT,
        num_numero INTEGER NOT NULL UNIQUE,
        desc_status TEXT NOT NULL CHECK(desc_status IN ('disponivel', 'em_uso', 'aguardando_pagamento')) DEFAULT 'disponivel',
        num_total_value REAL DEFAULT 0,
        dt_opened_at TEXT,
        dt_closed_at TEXT,
        dt_paid_at TEXT,
        dt_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dt_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_comandas_desc_status ON prd_comandas(desc_status);
      CREATE INDEX IF NOT EXISTS idx_comandas_num_numero ON prd_comandas(num_numero);

      -- Tabela de versão do schema
      CREATE TABLE IF NOT EXISTS db_version (
        num_version INTEGER PRIMARY KEY
      );

      INSERT INTO db_version (num_version) VALUES (${DB_VERSION});
    `;

    this.db.exec(schema);
    console.log('✅ Schema V10 criado com sucesso');
    // Seed de comandas iniciais
    this.seedInitialComandas(10);
    // Cria admin padrão
    this.createDefaultAdmin();
  }

  /**
   * Insere dados iniciais no banco
   * IDs são gerados automaticamente pelo AUTOINCREMENT
   */
  private seedInitialData(): void {
    if (!this.db) return;

    // Beer types com IDs automáticos (1, 2, 3, 4)
    const defaultBeers = [
      { desc_name: 'Pilsen', desc_color: '#f9e79f', desc_description: 'Clara e refrescante.' },
      { desc_name: 'Larger', desc_color: '#f39c12', desc_description: 'Amarga e aromática.' },
      { desc_name: 'IPA', desc_color: '#f1c40f', desc_description: 'Leve e frutada.' },
      { desc_name: 'Session IPA', desc_color: '#8B4513', desc_description: 'Escura e robusta.' }
    ];

    const insertBeerStmt = this.db.prepare(
      'INSERT INTO prd_beer_types (desc_name, desc_color, desc_description) VALUES (?, ?, ?)'
    );

    defaultBeers.forEach(beer => {
      insertBeerStmt.run([beer.desc_name, beer.desc_color, beer.desc_description]);
    });

    insertBeerStmt.free();
    console.log('✅ Dados iniciais inseridos (4 tipos de cerveja)');
    this.persist();
  }

  /**
   * Cria comandas iniciais (V6)
   * @param count Número de comandas a criar (padrão: 10)
   */
  private seedInitialComandas(count: number = 10): void {
    if (!this.db) return;

    console.log(`🔄 Criando ${count} comandas iniciais...`);

    for (let i = 1; i <= count; i++) {
      this.executeRun(
        `INSERT INTO prd_comandas (num_numero, desc_status) VALUES (?, ?)`,
        [i, 'disponivel']
      );
    }

    console.log(`✅ ${count} comandas criadas com sucesso`);
    this.persist();
  }


  /**
   * Obtém a versão atual do banco de dados
   */
  private getCurrentDbVersion(): number {
    if (!this.db) return 0;

    try {
      const result = this.db.exec('SELECT num_version FROM db_version LIMIT 1');
      if (result.length > 0 && result[0].values.length > 0) {
        return Number(result[0].values[0][0]);
      }
      return 0;
    } catch (error) {
      // Tabela db_version não existe, versão muito antiga
      console.warn('⚠️ Tabela db_version não encontrada, assumindo versão 0');
      return 0;
    }
  }

  /**
   * Executa uma query SELECT e retorna os resultados
   * @param sql Query SQL a ser executada
   * @param params Parâmetros da query (opcional)
   * @returns Array de objetos com os resultados
   */
  public executeQuery(sql: string, params?: (string | number | null)[]): any[] {
    if (!this.db) {
      console.warn('⚠️ Banco de dados não inicializado');
      return [];
    }

    try {
      const stmt = this.db.prepare(sql);
      if (params) {
        stmt.bind(params);
      }

      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();

      return results;
    } catch (error) {
      console.error('❌ Erro ao executar query:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * Executa uma query de modificação (INSERT, UPDATE, DELETE)
   * @param sql Query SQL a ser executada
   * @param params Parâmetros da query (opcional)
   */
  public executeRun(sql: string, params?: (string | number | null)[]): void {
    if (!this.db) {
      console.warn('⚠️ Banco de dados não inicializado');
      return;
    }

    try {
      this.db.run(sql, params);
      this.persist();
    } catch (error) {
      console.error('❌ Erro ao executar comando:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * Persiste o banco de dados no localStorage
   * Converte os dados binários para string base64
   */
  private persist(): void {
    if (!this.db) return;

    try {
      const dbArray = this.db.export();
      const dbString = this.uint8ArrayToString(dbArray);
      localStorage.setItem(DB_STORAGE_KEY, dbString);
    } catch (error) {
      console.error('❌ Erro ao persistir banco de dados:', error);
    }
  }

  /**
   * Obtém a versão do schema armazenada
   */
  private getStoredVersion(): number {
    const versionKey = `${DB_STORAGE_KEY}_version`;
    const version = localStorage.getItem(versionKey);
    return version ? parseInt(version, 10) : 0;
  }

  /**
   * Armazena a versão do schema
   */
  private setStoredVersion(version: number): void {
    const versionKey = `${DB_STORAGE_KEY}_version`;
    localStorage.setItem(versionKey, version.toString());
  }

  /**
   * Converte Uint8Array para string base64
   * Usa chunks para evitar "Maximum call stack size exceeded"
   */
  private uint8ArrayToString = (arr: Uint8Array): string => {
    const CHUNK_SIZE = 8192;
    let result = '';
    for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
      const chunk = arr.subarray(i, i + CHUNK_SIZE);
      result += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(result);
  };

  /**
   * Converte string base64 para Uint8Array
   */
  private stringToUint8Array = (str: string): Uint8Array =>
    new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));

  /**
   * Limpa completamente o banco de dados e reinicia ao estado inicial
   * Remove todos os dados mas mantém o schema v2
   *
   * @returns Promise<void>
   */
  public async clearDatabase(): Promise<void> {
    try {
      if (!this.db || !this.SQL) {
        throw new Error('Banco de dados não está inicializado');
      }

      // Fecha o banco atual
      this.db.close();

      // Remove do localStorage
      localStorage.removeItem(DB_STORAGE_KEY);
      localStorage.removeItem(`${DB_STORAGE_KEY}_version`);

      // Cria novo banco limpo
      this.createNewDatabase();

      console.log('✅ Banco de dados limpo e reiniciado (versão 2)');
    } catch (error) {
      console.error('❌ Erro ao limpar banco de dados:', error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas do banco de dados
   * @returns Objeto com contadores de registros
   */
  public getDatabaseStats(): {
    totalSales: number;
    totalBeerTypes: number;
    hasSettings: boolean;
    dbVersion: number;
  } {
    if (!this.db) {
      return {
        totalSales: 0,
        totalBeerTypes: 0,
        hasSettings: false,
        dbVersion: 0
      };
    }

    try {
      const salesCount = this.executeQuery('SELECT COUNT(*) as count FROM prd_sales')[0]?.count || 0;
      const beerTypesCount = this.executeQuery('SELECT COUNT(*) as count FROM prd_beer_types')[0]?.count || 0;
      const settingsCount = this.executeQuery('SELECT COUNT(*) as count FROM config_settings')[0]?.count || 0;
      const version = this.executeQuery('SELECT num_version FROM db_version LIMIT 1')[0]?.num_version || 0;

      return {
        totalSales: Number(salesCount),
        totalBeerTypes: Number(beerTypesCount),
        hasSettings: Number(settingsCount) > 0,
        dbVersion: Number(version)
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return {
        totalSales: 0,
        totalBeerTypes: 0,
        hasSettings: false,
        dbVersion: 0
      };
    }
  }

  /**
   * Gera relatório completo com filtros opcionais de data
   * ATUALIZADO para trabalhar com IDs INTEGER
   *
   * @param startDate Data inicial do filtro (opcional)
   * @param endDate Data final do filtro (opcional)
   * @returns Relatório completo com resumo e dados agregados
   */
  public getFullReport(startDate?: Date, endDate?: Date, eventId?: number): FullReport {
    if (!this.db) {
      return {
        summary: { num_total_sales: 0, num_total_volume_liters: 0 },
        salesByCupSize: [],
        salesByBeerType: []
      };
    }

    // Construir WHERE clauses separadas para queries com e sem JOIN
    let whereClauseSales = ''; // Para queries simples (prd_sales apenas)
    let whereClauseJoin = '';  // Para queries com JOIN (prd_sales + prd_beer_types + config_sales)
    const params: any[] = [];
    const paramsJoin: any[] = [];

    // Filtro de data inicial
    if (startDate) {
      whereClauseSales += ' WHERE dt_timestamp >= ?';
      whereClauseJoin += ' WHERE s.dt_timestamp >= ?';
      params.push(startDate.toISOString());
      paramsJoin.push(startDate.toISOString());
    }

    // Filtro de data final
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setDate(endOfDay.getDate() + 1);
      endOfDay.setSeconds(endOfDay.getSeconds() - 1);

      whereClauseSales += whereClauseSales ? ' AND dt_timestamp <= ?' : ' WHERE dt_timestamp <= ?';
      whereClauseJoin += whereClauseJoin ? ' AND s.dt_timestamp <= ?' : ' WHERE s.dt_timestamp <= ?';
      params.push(endOfDay.toISOString());
      paramsJoin.push(endOfDay.toISOString());
    }

    // Filtro de evento (CRÍTICO: usar alias correto para evitar ambiguidade)
    if (eventId !== undefined) {
      whereClauseSales += whereClauseSales ? ' AND num_event_id = ?' : ' WHERE num_event_id = ?';
      whereClauseJoin += whereClauseJoin ? ' AND s.num_event_id = ?' : ' WHERE s.num_event_id = ?';
      params.push(eventId);
      paramsJoin.push(eventId);
    }

    // Query de resumo (tabela prd_sales apenas)
    const summaryQuery = `
      SELECT
        COUNT(num_id) as num_total_sales,
        COALESCE(SUM(num_total_volume) / 1000.0, 0) as num_total_volume_liters
      FROM prd_sales
      ${whereClauseSales}
    `;
    const summaryResult = this.executeQuery(summaryQuery, params)[0] || {
      num_total_sales: 0,
      num_total_volume_liters: 0
    };

    // Query por tamanho de copo (tabela prd_sales apenas)
    const byCupSizeQuery = `
      SELECT
        num_cup_size,
        SUM(num_quantity) as num_count
      FROM prd_sales
      ${whereClauseSales}
      GROUP BY num_cup_size
      ORDER BY num_cup_size
    `;
    const salesByCupSize = this.executeQuery(byCupSizeQuery, params);

    // Query por tipo de cerveja (JOIN com prd_beer_types e config_sales)
    // IMPORTANTE: Usar whereClauseJoin que qualifica colunas com alias 's.'
    const byBeerTypeQuery = `
      SELECT
        bt.num_id as num_beer_id,
        bt.desc_name,
        bt.desc_color,
        bt.desc_description,
        SUM(s.num_quantity) as num_total_cups,
        COALESCE(SUM(s.num_total_volume) / 1000.0, 0) as num_total_liters,
        COALESCE(SUM(
          CASE
            WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
            WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
            WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
            ELSE 0
          END
        ), 0) as num_total_revenue
      FROM prd_sales s
      INNER JOIN prd_beer_types bt ON s.num_beer_id = bt.num_id
      LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id
      ${whereClauseJoin}
      GROUP BY bt.num_id, bt.desc_name, bt.desc_color, bt.desc_description
      ORDER BY num_total_liters DESC
    `;

    const salesByBeerType = this.executeQuery(byBeerTypeQuery, paramsJoin);

    return {
      summary: {
        num_total_sales: Number(summaryResult.num_total_sales) || 0,
        num_total_volume_liters: Number(summaryResult.num_total_volume_liters) || 0,
      },
      salesByCupSize: salesByCupSize.map(item => ({
        num_cup_size: Number(item.num_cup_size),
        num_count: Number(item.num_count)
      })),
      salesByBeerType: salesByBeerType.map(item => ({
        num_beer_id: Number(item.num_beer_id),
        desc_name: item.desc_name,
        desc_color: item.desc_color,
        desc_description: item.desc_description,
        num_total_cups: Number(item.num_total_cups),
        num_total_liters: Number(item.num_total_liters),
        num_total_revenue: Number(item.num_total_revenue) || 0
      }))
    };
  }

  /**
   * Retorna vendas detalhadas agrupadas por evento, data e usuário
   * Usado para geração de relatório CSV detalhado
   *
   * @param startDate Data inicial do filtro (opcional)
   * @param endDate Data final do filtro (opcional)
   * @returns Array de vendas diárias com informações de evento e usuário
   */
  public getSalesDetailedByEvent(startDate?: Date, endDate?: Date): any[] {
    if (!this.db) return [];

    let whereClause = 'WHERE s.num_event_id IS NOT NULL';
    const params: any[] = [];

    // Filtro de data inicial
    if (startDate) {
      whereClause += ' AND s.dt_timestamp >= ?';
      params.push(startDate.toISOString());
    }

    // Filtro de data final
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setDate(endOfDay.getDate() + 1);
      endOfDay.setSeconds(endOfDay.getSeconds() - 1);
      whereClause += ' AND s.dt_timestamp <= ?';
      params.push(endOfDay.toISOString());
    }

    const query = `
      SELECT
        e.num_id as eventId,
        e.desc_name_event as nameEvent,
        e.desc_local_event as localEvent,
        e.dt_data_event as dataEvent,
        DATE(s.dt_timestamp) as saleDate,
        COALESCE(u.desc_username, 'Usuário Desconhecido') as username,
        COUNT(s.num_id) as salesCount,
        SUM(s.num_quantity) as totalQuantity,
        COALESCE(SUM(s.num_total_volume) / 1000.0, 0) as totalLiters,
        COALESCE(SUM(
          CASE
            WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
            WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
            WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
            ELSE 0
          END
        ), 0) as totalRevenue
      FROM prd_sales s
      INNER JOIN prd_events e ON s.num_event_id = e.num_id
      LEFT JOIN prd_users u ON s.num_user_id = u.num_id
      LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id AND (sc.num_event_id = s.num_event_id OR sc.num_event_id IS NULL)
      ${whereClause}
      GROUP BY e.num_id, e.desc_name_event, e.desc_local_event, e.dt_data_event, DATE(s.dt_timestamp), username
      ORDER BY e.dt_data_event DESC, saleDate DESC, username
    `;

    return this.executeQuery(query, params).map(row => ({
      eventId: Number(row.eventId),
      nameEvent: row.nameEvent,
      localEvent: row.localEvent,
      dataEvent: row.dataEvent,
      saleDate: row.saleDate,
      username: row.username,
      salesCount: Number(row.salesCount),
      totalQuantity: Number(row.totalQuantity),
      totalLiters: Number(row.totalLiters),
      totalRevenue: Number(row.totalRevenue)
    }));
  }

  /**
   * Retorna vendas detalhadas SEM evento vinculado, agrupadas por data e usuário
   * Usado para geração de relatório CSV detalhado
   *
   * @param startDate Data inicial do filtro (opcional)
   * @param endDate Data final do filtro (opcional)
   * @returns Array de vendas diárias sem evento
   */
  public getSalesDetailedWithoutEvent(startDate?: Date, endDate?: Date): any[] {
    if (!this.db) return [];

    let whereClause = 'WHERE s.num_event_id IS NULL';
    const params: any[] = [];

    // Filtro de data inicial
    if (startDate) {
      whereClause += ' AND s.dt_timestamp >= ?';
      params.push(startDate.toISOString());
    }

    // Filtro de data final
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setDate(endOfDay.getDate() + 1);
      endOfDay.setSeconds(endOfDay.getSeconds() - 1);
      whereClause += ' AND s.dt_timestamp <= ?';
      params.push(endOfDay.toISOString());
    }

    const query = `
      SELECT
        DATE(s.dt_timestamp) as saleDate,
        COALESCE(u.desc_username, 'Usuário Desconhecido') as username,
        COUNT(s.num_id) as salesCount,
        SUM(s.num_quantity) as totalQuantity,
        COALESCE(SUM(s.num_total_volume) / 1000.0, 0) as totalLiters,
        COALESCE(SUM(
          CASE
            WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
            WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
            WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
            ELSE 0
          END
        ), 0) as totalRevenue
      FROM prd_sales s
      LEFT JOIN prd_users u ON s.num_user_id = u.num_id
      LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id AND sc.num_event_id IS NULL
      ${whereClause}
      GROUP BY DATE(s.dt_timestamp), username
      ORDER BY saleDate DESC, username
    `;

    return this.executeQuery(query, params).map(row => ({
      saleDate: row.saleDate,
      username: row.username,
      salesCount: Number(row.salesCount),
      totalQuantity: Number(row.totalQuantity),
      totalLiters: Number(row.totalLiters),
      totalRevenue: Number(row.totalRevenue)
    }));
  }

  /**
   * Retorna totais por evento
   * Usado para exibir totalizadores no relatório CSV
   *
   * @param startDate Data inicial do filtro (opcional)
   * @param endDate Data final do filtro (opcional)
   * @returns Array de totais por evento
   */
  public getEventTotals(startDate?: Date, endDate?: Date): any[] {
    if (!this.db) return [];

    let whereClause = 'WHERE s.num_event_id IS NOT NULL';
    const params: any[] = [];

    // Filtro de data inicial
    if (startDate) {
      whereClause += ' AND s.dt_timestamp >= ?';
      params.push(startDate.toISOString());
    }

    // Filtro de data final
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setDate(endOfDay.getDate() + 1);
      endOfDay.setSeconds(endOfDay.getSeconds() - 1);
      whereClause += ' AND s.dt_timestamp <= ?';
      params.push(endOfDay.toISOString());
    }

    const query = `
      SELECT
        e.num_id as eventId,
        e.desc_name_event as nameEvent,
        COUNT(s.num_id) as salesCount,
        SUM(s.num_quantity) as totalQuantity,
        COALESCE(SUM(s.num_total_volume) / 1000.0, 0) as totalLiters,
        COALESCE(SUM(
          CASE
            WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
            WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
            WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
            ELSE 0
          END
        ), 0) as totalRevenue
      FROM prd_sales s
      INNER JOIN prd_events e ON s.num_event_id = e.num_id
      LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id AND (sc.num_event_id = s.num_event_id OR sc.num_event_id IS NULL)
      ${whereClause}
      GROUP BY e.num_id, e.desc_name_event
      ORDER BY e.dt_data_event DESC
    `;

    return this.executeQuery(query, params).map(row => ({
      eventId: Number(row.eventId),
      nameEvent: row.nameEvent,
      salesCount: Number(row.salesCount),
      totalQuantity: Number(row.totalQuantity),
      totalLiters: Number(row.totalLiters),
      totalRevenue: Number(row.totalRevenue)
    }));
  }

  /**
   * Obtém o último ID inserido (útil após INSERT)
   * @returns ID do último registro inserido
   */
  public getLastInsertId(): number {
    if (!this.db) return 0;

    try {
      const result = this.executeQuery('SELECT last_insert_rowid() as id');
      return result[0]?.id || 0;
    } catch (error) {
      console.error('❌ Erro ao obter último ID:', error);
      return 0;
    }
  }

  /**
   * Verifica se uma tabela existe no banco
   * @param tableName Nome da tabela
   * @returns true se a tabela existe
   */
  public tableExists(tableName: string): boolean {
    if (!this.db) return false;

    try {
      const result = this.executeQuery(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName]
      );
      return result.length > 0;
    } catch (error) {
      console.error('❌ Erro ao verificar tabela:', error);
      return false;
    }
  }

  /**
   * Verifica se uma coluna existe em uma tabela
   * @param tableName Nome da tabela
   * @param columnName Nome da coluna
   * @returns true se a coluna existe
   */
  public columnExists(tableName: string, columnName: string): boolean {
    if (!this.db) return false;

    try {
      const result = this.executeQuery(`PRAGMA table_info(${tableName})`);
      return result.some((col: any) => col.name === columnName);
    } catch (error) {
      console.error(`❌ Erro ao verificar coluna ${columnName} na tabela ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Valida o schema do banco de dados
   * Método público para ser chamado em caso de erros
   */
  public async validateAndFixSchema(): Promise<boolean> {
    if (!this.db) {
      console.error('❌ Banco de dados não inicializado');
      return false;
    }

    try {
      console.log('🔍 Validando schema do banco de dados...');

      const currentVersion = this.getCurrentDbVersion();
      console.log(`📦 Versão do banco: ${currentVersion}`);

      // Verifica se tabelas principais existem
      const eventsTableExists = this.tableExists('prd_events');
      const comandasTableExists = this.tableExists('prd_comandas');
      const usersTableExists = this.tableExists('prd_users');

      console.log(`📋 Tabela 'prd_events': ${eventsTableExists}`);
      console.log(`📋 Tabela 'prd_comandas': ${comandasTableExists}`);
      console.log(`📋 Tabela 'prd_users': ${usersTableExists}`);

      // Verifica colunas críticas
      const salesHasEventId = this.columnExists('prd_sales', 'num_event_id');
      const salesHasUserId = this.columnExists('prd_sales', 'num_user_id');
      const salesHasComandaId = this.columnExists('prd_sales', 'num_comanda_id');

      console.log(`📋 Coluna 'prd_sales.num_event_id': ${salesHasEventId}`);
      console.log(`📋 Coluna 'prd_sales.num_user_id': ${salesHasUserId}`);
      console.log(`📋 Coluna 'prd_sales.num_comanda_id': ${salesHasComandaId}`);

      // Se schema estiver incompleto, avisar que precisa recriar
      if (!eventsTableExists || !salesHasEventId || !salesHasUserId) {
        console.warn('⚠️ Schema desatualizado! Recomenda-se resetar o banco de dados.');
        console.warn('   Execute: this.resetDatabase() no console do navegador');
        return false;
      }

      console.log('✅ Schema está correto!');
      return true;
    } catch (error) {
      console.error('❌ Erro ao validar schema:', error);
      return false;
    }
  }

  /**
   * Reseta o banco de dados (CUIDADO: apaga todos os dados!)
   * Método público para casos de emergência
   */
  public resetDatabase(): void {
    console.warn('⚠️ ATENÇÃO: Resetando banco de dados - todos os dados serão perdidos!');

    if (isPlatformBrowser(this.platformId)) {
      // Remove do localStorage
      localStorage.removeItem(DB_STORAGE_KEY);
      localStorage.removeItem(`${DB_STORAGE_KEY}_version`);

      // Recria o banco
      this.createNewDatabase();

      console.log('✅ Banco de dados resetado com sucesso');
      console.log('🔄 Recarregue a página para aplicar as mudanças');
    }
  }

  private createDefaultAdmin(): void {
    try {
      // Verifica se já existe admin
      const existing = this.executeQuery(
        "SELECT num_id FROM prd_users WHERE desc_email = 'admin@blackbeer.com' LIMIT 1"
      );
      if (existing.length > 0) {
        console.log('ℹ️ Admin padrão já existe');
        return;
      }
      // Hash simplificado da senha 'admin123'
      const salt = 'blackbeer_salt_2025';
      const password = 'admin123';
      const combined = salt + password + salt;
      const adminPassword = btoa(combined);
      this.executeRun(
        'INSERT INTO prd_users (desc_username, desc_email, desc_password_hash, desc_role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@blackbeer.com', adminPassword, 'admin']
      );
      console.log('✅ Usuário admin padrão criado');
      console.log('   Email: admin@blackbeer.com');
      console.log('   Senha: admin123');

    } catch (error) {
      console.error('❌ Erro ao criar admin padrão:', error);
    }
  }

  public getUsuarios(): any[] {
    return this.executeQuery('SELECT num_id, desc_username, desc_email, desc_role, dt_created_at, dt_last_login_at FROM prd_users');
  }

  /**
   * Busca emails configurados para relatórios no banco de dados
   * @returns Array de strings com emails configurados
   */
  public getConfiguredEmails(): string[] {
    try {
      const result = this.executeQuery('SELECT desc_email FROM config_settings LIMIT 1');

      if (result && result.length > 0) {
        const emailString = result[0].desc_email;

        // Converter string do banco para array
        // Formato no banco: "email1@example.com,email2@example.com"
        const emails = emailString
          ? emailString.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)
          : [];

        console.log('✅ Emails configurados recuperados do banco:', emails);
        return emails;
      }

      console.log('⚠️ Nenhuma configuração de email encontrada no banco');
      return [];
    } catch (error) {
      console.error('❌ Erro ao buscar emails configurados:', error);
      return [];
    }
  }

  // ==================== MÉTODOS PARA GERENCIAR ESTOQUE DE EVENTOS (V4) ====================

  /**
   * Busca todos os registros de estoque do evento atual
   * @returns Array com estoque de todas as cervejas
   */
  public getEventStock(): any[] {
    try {
      const result = this.executeQuery(`
        SELECT
          es.num_id,
          es.num_beer_id,
          es.desc_beer_name,
          es.num_quantidade_litros,
          bt.desc_color,
          es.dt_created_at,
          es.dt_updated_at
        FROM config_event_sale es
        INNER JOIN prd_beer_types bt ON es.num_beer_id = bt.num_id
        ORDER BY es.desc_beer_name
      `);
      return result;
    } catch (error) {
      console.error('❌ Erro ao buscar estoque do evento:', error);
      return [];
    }
  }

  /**
   * Busca estoque de uma cerveja específica
   * @param beerId ID da cerveja
   * @returns Objeto com dados do estoque ou null
   */
  public getEventStockByBeerId(beerId: number, eventId: number | null = null): any | null {
    try {
      const query = eventId !== null
        ? 'SELECT * FROM config_event_sale WHERE num_beer_id = ? AND num_event_id = ?'
        : 'SELECT * FROM config_event_sale WHERE num_beer_id = ? AND num_event_id IS NULL';
      const params = eventId !== null ? [beerId, eventId] : [beerId];

      const result = this.executeQuery(query, params);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('❌ Erro ao buscar estoque da cerveja:', error);
      return null;
    }
  }

  /**
   * Define ou atualiza a quantidade de litros disponível para uma cerveja no evento
   * @param beerId ID da cerveja
   * @param beerName Nome da cerveja
   * @param quantidadeLitros Quantidade em litros
   * @param minLitersAlert Limite mínimo em litros para alerta (opcional, padrão 5.0)
   * @param eventId ID do evento (null = configuração geral)
   */
  public setEventStock(beerId: number, beerName: string, quantidadeLitros: number, minLitersAlert: number = 5.0, eventId: number | null = null): void {
    try {
      // Verifica se já existe registro para esta cerveja e evento
      const existing = this.getEventStockByBeerId(beerId, eventId);

      if (existing) {
        // Atualiza registro existente
        const updateQuery = eventId !== null
          ? `UPDATE config_event_sale SET num_quantidade_litros = ?, num_min_liters_alert = ?, dt_updated_at = CURRENT_TIMESTAMP WHERE num_beer_id = ? AND num_event_id = ?`
          : `UPDATE config_event_sale SET num_quantidade_litros = ?, num_min_liters_alert = ?, dt_updated_at = CURRENT_TIMESTAMP WHERE num_beer_id = ? AND num_event_id IS NULL`;
        const updateParams = eventId !== null
          ? [quantidadeLitros, minLitersAlert, beerId, eventId]
          : [quantidadeLitros, minLitersAlert, beerId];

        this.executeRun(updateQuery, updateParams);
        console.log(`✅ Estoque atualizado: ${beerName} = ${quantidadeLitros}L (alerta: ${minLitersAlert}L) [eventId: ${eventId || 'geral'}]`);
      } else {
        // Insere novo registro
        this.executeRun(
          `INSERT INTO config_event_sale (num_beer_id, desc_beer_name, num_quantidade_litros, num_min_liters_alert, num_event_id)
           VALUES (?, ?, ?, ?, ?)`,
          [beerId, beerName, quantidadeLitros, minLitersAlert, eventId]
        );
        console.log(`✅ Estoque criado: ${beerName} = ${quantidadeLitros}L (alerta: ${minLitersAlert}L) [eventId: ${eventId || 'geral'}]`);
      }
    } catch (error) {
      console.error('❌ Erro ao definir estoque do evento:', error);
      throw error;
    }
  }

  /**
   * Atualiza apenas o limite de alerta de uma cerveja
   * @param beerId ID da cerveja
   * @param minLitersAlert Novo limite mínimo para alerta
   */
  public updateMinLitersAlert(beerId: number, minLitersAlert: number): void {
    try {
      this.executeRun(
        `UPDATE config_event_sale
         SET num_min_liters_alert = ?,
             dt_updated_at = CURRENT_TIMESTAMP
         WHERE num_beer_id = ?`,
        [minLitersAlert, beerId]
      );
      console.log(`✅ Limite de alerta atualizado: beerId ${beerId} = ${minLitersAlert}L`);
    } catch (error) {
      console.error('❌ Erro ao atualizar limite de alerta:', error);
      throw error;
    }
  }

  /**
   * Subtrai quantidade vendida do estoque do evento
   * @param beerId ID da cerveja
   * @param litersToSubtract Quantidade em litros a subtrair
   * @param eventId ID do evento (null = estoque geral)
   * @returns true se subtraiu com sucesso, false se não havia estoque configurado
   */
  public subtractFromEventStock(beerId: number, litersToSubtract: number, eventId: number | null = null): boolean {
    try {
      const stock = this.getEventStockByBeerId(beerId, eventId);

      // Se não há estoque configurado, retorna false (modo normal)
      if (!stock || stock.num_quantidade_litros === 0) {
        console.log(`ℹ️ Sem estoque configurado para beerId ${beerId} (eventId: ${eventId || 'geral'})`);
        return false;
      }

      // Calcula novo estoque (não permite negativo)
      const newQuantity = Math.max(0, stock.num_quantidade_litros - litersToSubtract);

      // Atualiza com filtro correto incluindo eventId
      const updateQuery = eventId !== null
        ? `UPDATE config_event_sale SET num_quantidade_litros = ?, dt_updated_at = CURRENT_TIMESTAMP WHERE num_beer_id = ? AND num_event_id = ?`
        : `UPDATE config_event_sale SET num_quantidade_litros = ?, dt_updated_at = CURRENT_TIMESTAMP WHERE num_beer_id = ? AND num_event_id IS NULL`;
      const updateParams = eventId !== null
        ? [newQuantity, beerId, eventId]
        : [newQuantity, beerId];

      this.executeRun(updateQuery, updateParams);

      console.log(`✅ Estoque subtraído: ${stock.desc_beer_name} -${litersToSubtract}L = ${newQuantity}L [eventId: ${eventId || 'geral'}]`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao subtrair do estoque:', error);
      return false;
    }
  }

  /**
   * Remove registro de estoque de uma cerveja (volta ao modo normal)
   * @param beerId ID da cerveja
   */
  public removeEventStock(beerId: number): void {
    try {
      this.executeRun('DELETE FROM config_event_sale WHERE num_beer_id = ?', [beerId]);
      console.log('✅ Estoque removido para beerId:', beerId);
    } catch (error) {
      console.error('❌ Erro ao remover estoque:', error);
      throw error;
    }
  }

  /**
   * Verifica se alguma cerveja está com estoque abaixo do limite configurado
   * @returns Array com cervejas em alerta
   */
  public getStockAlerts(): any[] {
    try {
      const config = this.getStockAlertConfig();
      const minLiters = config?.num_min_liters || 5.0;

      const result = this.executeQuery(
        `SELECT
          es.num_beer_id,
          es.desc_beer_name,
          es.num_quantidade_litros,
          bt.desc_color
         FROM config_event_sale es
         INNER JOIN prd_beer_types bt ON es.num_beer_id = bt.num_id
         WHERE es.num_quantidade_litros > 0
           AND es.num_quantidade_litros < ?
         ORDER BY es.num_quantidade_litros ASC`,
        [minLiters]
      );

      // Mapeia para formato esperado pelo template
      return result.map(row => ({
        beerId: row.num_beer_id,
        beerName: row.desc_beer_name,
        quantidadeLitros: row.num_quantidade_litros,
        color: row.desc_color
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar alertas de estoque:', error);
      return [];
    }
  }

  // ==================== MÉTODOS PARA CONFIGURAÇÃO DE ALERTAS ====================

  /**
   * Busca a configuração de alerta de estoque
   * @returns Objeto com minLiters ou null
   */
  public getStockAlertConfig(): any | null {
    try {
      const result = this.executeQuery('SELECT * FROM config_stock_alert WHERE num_id = 1');
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('❌ Erro ao buscar configuração de alerta:', error);
      return null;
    }
  }

  /**
   * Atualiza o limite mínimo de litros para alerta
   * @param minLiters Quantidade mínima em litros
   */
  public setStockAlertConfig(minLiters: number): void {
    try {
      this.executeRun(
        `UPDATE config_stock_alert
         SET num_min_liters = ?,
             dt_updated_at = CURRENT_TIMESTAMP
         WHERE num_id = 1`,
        [minLiters]
      );
      console.log('✅ Configuração de alerta atualizada:', minLiters, 'litros');
    } catch (error) {
      console.error('❌ Erro ao atualizar configuração de alerta:', error);
      throw error;
    }
  }

  // ==================== MÉTODOS DE CONFIGURAÇÃO DE PREÇOS (V5) ====================

  /**
   * Busca a configuração de preços de uma cerveja
   * @param beerId ID da cerveja
   * @returns Objeto com preços ou null
   */
  public getSalesConfigByBeerId(beerId: number, eventId: number | null = null): any | null {
    try {
      const query = eventId !== null
        ? 'SELECT * FROM config_sales WHERE num_beer_id = ? AND num_event_id = ?'
        : 'SELECT * FROM config_sales WHERE num_beer_id = ? AND num_event_id IS NULL';
      const params = eventId !== null ? [beerId, eventId] : [beerId];

      const result = this.executeQuery(query, params);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('❌ Erro ao buscar configuração de preços:', error);
      return null;
    }
  }

  /**
   * Busca todas as configurações de preços
   * @returns Array com todas as configurações de preços
   */
  public getAllSalesConfig(): any[] {
    try {
      return this.executeQuery('SELECT * FROM config_sales ORDER BY desc_beer_name');
    } catch (error) {
      console.error('❌ Erro ao buscar todas as configurações de preços:', error);
      return [];
    }
  }

  /**
   * Define ou atualiza a configuração de preços de uma cerveja
   * @param beerId ID da cerveja
   * @param beerName Nome da cerveja
   * @param price300ml Preço do copo de 300ml
   * @param price500ml Preço do copo de 500ml
   * @param price1000ml Preço do copo de 1000ml
   * @param eventId ID do evento (null = configuração geral)
   */
  public setSalesConfig(
    beerId: number,
    beerName: string,
    price300ml: number,
    price500ml: number,
    price1000ml: number,
    eventId: number | null = null
  ): void {
    try {
      // Verifica se já existe configuração para esta cerveja e evento
      const existing = this.getSalesConfigByBeerId(beerId, eventId);

      if (existing) {
        // Atualiza configuração existente
        const updateQuery = eventId !== null
          ? `UPDATE config_sales SET desc_beer_name = ?, num_price_300ml = ?, num_price_500ml = ?, num_price_1000ml = ?, dt_updated_at = CURRENT_TIMESTAMP WHERE num_beer_id = ? AND num_event_id = ?`
          : `UPDATE config_sales SET desc_beer_name = ?, num_price_300ml = ?, num_price_500ml = ?, num_price_1000ml = ?, dt_updated_at = CURRENT_TIMESTAMP WHERE num_beer_id = ? AND num_event_id IS NULL`;
        const updateParams = eventId !== null
          ? [beerName, price300ml, price500ml, price1000ml, beerId, eventId]
          : [beerName, price300ml, price500ml, price1000ml, beerId];

        this.executeRun(updateQuery, updateParams);
        console.log(`✅ Configuração de preços atualizada: ${beerName} [eventId: ${eventId || 'geral'}]`);
      } else {
        // Insere nova configuração
        this.executeRun(
          `INSERT INTO config_sales (num_beer_id, desc_beer_name, num_price_300ml, num_price_500ml, num_price_1000ml, num_event_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [beerId, beerName, price300ml, price500ml, price1000ml, eventId]
        );
        console.log(`✅ Configuração de preços criada: ${beerName} [eventId: ${eventId || 'geral'}]`);
      }

      this.persist();
    } catch (error) {
      console.error('❌ Erro ao salvar configuração de preços:', error);
      throw error;
    }
  }

  /**
   * Remove a configuração de preços de uma cerveja
   * @param beerId ID da cerveja
   */
  public removeSalesConfig(beerId: number): void {
    try {
      this.executeRun('DELETE FROM config_sales WHERE num_beer_id = ?', [beerId]);
      console.log('✅ Configuração de preços removida para beerId:', beerId);
      this.persist();
    } catch (error) {
      console.error('❌ Erro ao remover configuração de preços:', error);
      throw error;
    }
  }

  /**
   * Calcula o valor total de vendas (receita) em R$
   * @param startDate Data inicial do filtro (opcional)
   * @param endDate Data final do filtro (opcional)
   * @returns Valor total em reais
   */
  public getTotalRevenue(startDate?: Date, endDate?: Date, eventId?: number): number {
    if (!this.db) {
      return 0;
    }

    try {
      let sql = `
        SELECT
          SUM(
            CASE
              WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
              WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
              WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
              ELSE 0
            END
          ) as totalRevenue
        FROM prd_sales s
        LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id
      `;

      const params: any[] = [];
      let whereClause = '';

      // Aplicar filtros de data se houver
      if (startDate && endDate) {
        whereClause = ' WHERE s.dt_timestamp BETWEEN ? AND ?';
        params.push(startDate.toISOString(), endDate.toISOString());
      }

      // Aplicar filtro de evento se houver
      if (eventId !== undefined) {
        whereClause += whereClause ? ' AND s.num_event_id = ?' : ' WHERE s.num_event_id = ?';
        params.push(eventId);
      }

      sql += whereClause;

      const result = this.executeQuery(sql, params);

      if (result.length > 0 && result[0].totalRevenue !== null) {
        return Number(result[0].totalRevenue);
      }

      return 0;
    } catch (error) {
      console.error('❌ Erro ao calcular valor total:', error);
      return 0;
    }
  }

  // ==================== COMANDAS CRUD ====================

  /**
   * Busca todas as comandas ordenadas por número
   * @returns Array de comandas
   */
  public getAllComandas(): any[] {
    const query = 'SELECT * FROM prd_comandas ORDER BY num_numero ASC';
    return this.executeQuery(query);
  }

  /**
   * Busca comandas por status
   * @param status Status da comanda (disponivel, em_uso, aguardando_pagamento)
   * @returns Array de comandas com o status especificado
   */
  public getComandasByStatus(status: string): any[] {
    const query = 'SELECT * FROM prd_comandas WHERE desc_status = ? ORDER BY num_numero ASC';
    return this.executeQuery(query, [status]);
  }

  /**
   * Busca comanda por número
   * @param numero Número da comanda
   * @returns Comanda ou null se não encontrada
   */
  public getComandaByNumero(numero: number): any | null {
    const query = 'SELECT * FROM prd_comandas WHERE num_numero = ? LIMIT 1';
    const result = this.executeQuery(query, [numero]);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Busca comanda por ID
   * @param id ID da comanda
   * @returns Comanda ou null se não encontrada
   */
  public getComandaById(id: number): any | null {
    const query = 'SELECT * FROM prd_comandas WHERE num_id = ? LIMIT 1';
    const result = this.executeQuery(query, [id]);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Abre uma comanda (muda status de disponivel para em_uso)
   * @param numero Número da comanda a ser aberta
   */
  public openComanda(numero: number): void {
    const now = new Date().toISOString();
    this.executeRun(
      `UPDATE prd_comandas
       SET desc_status = ?, dt_opened_at = ?, dt_updated_at = ?
       WHERE num_numero = ? AND desc_status = ?`,
      ['em_uso', now, now, numero, 'disponivel']
    );
    this.persist();
  }

  /**
   * Fecha uma comanda (muda status para aguardando_pagamento e calcula total)
   * @param comandaId ID da comanda a ser fechada
   */
  public closeComanda(comandaId: number): void {
    const now = new Date().toISOString();
    const total = this.calculateComandaTotal(comandaId);

    this.executeRun(
      `UPDATE prd_comandas
       SET desc_status = ?, dt_closed_at = ?, num_total_value = ?, dt_updated_at = ?
       WHERE num_id = ?`,
      ['aguardando_pagamento', now, total, now, comandaId]
    );
    this.persist();
  }

  /**
   * Confirma pagamento de uma comanda (libera comanda para reutilização)
   * @param comandaId ID da comanda
   */
  public confirmPayment(comandaId: number): void {
    const now = new Date().toISOString();

    this.executeRun(
      `UPDATE prd_comandas
       SET desc_status = ?, dt_paid_at = ?, num_total_value = 0, dt_opened_at = NULL, dt_closed_at = NULL, dt_updated_at = ?
       WHERE num_id = ?`,
      ['disponivel', now, now, comandaId]
    );

    // Remover vínculo das vendas desta comanda (vendas ficam no histórico)
    this.executeRun(
      'UPDATE prd_sales SET num_comanda_id = NULL WHERE num_comanda_id = ?',
      [comandaId]
    );

    this.persist();
  }

  /**
   * Calcula o valor total de uma comanda baseado em suas vendas
   * @param comandaId ID da comanda
   * @returns Valor total em reais
   */
  public calculateComandaTotal(comandaId: number): number {
    const query = `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
            WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
            WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
            ELSE 0
          END
        ), 0) as total
      FROM prd_sales s
      LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id
      WHERE s.num_comanda_id = ?
    `;

    const result = this.executeQuery(query, [comandaId]);
    return result.length > 0 ? Number(result[0].total) : 0;
  }

  /**
   * Busca todos os itens (vendas) de uma comanda
   * @param comandaId ID da comanda
   * @returns Array de itens da comanda com preços calculados
   */
  public getComandaItems(comandaId: number): any[] {
    const query = `
      SELECT
        s.num_id as num_sale_id,
        s.num_beer_id,
        s.desc_beer_name,
        s.num_cup_size,
        s.num_quantity,
        s.dt_timestamp,
        CASE
          WHEN s.num_cup_size = 300 THEN COALESCE(sc.num_price_300ml, 0)
          WHEN s.num_cup_size = 500 THEN COALESCE(sc.num_price_500ml, 0)
          WHEN s.num_cup_size = 1000 THEN COALESCE(sc.num_price_1000ml, 0)
          ELSE 0
        END as num_unit_price,
        CASE
          WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
          WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
          WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
          ELSE 0
        END as num_total_price
      FROM prd_sales s
      LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id
        AND (
          (s.num_event_id IS NULL AND sc.num_event_id IS NULL)
          OR s.num_event_id = sc.num_event_id
        )
      WHERE s.num_comanda_id = ?
      ORDER BY s.dt_timestamp DESC
    `;

    return this.executeQuery(query, [comandaId]);
  }

  /**
   * Busca comanda completa com seus itens
   * @param comandaId ID da comanda
   * @returns Comanda com array de itens ou null se não encontrada
   */
  public getComandaWithItems(comandaId: number): any | null {
    const comanda = this.getComandaById(comandaId);
    if (!comanda) return null;

    const items = this.getComandaItems(comandaId);

    // Calcula o total a partir dos itens (mais confiável que o valor salvo)
    const calculatedTotal = items.reduce((sum, item) => sum + (item.num_total_price || 0), 0);

    return {
      ...comanda,
      items,
      num_total_value: calculatedTotal // Sobrescreve com o valor calculado
    };
  }

  // ==================== EVENTS CRUD ====================

  /**
   * Cria um novo evento
   * @param eventData Dados do evento (nameEvent, localEvent, dataEvent, contactEvent, nameContactEvent, status)
   * @returns ID do evento criado ou null se falhar
   */
  public createEvent(eventData: {
    nameEvent: string;
    localEvent: string;
    dataEvent: string;
    contactEvent?: string;
    nameContactEvent?: string;
    status?: 'planejamento' | 'ativo' | 'finalizado';
  }): number | null {
    if (!this.db) {
      console.error('❌ Banco de dados não inicializado');
      return null;
    }

    try {
      const now = new Date().toISOString();
      const status = eventData.status || 'planejamento';

      console.log('📝 Criando evento:', eventData);

      // Usar statement preparado para obter melhor controle
      const stmt = this.db.prepare(
        `INSERT INTO prd_events (desc_name_event, desc_local_event, dt_data_event, desc_contact_event, desc_name_contact_event, desc_status, dt_created_at, dt_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run([
        eventData.nameEvent,
        eventData.localEvent,
        eventData.dataEvent,
        eventData.contactEvent || null,
        eventData.nameContactEvent || null,
        status,
        now,
        now
      ]);

      stmt.free();

      // Obter ID imediatamente após o INSERT
      const eventId = this.getLastInsertId();

      if (!eventId || eventId === 0) {
        console.error('❌ Erro: ID do evento é 0 ou null');
        console.error('   Isso indica que o INSERT pode ter falhado silenciosamente');
        console.error('   Verifique se a tabela prd_events existe');
        return null;
      }

      this.persist();
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
   * @returns Array de eventos
   */
  public getAllEvents(): any[] {
    const query = 'SELECT * FROM prd_events ORDER BY dt_data_event DESC';
    return this.executeQuery(query);
  }

  /**
   * Busca eventos por status
   * @param status Status do evento (planejamento, ativo, finalizado)
   * @returns Array de eventos com o status especificado
   */
  public getEventsByStatus(status: 'planejamento' | 'ativo' | 'finalizado'): any[] {
    const query = 'SELECT * FROM prd_events WHERE desc_status = ? ORDER BY dt_data_event DESC';
    return this.executeQuery(query, [status]);
  }

  /**
   * Busca evento por ID
   * @param id ID do evento
   * @returns Evento ou null se não encontrado
   */
  public getEventById(id: number): any | null {
    const query = 'SELECT * FROM prd_events WHERE num_id = ? LIMIT 1';
    const result = this.executeQuery(query, [id]);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Atualiza um evento existente
   * @param id ID do evento
   * @param eventData Dados a serem atualizados (parciais)
   * @returns true se atualizado com sucesso, false caso contrário
   */
  public updateEvent(id: number, eventData: {
    nameEvent?: string;
    localEvent?: string;
    dataEvent?: string;
    contactEvent?: string;
    nameContactEvent?: string;
    status?: 'planejamento' | 'ativo' | 'finalizado';
  }): boolean {
    try {
      const now = new Date().toISOString();
      const updates: string[] = [];
      const values: any[] = [];

      // Construir query dinamicamente baseado nos campos fornecidos
      if (eventData.nameEvent !== undefined) {
        updates.push('desc_name_event = ?');
        values.push(eventData.nameEvent);
      }
      if (eventData.localEvent !== undefined) {
        updates.push('desc_local_event = ?');
        values.push(eventData.localEvent);
      }
      if (eventData.dataEvent !== undefined) {
        updates.push('dt_data_event = ?');
        values.push(eventData.dataEvent);
      }
      if (eventData.contactEvent !== undefined) {
        updates.push('desc_contact_event = ?');
        values.push(eventData.contactEvent || null);
      }
      if (eventData.nameContactEvent !== undefined) {
        updates.push('desc_name_contact_event = ?');
        values.push(eventData.nameContactEvent || null);
      }
      if (eventData.status !== undefined) {
        updates.push('desc_status = ?');
        values.push(eventData.status);
      }

      // Sempre atualizar dt_updated_at
      updates.push('dt_updated_at = ?');
      values.push(now);

      // Adicionar ID ao final
      values.push(id);

      if (updates.length === 1) {
        // Apenas dt_updated_at, nada para atualizar
        return false;
      }

      const query = `UPDATE prd_events SET ${updates.join(', ')} WHERE num_id = ?`;
      this.executeRun(query, values);
      this.persist();
      console.log('✅ Evento atualizado com sucesso:', id);
      return true;
    } catch (error) {
      console.error('❌ Erro ao atualizar evento:', error);
      return false;
    }
  }

  /**
   * Deleta um evento
   * ATENÇÃO: Isso irá:
   * - Deletar configurações de estoque relacionadas (config_event_sale CASCADE)
   * - Deletar configurações de preços relacionadas (config_sales CASCADE)
   * - Setar num_event_id = NULL nas vendas relacionadas (prd_sales SET NULL)
   *
   * @param id ID do evento
   * @returns true se deletado com sucesso, false caso contrário
   */
  public deleteEvent(id: number): boolean {
    try {
      this.executeRun('DELETE FROM prd_events WHERE num_id = ?', [id]);
      this.persist();
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
   * @returns Array de eventos ativos
   */
  public getActiveEvents(): any[] {
    return this.getEventsByStatus('ativo');
  }

  /**
   * Muda o status de um evento
   * @param id ID do evento
   * @param status Novo status
   * @returns true se atualizado com sucesso, false caso contrário
   */
  public updateEventStatus(id: number, status: 'planejamento' | 'ativo' | 'finalizado'): boolean {
    return this.updateEvent(id, { status });
  }

  /**
   * Busca estatísticas de um evento (total de vendas, volume, receita)
   * @param eventId ID do evento
   * @returns Objeto com estatísticas do evento
   */
  public getEventStatistics(eventId: number): {
    num_total_sales: number;
    num_total_volume: number;
    num_total_revenue: number;
    salesByBeer: any[];
  } {
    try {
      // Total de vendas e volume
      const summaryQuery = `
        SELECT
          COUNT(*) as num_total_sales,
          COALESCE(SUM(num_total_volume), 0) as num_total_volume
        FROM prd_sales
        WHERE num_event_id = ?
      `;
      const summary = this.executeQuery(summaryQuery, [eventId]);

      // Receita total
      const revenueQuery = `
        SELECT
          COALESCE(SUM(
            CASE
              WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
              WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
              WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
              ELSE 0
            END
          ), 0) as num_total_revenue
        FROM prd_sales s
        LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id AND (sc.num_event_id = ? OR sc.num_event_id IS NULL)
        WHERE s.num_event_id = ?
      `;
      const revenue = this.executeQuery(revenueQuery, [eventId, eventId]);

      // Vendas por cerveja
      const salesByBeerQuery = `
        SELECT
          s.desc_beer_name,
          COUNT(*) as num_sales_count,
          COALESCE(SUM(s.num_quantity), 0) as num_total_quantity,
          COALESCE(SUM(s.num_total_volume), 0) as num_total_volume,
          COALESCE(SUM(
            CASE
              WHEN s.num_cup_size = 300 THEN s.num_quantity * COALESCE(sc.num_price_300ml, 0)
              WHEN s.num_cup_size = 500 THEN s.num_quantity * COALESCE(sc.num_price_500ml, 0)
              WHEN s.num_cup_size = 1000 THEN s.num_quantity * COALESCE(sc.num_price_1000ml, 0)
              ELSE 0
            END
          ), 0) as num_revenue
        FROM prd_sales s
        LEFT JOIN config_sales sc ON s.num_beer_id = sc.num_beer_id AND (sc.num_event_id = ? OR sc.num_event_id IS NULL)
        WHERE s.num_event_id = ?
        GROUP BY s.num_beer_id, s.desc_beer_name
        ORDER BY num_revenue DESC
      `;
      const salesByBeer = this.executeQuery(salesByBeerQuery, [eventId, eventId]);

      return {
        num_total_sales: summary[0]?.num_total_sales || 0,
        num_total_volume: summary[0]?.num_total_volume || 0,
        num_total_revenue: revenue[0]?.num_total_revenue || 0,
        salesByBeer
      };
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas do evento:', error);
      return {
        num_total_sales: 0,
        num_total_volume: 0,
        num_total_revenue: 0,
        salesByBeer: []
      };
    }
  }

  /**
   * Verifica se um evento tem vendas associadas
   * @param eventId ID do evento
   * @returns true se o evento tem vendas, false caso contrário
   */
  public eventHasSales(eventId: number): boolean {
    const query = 'SELECT COUNT(*) as count FROM prd_sales WHERE num_event_id = ?';
    const result = this.executeQuery(query, [eventId]);
    return result[0]?.count > 0;
  }

  /**
   * Busca todas as vendas de um evento
   * @param eventId ID do evento
   * @returns Array de vendas do evento
   */
  public getSalesByEvent(eventId: number): any[] {
    const query = `
      SELECT s.*, u.desc_username as username
      FROM prd_sales s
      LEFT JOIN prd_users u ON s.num_user_id = u.num_id
      WHERE s.num_event_id = ?
      ORDER BY s.dt_timestamp DESC
    `;
    return this.executeQuery(query, [eventId]);
  }
}
