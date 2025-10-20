// src/app/core/services/database.service.ts
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import initSqlJs, { type Database } from 'sql.js';
import { BeerType, Sale } from '../models/beer.model';
import { FullReport, SalesSummary, SalesByCupSize, SalesByBeerType } from '../models/report.model';
import { isPlatformBrowser } from '@angular/common';

const DB_STORAGE_KEY = 'black_beer_sqlite_db_v1';
const BEER_TYPES_KEY = 'black_beer_types';

declare global {
  interface Window {
    initSqlJs: any;
  }
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  private db: Database | null = null;
  public isDbReady = signal<boolean>(false);
  private platformId = inject(PLATFORM_ID);
  private SQL: any = null; // Armazena a instância do SQL.js para reutilização

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeDatabase();
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Importação dinâmica do sql.js
      const initSqlJs = (await import('sql.js')).default;
      this.SQL = await initSqlJs({
        locateFile: (file: string) => `assets/${file}`
      });

      // Verifica se há um banco de dados salvo no localStorage
      const savedDb = localStorage.getItem(DB_STORAGE_KEY);

      if (savedDb) {
        const dbArray = this.stringToUint8Array(savedDb);
        this.db = new this.SQL.Database(dbArray);
      } else {
        this.db = new this.SQL.Database();
        this.createSchema();
        this.seedInitialData();
      }
      this.isDbReady.set(true);
    } catch (err) {
      console.error("Database initialization error:", err);
    }
  }

  private createSchema(): void {
    if (!this.db) return;
    const schema = `
      CREATE TABLE beer_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        description TEXT
      );
      CREATE TABLE sales (
        id TEXT PRIMARY KEY,
        beerId TEXT NOT NULL,
        beerName TEXT NOT NULL,
        cupSize INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        totalVolume REAL NOT NULL,
        FOREIGN KEY (beerId) REFERENCES beer_types (id)
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `;
    this.db.exec(schema);
  }

  private seedInitialData(): void {
    const defaultBeers: BeerType[] = [
      { id: 'ipa', name: 'India Pale Ale', color: '#f39c12', description: 'Amarga e aromática.' },
      { id: 'weiss', name: 'Weissbier', color: '#f1c40f', description: 'Leve e frutada.' },
      { id: 'porter', name: 'Porter', color: '#8B4513', description: 'Escura e robusta.' },
      { id: 'pilsen', name: 'Pilsen', color: '#f9e79f', description: 'Clara e refrescante.' }
    ];

    defaultBeers.forEach(beer => {
      this.db?.run('INSERT INTO beer_types VALUES (?, ?, ?, ?)', [beer.id, beer.name, beer.color, beer.description]);
    });
    this.persist();
  }

  // MÉTODOS PÚBLICOS PARA INTERAÇÃO

  public executeQuery(sql: string, params?: (string | number | null)[]): any[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  public executeRun(sql: string, params?: (string | number | null)[]): void {
      if (!this.db) return;
      this.db.run(sql, params);
      this.persist();
  }

  private persist(): void {
    if (!this.db) return;
    const dbArray = this.db.export();
    const dbString = this.uint8ArrayToString(dbArray);
    localStorage.setItem(DB_STORAGE_KEY, dbString);
  }

  // Funções utilitárias
  private uint8ArrayToString = (arr: Uint8Array) => btoa(String.fromCharCode.apply(null, Array.from(arr)));
  private stringToUint8Array = (str: string) => new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));

  /**
   * Limpa completamente o banco de dados e reinicia ao estado inicial
   * Remove todos os dados de vendas e configurações, mantendo apenas os tipos de cerveja padrão
   * @returns Promise<void>
   */
  public async clearDatabase(): Promise<void> {
    try {
      if (!this.db || !this.SQL) {
        throw new Error('Banco de dados não está inicializado');
      }

      // Fecha o banco de dados atual
      this.db.close();
      
      // Remove o banco do localStorage
      localStorage.removeItem(DB_STORAGE_KEY);
      
      // Cria um novo banco de dados limpo
      this.db = new this.SQL.Database();
      
      // Recria o schema
      this.createSchema();
      
      // Adiciona os dados iniciais
      this.seedInitialData();
      
      // Persiste o novo banco
      this.persist();
      
      console.log('✅ Banco de dados limpo com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao limpar banco de dados:', error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas do banco de dados para exibição
   * @returns Objeto com contadores de registros
   */
  public getDatabaseStats(): { totalSales: number; totalBeerTypes: number; hasSettings: boolean } {
    if (!this.db) {
      return { totalSales: 0, totalBeerTypes: 0, hasSettings: false };
    }

    try {
      const salesCount = this.executeQuery('SELECT COUNT(*) as count FROM sales')[0]?.count || 0;
      const beerTypesCount = this.executeQuery('SELECT COUNT(*) as count FROM beer_types')[0]?.count || 0;
      const settingsCount = this.executeQuery('SELECT COUNT(*) as count FROM settings')[0]?.count || 0;

      return {
        totalSales: Number(salesCount),
        totalBeerTypes: Number(beerTypesCount),
        hasSettings: Number(settingsCount) > 0
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas do banco:', error);
      return { totalSales: 0, totalBeerTypes: 0, hasSettings: false };
    }
  }

  // MÉTODO PARA GERAR RELATÓRIO COMPLETO
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
  
    const summaryQuery = `
      SELECT
        COUNT(id) as totalSales,
        SUM(totalVolume) / 1000 as totalVolumeLiters
      FROM sales
      ${whereClause}
    `;
    const summaryResult = this.executeQuery(summaryQuery, params)[0] || { totalSales: 0, totalVolumeLiters: 0 };
    
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
  
    const byBeerTypeQuery = `
      SELECT
        bt.id as beerId,
        bt.name,
        bt.color,
        bt.description,
        SUM(s.quantity) as totalCups,
        SUM(s.totalVolume) / 1000 as totalLiters
      FROM sales s
      JOIN beer_types bt ON s.beerId = bt.id
      ${whereClause}
      GROUP BY bt.id, bt.name, bt.color, bt.description
      ORDER BY totalLiters DESC
    `;
    const salesByBeerType = this.executeQuery(byBeerTypeQuery, params);
    
    return {
      summary: {
        totalSales: summaryResult.totalSales || 0,
        totalVolumeLiters: summaryResult.totalVolumeLiters || 0,
      },
      salesByCupSize,
      salesByBeerType
    };
  }
}