declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: (string | number | null)[]): void;
    exec(sql: string): any;
    prepare(sql: string): any;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsInitConfig {
    locateFile: (file: string) => string;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
    [key: string]: any;
  }

  export default function initSqlJs(config?: SqlJsInitConfig): Promise<SqlJsStatic>;
}
