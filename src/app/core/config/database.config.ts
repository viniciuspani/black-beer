/**
 * Configurações do banco de dados
 * Sistema: Black Beer - Gestão de Vendas
 */

export const DatabaseConfig = {
  /**
   * Nome do banco IndexedDB
   */
  DATABASE_NAME: 'BlackBeerDB',

  /**
   * Versão atual do schema
   */
  DATABASE_VERSION: 10,

  /**
   * Configurações de sincronização
   */
  SYNC: {
    /**
     * Intervalo padrão entre sincronizações automáticas (ms)
     */
    AUTO_SYNC_INTERVAL: 300000, // 5 minutos

    /**
     * Timeout para operações de sincronização (ms)
     */
    SYNC_TIMEOUT: 30000, // 30 segundos

    /**
     * Número máximo de tentativas em caso de falha
     */
    MAX_RETRIES: 3,

    /**
     * Tamanho do lote para sincronização em massa
     */
    BATCH_SIZE: 100,

    /**
     * Ativar sincronização automática por padrão
     */
    AUTO_SYNC_ENABLED: false, // Desabilitado até Fase 5
  },

  /**
   * Configurações de storage local
   */
  STORAGE: {
    /**
     * Chaves do localStorage
     */
    KEYS: {
      DEVICE_ID: '_black_beer_device_id',
      USER_ID: '_black_beer_user_id',
      DATABASE_MODE: '_black_beer_db_mode',
      LAST_SYNC: '_black_beer_last_sync',
      MIGRATED: '_black_beer_migrated_to_dexie',
      SERVER_URL: '_black_beer_server_url',
      AUTO_SYNC_ENABLED: '_black_beer_auto_sync',
    },
  },

  /**
   * Configurações de performance
   */
  PERFORMANCE: {
    /**
     * Tamanho máximo de resultados em queries sem paginação
     */
    MAX_QUERY_RESULTS: 10000,

    /**
     * Tamanho padrão de página para queries paginadas
     */
    DEFAULT_PAGE_SIZE: 100,

    /**
     * Limite de transações simultâneas
     */
    MAX_CONCURRENT_TRANSACTIONS: 5,
  },

  /**
   * Configurações de logs
   */
  LOGGING: {
    /**
     * Ativar logs detalhados
     */
    VERBOSE: true,

    /**
     * Logar operações de sincronização
     */
    LOG_SYNC: true,

    /**
     * Logar queries (útil para debug)
     */
    LOG_QUERIES: false,
  },
} as const;

/**
 * Type-safe access para configurações
 */
export type DatabaseConfigType = typeof DatabaseConfig;
