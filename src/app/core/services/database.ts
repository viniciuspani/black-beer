// src/app/core/services/database.service.ts
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import initSqlJs, { type Database } from 'sql.js';
import { BeerType, Sale } from '../models/beer.model';
import { FullReport, SalesSummary, SalesByCupSize, SalesByBeerType } from '../models/report.model';
import { isPlatformBrowser } from '@angular/common';

const DB_STORAGE_KEY = 'black_beer_sqlite_db_v1';
const BEER_TYPES_KEY = 'black_beer_types'; // Usaremos uma tabela agora

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

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeDatabase();
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Importação dinâmica do sql.js
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs({
        locateFile: (file: string) => `assets/${file}` // Caminho relativo à pasta assets
      });

      // Verifica se há um banco de dados salvo no localStorage
      const savedDb = localStorage.getItem(DB_STORAGE_KEY);

      if (savedDb) {
        const dbArray = this.stringToUint8Array(savedDb);
        this.db = new SQL.Database(dbArray);
      } else {
        this.db = new SQL.Database();
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

  // NOVO MÉTODO PARA GERAR RELATÓRIO COMPLETO
  public getFullReport(startDate?: Date, endDate?: Date): FullReport {
    if (!this.db) {
      // Retorna um relatório vazio se o DB não estiver pronto
      return {
        summary: { totalSales: 0, totalVolumeLiters: 0 },
        salesByCupSize: [],
        salesByBeerType: []
      };
    }
  
    // Cláusula WHERE para o filtro de data
    let whereClause = '';
    const params: string[] = [];
    if (startDate) {
      whereClause += ' WHERE timestamp >= ?';
      params.push(startDate.toISOString());
    }
    if (endDate) {
      whereClause += whereClause ? ' AND timestamp <= ?' : ' WHERE timestamp <= ?';
      // Adiciona 1 dia e remove 1 segundo para incluir o dia inteiro
      const endOfDay = new Date(endDate);
      endOfDay.setDate(endOfDay.getDate() + 1);
      endOfDay.setSeconds(endOfDay.getSeconds() - 1);
      params.push(endOfDay.toISOString());
    }
  
    // 1. Query para o resumo geral
    const summaryQuery = `
      SELECT
        COUNT(id) as totalSales,
        SUM(totalVolume) / 1000 as totalVolumeLiters
      FROM sales
      ${whereClause}
    `;
    const summaryResult = this.executeQuery(summaryQuery, params)[0] || { totalSales: 0, totalVolumeLiters: 0 };
    
    // 2. Query para vendas por tamanho de copo
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
  
    // 3. Query para vendas por tipo de cerveja
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
    
    // Retorna o objeto do relatório completo
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
