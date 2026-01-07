// src/app/core/services/database.ts
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import initSqlJs, { type Database } from 'sql.js';
import { BeerType, Sale } from '../models/beer.model';
import { FullReport, SalesSummary, SalesByCupSize, SalesByBeerType } from '../models/report.model';
import { isPlatformBrowser } from '@angular/common';

const DB_STORAGE_KEY = 'black_beer_sqlite_db_v7'; // v7 para minLitersAlert individual
const DB_VERSION = 7; // Versionamento do schema

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
 * MUDANÇAS NA REFATORAÇÃO:
 * - IDs mudados de TEXT para INTEGER (auto-increment)
 * - Tabela settings reestruturada (id, email, isConfigured)
 * - Foreign key beerId agora é INTEGER
 * - Seed data atualizado com IDs numéricos
 * - Queries tipadas e otimizadas
 *
 * @version 3.0.0
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
   * Verifica versão e realiza migração se necessário
   */
  private async initializeDatabase(): Promise<void> {
    try {
      const initSqlJs = (await import('sql.js')).default;
      this.SQL = await initSqlJs({
        locateFile: (file: string) => `assets/${file}`
      });

      // Tentar carregar de v6 primeiro
      let savedDb = localStorage.getItem(DB_STORAGE_KEY);

      // Se não encontrou v7, tentar v6 para migração
      if (!savedDb) {
        const oldDbKeyV6 = 'black_beer_sqlite_db_v6';
        savedDb = localStorage.getItem(oldDbKeyV6);

        if (savedDb) {
          console.log('🔄 Migrando banco de dados de V6 para V7...');
          const dbArray = this.stringToUint8Array(savedDb);
          this.db = new this.SQL.Database(dbArray);
          this.migrateFromV6ToV7();
          localStorage.removeItem(oldDbKeyV6);
          this.persist();
          console.log('✅ Migração V6 → V7 concluída');
        } else {
          // Não há DB, criar novo
          console.log('🔄 Criando novo banco de dados (versão 7)...');
          this.createNewDatabase();
        }
      } else {
        // Carrega banco existente V7
        const dbArray = this.stringToUint8Array(savedDb);
        this.db = new this.SQL.Database(dbArray);
        console.log('✅ Banco de dados V7 carregado');
      }

      this.isDbReady.set(true);
    } catch (err) {
      console.error("❌ Erro na inicialização do banco:", err);
    }
  }

  /**
   * Cria um novo banco de dados do zero com schema v6
   */
  private createNewDatabase(): void {
    this.db = new this.SQL.Database();
    this.createSchemaV6();
    this.seedInitialData();
    this.setStoredVersion(DB_VERSION);
    this.persist();
  }

  /**
   * Cria o schema do banco de dados versão 6
   *
   * MUDANÇAS V6:
   * - comandas: Nova tabela para gerenciamento de comandas (tabs)
   * - sales.comandaId: Nova coluna opcional para vincular vendas a comandas
   *
   * MUDANÇAS V5:
   * - sales_config: Nova tabela para configuração de preços por cerveja e tamanho de copo
   *
   * MUDANÇAS V4:
   * - event_sale: Nova tabela para controle de estoque por evento
   * - stock_alert_config: Nova tabela para configuração de alertas de estoque baixo
   *
   * MUDANÇAS V3:
   * - beer_types.id: TEXT → INTEGER PRIMARY KEY AUTOINCREMENT
   * - sales.id: TEXT → INTEGER PRIMARY KEY AUTOINCREMENT
   * - sales.beerId: TEXT → INTEGER (FK mantida)
   * - settings: nova estrutura (id INTEGER, email TEXT, isConfigured INTEGER)
   * - Tabela de configurações com suporte a múltiplos emails
    * - email: String com emails separados por ; (ex: "a@x.com;b@x.com")
    * - Mínimo: 1 email, Máximo: 10 emails
   * - client_config: Tabela para white-label (logo e nome da empresa)
   */
  private createSchemaV6(): void {
    if (!this.db) return;

   const schema = `
      -- Tabela de tipos de cerveja com ID INTEGER
      CREATE TABLE IF NOT EXISTS beer_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#D4A574',
        description TEXT
      );

      -- Tabela de vendas com IDs INTEGER e FK correta
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        beerId INTEGER NOT NULL,
        beerName TEXT NOT NULL,
        cupSize INTEGER NOT NULL CHECK(cupSize IN (300, 500, 1000)),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        totalVolume REAL NOT NULL CHECK(totalVolume > 0),
        comandaId INTEGER,
        FOREIGN KEY (beerId) REFERENCES beer_types(id) ON DELETE CASCADE,
        FOREIGN KEY (comandaId) REFERENCES comandas(id) ON DELETE SET NULL
      );

      -- Índice para melhorar performance em queries por data
      CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(timestamp);

      -- Índice para melhorar performance em queries por cerveja
      CREATE INDEX IF NOT EXISTS idx_sales_beerId ON sales(beerId);

      -- Índice para melhorar performance em queries por comanda
      CREATE INDEX IF NOT EXISTS idx_sales_comandaId ON sales(comandaId);

      -- Tabela de configurações reestruturada
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        isConfigured INTEGER NOT NULL DEFAULT 0 CHECK(isConfigured IN (0, 1))
      );

      -- Tabela de usuários (NOVO)
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'admin')) DEFAULT 'user',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lastLoginAt TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

      -- Tabela de configurações do cliente (white-label)
      CREATE TABLE IF NOT EXISTS client_config (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        companyName TEXT,
        logoBase64 TEXT,
        logoMimeType TEXT,
        logoFileName TEXT,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de estoque por evento (V4 - atualizada V7)
      -- Armazena a quantidade de litros disponível de cada cerveja no evento atual
      -- V7: Adicionado minLitersAlert para limite individual por cerveja
      CREATE TABLE IF NOT EXISTS event_sale (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        beerId INTEGER NOT NULL,
        beerName TEXT NOT NULL,
        quantidadeLitros REAL NOT NULL DEFAULT 0 CHECK(quantidadeLitros >= 0),
        minLitersAlert REAL DEFAULT 5.0 CHECK(minLitersAlert >= 0),
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (beerId) REFERENCES beer_types(id) ON DELETE CASCADE,
        UNIQUE(beerId)
      );

      -- Índice para melhorar performance em queries por cerveja
      CREATE INDEX IF NOT EXISTS idx_event_sale_beerId ON event_sale(beerId);

      -- Tabela de configuração de alertas de estoque (V4)
      -- Armazena o limite mínimo de litros para emitir alerta
      CREATE TABLE IF NOT EXISTS stock_alert_config (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        minLiters REAL NOT NULL DEFAULT 5.0 CHECK(minLiters >= 0),
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Insere configuração padrão de alerta (5 litros)
      INSERT OR IGNORE INTO stock_alert_config (id, minLiters) VALUES (1, 5.0);

      -- Tabela de configuração de preços por cerveja (V5)
      -- Armazena o preço de cada cerveja por tamanho de copo (300ml, 500ml, 1000ml)
      CREATE TABLE IF NOT EXISTS sales_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        beerId INTEGER NOT NULL,
        beerName TEXT NOT NULL,
        price300ml REAL NOT NULL DEFAULT 0 CHECK(price300ml >= 0),
        price500ml REAL NOT NULL DEFAULT 0 CHECK(price500ml >= 0),
        price1000ml REAL NOT NULL DEFAULT 0 CHECK(price1000ml >= 0),
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (beerId) REFERENCES beer_types(id) ON DELETE CASCADE,
        UNIQUE(beerId)
      );

      -- Índice para melhorar performance em queries por cerveja
      CREATE INDEX IF NOT EXISTS idx_sales_config_beerId ON sales_config(beerId);

      -- Tabela de comandas (V6)
      -- Armazena o estado de cada comanda (disponível, em uso, aguardando pagamento)
      CREATE TABLE IF NOT EXISTS comandas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('disponivel', 'em_uso', 'aguardando_pagamento')) DEFAULT 'disponivel',
        totalValue REAL DEFAULT 0,
        openedAt TEXT,
        closedAt TEXT,
        paidAt TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para melhorar performance em queries por status e número
      CREATE INDEX IF NOT EXISTS idx_comandas_status ON comandas(status);
      CREATE INDEX IF NOT EXISTS idx_comandas_numero ON comandas(numero);

      -- Tabela de versão do schema
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      );

      INSERT INTO db_version (version) VALUES (${DB_VERSION});
    `;

    this.db.exec(schema);
    console.log('✅ Schema V6 criado com sucesso');
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
      { name: 'Pilsen', color: '#f9e79f', description: 'Clara e refrescante.' },
      { name: 'Larger', color: '#f39c12', description: 'Amarga e aromática.' },
      { name: 'IPA', color: '#f1c40f', description: 'Leve e frutada.' },
      { name: 'Session IPA', color: '#8B4513', description: 'Escura e robusta.' }
    ];

    const insertBeerStmt = this.db.prepare(
      'INSERT INTO beer_types (name, color, description) VALUES (?, ?, ?)'
    );

    defaultBeers.forEach(beer => {
      insertBeerStmt.run([beer.name, beer.color, beer.description]);
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
        `INSERT INTO comandas (numero, status) VALUES (?, ?)`,
        [i, 'disponivel']
      );
    }

    console.log(`✅ ${count} comandas criadas com sucesso`);
    this.persist();
  }

  /**
   * Migra banco de dados de V5 para V6
   * Adiciona tabela comandas e coluna comandaId em sales
   */
  private migrateFromV5ToV6(): void {
    if (!this.db) return;

    console.log('🔄 Iniciando migração V5 → V6...');

    try {
      // Criar tabela comandas
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS comandas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero INTEGER NOT NULL UNIQUE,
          status TEXT NOT NULL CHECK(status IN ('disponivel', 'em_uso', 'aguardando_pagamento')) DEFAULT 'disponivel',
          totalValue REAL DEFAULT 0,
          openedAt TEXT,
          closedAt TEXT,
          paidAt TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_comandas_status ON comandas(status);
        CREATE INDEX IF NOT EXISTS idx_comandas_numero ON comandas(numero);
      `);

      console.log('✅ Tabela comandas criada');

      // Adicionar coluna comandaId na tabela sales
      try {
        this.db.exec('ALTER TABLE sales ADD COLUMN comandaId INTEGER REFERENCES comandas(id) ON DELETE SET NULL');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_sales_comandaId ON sales(comandaId)');
        console.log('✅ Coluna comandaId adicionada à tabela sales');
      } catch (error) {
        // Coluna já existe, ignorar erro
        console.log('ℹ️ Coluna comandaId já existe');
      }

      // Criar 10 comandas iniciais
      this.seedInitialComandas(10);

      // Atualizar versão do banco
      this.db.exec('DELETE FROM db_version');
      this.db.exec(`INSERT INTO db_version (version) VALUES (${DB_VERSION})`);

      console.log('✅ Migração V5 → V6 concluída com sucesso');
    } catch (error) {
      console.error('❌ Erro na migração V5 → V6:', error);
      throw error;
    }
  }

  /**
   * Migração V6 → V7
   * Adiciona coluna minLitersAlert individual para cada cerveja na tabela event_sale
   */
  private migrateFromV6ToV7(): void {
    if (!this.db) return;

    console.log('🔄 Iniciando migração V6 → V7...');

    try {
      // Adicionar coluna minLitersAlert na tabela event_sale
      try {
        this.db.exec('ALTER TABLE event_sale ADD COLUMN minLitersAlert REAL DEFAULT 5.0 CHECK(minLitersAlert >= 0)');
        console.log('✅ Coluna minLitersAlert adicionada à tabela event_sale');
      } catch (error) {
        // Coluna já existe, ignorar erro
        console.log('ℹ️ Coluna minLitersAlert já existe');
      }

      // Atualizar versão do banco
      this.db.exec('DELETE FROM db_version');
      this.db.exec(`INSERT INTO db_version (version) VALUES (${DB_VERSION})`);

      console.log('✅ Migração V6 → V7 concluída com sucesso');
    } catch (error) {
      console.error('❌ Erro na migração V6 → V7:', error);
      throw error;
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
   */
  private uint8ArrayToString = (arr: Uint8Array): string =>
    btoa(String.fromCharCode.apply(null, Array.from(arr)));

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
      const salesCount = this.executeQuery('SELECT COUNT(*) as count FROM sales')[0]?.count || 0;
      const beerTypesCount = this.executeQuery('SELECT COUNT(*) as count FROM beer_types')[0]?.count || 0;
      const settingsCount = this.executeQuery('SELECT COUNT(*) as count FROM settings')[0]?.count || 0;
      const version = this.executeQuery('SELECT version FROM db_version LIMIT 1')[0]?.version || 0;

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
  public getFullReport(startDate?: Date, endDate?: Date): FullReport {
    if (!this.db) {
      return {
        summary: { totalSales: 0, totalVolumeLiters: 0 },
        salesByCupSize: [],
        salesByBeerType: []
      };
    }

    let whereClause = '';
    const params: string[] = [];

    if (startDate) {
      whereClause += ' WHERE timestamp >= ?';
      params.push(startDate.toISOString());
    }

    if (endDate) {
      whereClause += whereClause ? ' AND timestamp <= ?' : ' WHERE timestamp <= ?';
      const endOfDay = new Date(endDate);
      endOfDay.setDate(endOfDay.getDate() + 1);
      endOfDay.setSeconds(endOfDay.getSeconds() - 1);
      params.push(endOfDay.toISOString());
    }

    // Query de resumo
    const summaryQuery = `
      SELECT
        COUNT(id) as totalSales,
        COALESCE(SUM(totalVolume) / 1000.0, 0) as totalVolumeLiters
      FROM sales
      ${whereClause}
    `;
    const summaryResult = this.executeQuery(summaryQuery, params)[0] || {
      totalSales: 0,
      totalVolumeLiters: 0
    };

    // Query por tamanho de copo
    const byCupSizeQuery = `
      SELECT
        cupSize,
        SUM(quantity) as count
      FROM sales
      ${whereClause}
      GROUP BY cupSize
      ORDER BY cupSize
    `;
    const salesByCupSize = this.executeQuery(byCupSizeQuery, params);

    // Query por tipo de cerveja (JOIN com beer_types usando INTEGER)
    // Inclui cálculo de receita (totalRevenue) com base nos preços configurados
    const byBeerTypeQuery = `
      SELECT
        bt.id as beerId,
        bt.name,
        bt.color,
        bt.description,
        SUM(s.quantity) as totalCups,
        COALESCE(SUM(s.totalVolume) / 1000.0, 0) as totalLiters,
        COALESCE(SUM(
          CASE
            WHEN s.cupSize = 300 THEN s.quantity * COALESCE(sc.price300ml, 0)
            WHEN s.cupSize = 500 THEN s.quantity * COALESCE(sc.price500ml, 0)
            WHEN s.cupSize = 1000 THEN s.quantity * COALESCE(sc.price1000ml, 0)
            ELSE 0
          END
        ), 0) as totalRevenue
      FROM sales s
      INNER JOIN beer_types bt ON s.beerId = bt.id
      LEFT JOIN sales_config sc ON s.beerId = sc.beerId
      ${whereClause}
      GROUP BY bt.id, bt.name, bt.color, bt.description
      ORDER BY totalLiters DESC
    `;

    const salesByBeerType = this.executeQuery(byBeerTypeQuery, params);

    return {
      summary: {
        totalSales: Number(summaryResult.totalSales) || 0,
        totalVolumeLiters: Number(summaryResult.totalVolumeLiters) || 0,
      },
      salesByCupSize: salesByCupSize.map(item => ({
        cupSize: Number(item.cupSize),
        count: Number(item.count)
      })),
      salesByBeerType: salesByBeerType.map(item => ({
        beerId: Number(item.beerId), // Agora é INTEGER
        name: item.name,
        color: item.color,
        description: item.description,
        totalCups: Number(item.totalCups),
        totalLiters: Number(item.totalLiters),
        totalRevenue: Number(item.totalRevenue) || 0
      }))
    };
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

  private createDefaultAdmin(): void {
    try {
      // Verifica se já existe admin
      const existing = this.executeQuery(
        "SELECT id FROM users WHERE email = 'admin@blackbeer.com' LIMIT 1"
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
        'INSERT INTO users (username, email, passwordHash, role) VALUES (?, ?, ?, ?)',
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
    return this.executeQuery('SELECT id, username, email, role, createdAt, lastLoginAt FROM users');
  }

  /**
   * Busca emails configurados para relatórios no banco de dados
   * @returns Array de strings com emails configurados
   */
  public getConfiguredEmails(): string[] {
    try {
      const result = this.executeQuery('SELECT email FROM settings LIMIT 1');

      if (result && result.length > 0) {
        const emailString = result[0].email;

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
          es.id,
          es.beerId,
          es.beerName,
          es.quantidadeLitros,
          bt.color,
          es.createdAt,
          es.updatedAt
        FROM event_sale es
        INNER JOIN beer_types bt ON es.beerId = bt.id
        ORDER BY es.beerName
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
  public getEventStockByBeerId(beerId: number): any | null {
    try {
      const result = this.executeQuery(
        'SELECT * FROM event_sale WHERE beerId = ?',
        [beerId]
      );
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
   */
  public setEventStock(beerId: number, beerName: string, quantidadeLitros: number, minLitersAlert: number = 5.0): void {
    try {
      // Verifica se já existe registro para esta cerveja
      const existing = this.getEventStockByBeerId(beerId);

      if (existing) {
        // Atualiza registro existente
        this.executeRun(
          `UPDATE event_sale
           SET quantidadeLitros = ?,
               minLitersAlert = ?,
               updatedAt = CURRENT_TIMESTAMP
           WHERE beerId = ?`,
          [quantidadeLitros, minLitersAlert, beerId]
        );
        console.log(`✅ Estoque atualizado: ${beerName} = ${quantidadeLitros}L (alerta: ${minLitersAlert}L)`);
      } else {
        // Insere novo registro
        this.executeRun(
          `INSERT INTO event_sale (beerId, beerName, quantidadeLitros, minLitersAlert)
           VALUES (?, ?, ?, ?)`,
          [beerId, beerName, quantidadeLitros, minLitersAlert]
        );
        console.log(`✅ Estoque criado: ${beerName} = ${quantidadeLitros}L (alerta: ${minLitersAlert}L)`);
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
        `UPDATE event_sale
         SET minLitersAlert = ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE beerId = ?`,
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
   * @returns true se subtraiu com sucesso, false se não havia estoque configurado
   */
  public subtractFromEventStock(beerId: number, litersToSubtract: number): boolean {
    try {
      const stock = this.getEventStockByBeerId(beerId);

      // Se não há estoque configurado, retorna false (modo normal)
      if (!stock || stock.quantidadeLitros === 0) {
        return false;
      }

      // Calcula novo estoque (não permite negativo)
      const newQuantity = Math.max(0, stock.quantidadeLitros - litersToSubtract);

      this.executeRun(
        `UPDATE event_sale
         SET quantidadeLitros = ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE beerId = ?`,
        [newQuantity, beerId]
      );

      console.log(`✅ Estoque subtraído: ${stock.beerName} -${litersToSubtract}L = ${newQuantity}L`);
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
      this.executeRun('DELETE FROM event_sale WHERE beerId = ?', [beerId]);
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
      const minLiters = config?.minLiters || 5.0;

      const result = this.executeQuery(
        `SELECT
          es.beerId,
          es.beerName,
          es.quantidadeLitros,
          bt.color
         FROM event_sale es
         INNER JOIN beer_types bt ON es.beerId = bt.id
         WHERE es.quantidadeLitros > 0
           AND es.quantidadeLitros < ?
         ORDER BY es.quantidadeLitros ASC`,
        [minLiters]
      );

      return result;
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
      const result = this.executeQuery('SELECT * FROM stock_alert_config WHERE id = 1');
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
        `UPDATE stock_alert_config
         SET minLiters = ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = 1`,
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
  public getSalesConfigByBeerId(beerId: number): any | null {
    try {
      const result = this.executeQuery(
        'SELECT * FROM sales_config WHERE beerId = ?',
        [beerId]
      );
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
      return this.executeQuery('SELECT * FROM sales_config ORDER BY beerName');
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
   */
  public setSalesConfig(
    beerId: number,
    beerName: string,
    price300ml: number,
    price500ml: number,
    price1000ml: number
  ): void {
    try {
      // Verifica se já existe configuração para esta cerveja
      const existing = this.getSalesConfigByBeerId(beerId);

      if (existing) {
        // Atualiza configuração existente
        this.executeRun(
          `UPDATE sales_config
           SET beerName = ?,
               price300ml = ?,
               price500ml = ?,
               price1000ml = ?,
               updatedAt = CURRENT_TIMESTAMP
           WHERE beerId = ?`,
          [beerName, price300ml, price500ml, price1000ml, beerId]
        );
        console.log('✅ Configuração de preços atualizada:', beerName);
      } else {
        // Insere nova configuração
        this.executeRun(
          `INSERT INTO sales_config (beerId, beerName, price300ml, price500ml, price1000ml)
           VALUES (?, ?, ?, ?, ?)`,
          [beerId, beerName, price300ml, price500ml, price1000ml]
        );
        console.log('✅ Configuração de preços criada:', beerName);
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
      this.executeRun('DELETE FROM sales_config WHERE beerId = ?', [beerId]);
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
  public getTotalRevenue(startDate?: Date, endDate?: Date): number {
    if (!this.db) {
      return 0;
    }

    try {
      let sql = `
        SELECT
          SUM(
            CASE
              WHEN s.cupSize = 300 THEN s.quantity * COALESCE(sc.price300ml, 0)
              WHEN s.cupSize = 500 THEN s.quantity * COALESCE(sc.price500ml, 0)
              WHEN s.cupSize = 1000 THEN s.quantity * COALESCE(sc.price1000ml, 0)
              ELSE 0
            END
          ) as totalRevenue
        FROM sales s
        LEFT JOIN sales_config sc ON s.beerId = sc.beerId
      `;

      const params: any[] = [];

      // Aplicar filtros de data se houver
      if (startDate && endDate) {
        sql += ' WHERE s.timestamp BETWEEN ? AND ?';
        params.push(startDate.toISOString(), endDate.toISOString());
      }

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
    const query = 'SELECT * FROM comandas ORDER BY numero ASC';
    return this.executeQuery(query);
  }

  /**
   * Busca comandas por status
   * @param status Status da comanda (disponivel, em_uso, aguardando_pagamento)
   * @returns Array de comandas com o status especificado
   */
  public getComandasByStatus(status: string): any[] {
    const query = 'SELECT * FROM comandas WHERE status = ? ORDER BY numero ASC';
    return this.executeQuery(query, [status]);
  }

  /**
   * Busca comanda por número
   * @param numero Número da comanda
   * @returns Comanda ou null se não encontrada
   */
  public getComandaByNumero(numero: number): any | null {
    const query = 'SELECT * FROM comandas WHERE numero = ? LIMIT 1';
    const result = this.executeQuery(query, [numero]);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Busca comanda por ID
   * @param id ID da comanda
   * @returns Comanda ou null se não encontrada
   */
  public getComandaById(id: number): any | null {
    const query = 'SELECT * FROM comandas WHERE id = ? LIMIT 1';
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
      `UPDATE comandas
       SET status = ?, openedAt = ?, updatedAt = ?
       WHERE numero = ? AND status = ?`,
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
      `UPDATE comandas
       SET status = ?, closedAt = ?, totalValue = ?, updatedAt = ?
       WHERE id = ?`,
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
      `UPDATE comandas
       SET status = ?, paidAt = ?, totalValue = 0, openedAt = NULL, closedAt = NULL, updatedAt = ?
       WHERE id = ?`,
      ['disponivel', now, now, comandaId]
    );

    // Remover vínculo das vendas desta comanda (vendas ficam no histórico)
    this.executeRun(
      'UPDATE sales SET comandaId = NULL WHERE comandaId = ?',
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
            WHEN s.cupSize = 300 THEN s.quantity * COALESCE(sc.price300ml, 0)
            WHEN s.cupSize = 500 THEN s.quantity * COALESCE(sc.price500ml, 0)
            WHEN s.cupSize = 1000 THEN s.quantity * COALESCE(sc.price1000ml, 0)
            ELSE 0
          END
        ), 0) as total
      FROM sales s
      LEFT JOIN sales_config sc ON s.beerId = sc.beerId
      WHERE s.comandaId = ?
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
        s.id as saleId,
        s.beerId,
        s.beerName,
        s.cupSize,
        s.quantity,
        s.timestamp,
        CASE
          WHEN s.cupSize = 300 THEN COALESCE(sc.price300ml, 0)
          WHEN s.cupSize = 500 THEN COALESCE(sc.price500ml, 0)
          WHEN s.cupSize = 1000 THEN COALESCE(sc.price1000ml, 0)
          ELSE 0
        END as unitPrice,
        CASE
          WHEN s.cupSize = 300 THEN s.quantity * COALESCE(sc.price300ml, 0)
          WHEN s.cupSize = 500 THEN s.quantity * COALESCE(sc.price500ml, 0)
          WHEN s.cupSize = 1000 THEN s.quantity * COALESCE(sc.price1000ml, 0)
          ELSE 0
        END as totalPrice
      FROM sales s
      LEFT JOIN sales_config sc ON s.beerId = sc.beerId
      WHERE s.comandaId = ?
      ORDER BY s.timestamp DESC
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

    return {
      ...comanda,
      items
    };
  }
}
