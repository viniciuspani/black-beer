// src/app/core/services/database.ts
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import initSqlJs, { type Database } from 'sql.js';
import { BeerType, Sale } from '../models/beer.model';
import { FullReport, SalesSummary, SalesByCupSize, SalesByBeerType } from '../models/report.model';
import { isPlatformBrowser } from '@angular/common';

const DB_STORAGE_KEY = 'black_beer_sqlite_db_v2'; // v2 para forçar migração
const DB_VERSION = 2; // Versionamento do schema

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
 * @version 2.0.0
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

      const savedDb = localStorage.getItem(DB_STORAGE_KEY);
      const savedVersion = this.getStoredVersion();

      // Se não há DB salvo OU versão antiga, cria novo
      if (!savedDb || savedVersion < DB_VERSION) {
        console.log('🔄 Criando novo banco de dados (versão 2)...');
        this.createNewDatabase();
      } else {
        // Carrega banco existente
        const dbArray = this.stringToUint8Array(savedDb);
        this.db = new this.SQL.Database(dbArray);
        console.log('✅ Banco de dados carregado (versão 2)');
      }

      this.isDbReady.set(true);
    } catch (err) {
      console.error("❌ Erro na inicialização do banco:", err);
    }
  }

  /**
   * Cria um novo banco de dados do zero com schema v2
   */
  private createNewDatabase(): void {
    this.db = new this.SQL.Database();
    this.createSchemaV2();
    this.seedInitialData();
    this.setStoredVersion(DB_VERSION);
    this.persist();
  }

  /**
   * Cria o schema do banco de dados versão 2
   * 
   * MUDANÇAS PRINCIPAIS:
   * - beer_types.id: TEXT → INTEGER PRIMARY KEY AUTOINCREMENT
   * - sales.id: TEXT → INTEGER PRIMARY KEY AUTOINCREMENT
   * - sales.beerId: TEXT → INTEGER (FK mantida)
   * - settings: nova estrutura (id INTEGER, email TEXT, isConfigured INTEGER)
   * - Tabela de configurações com suporte a múltiplos emails
    * - email: String com emails separados por ; (ex: "a@x.com;b@x.com")
    * - Mínimo: 1 email, Máximo: 10 emails
   */
  private createSchemaV2(): void {
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
        FOREIGN KEY (beerId) REFERENCES beer_types(id) ON DELETE CASCADE
      );

      -- Índice para melhorar performance em queries por data
      CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(timestamp);
      
      -- Índice para melhorar performance em queries por cerveja
      CREATE INDEX IF NOT EXISTS idx_sales_beerId ON sales(beerId);

      -- Tabela de configurações reestruturada
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        isConfigured INTEGER NOT NULL DEFAULT 0 CHECK(isConfigured IN (0, 1))
      );

      -- Tabela de versão do schema
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      );
      
      INSERT INTO db_version (version) VALUES (${DB_VERSION});
    `;

    this.db.exec(schema);
    console.log('✅ Schema v2 criado com sucesso');
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
    const byBeerTypeQuery = `
      SELECT
        bt.id as beerId,
        bt.name,
        bt.color,
        bt.description,
        SUM(s.quantity) as totalCups,
        COALESCE(SUM(s.totalVolume) / 1000.0, 0) as totalLiters
      FROM sales s
      INNER JOIN beer_types bt ON s.beerId = bt.id
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
        totalLiters: Number(item.totalLiters)
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
}