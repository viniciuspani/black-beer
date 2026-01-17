/**
 * Modelos e tipos para sincronização de dados
 * Sistema: Black Beer - Gestão de Vendas
 * Versão: 1.0.0
 */

/**
 * Status de sincronização de um registro
 */
export type SyncStatus = 'pending' | 'synced' | 'conflict';

/**
 * Modo de operação do banco de dados
 */
export type DatabaseMode = 'local' | 'server';

/**
 * Campos base para sincronização
 * Adicionar a interfaces de modelos que precisam sync
 */
export interface SyncFields {
  _localId?: string;           // UUID único gerado localmente
  _userId?: string;            // ID do usuário que criou/modificou
  _syncStatus?: SyncStatus;    // Status de sincronização
  _serverCompositeKey?: string; // Chave composta retornada pelo servidor
  _version?: number;           // Versão para conflict resolution
  _fingerprint?: string;       // Hash do conteúdo (detectar duplicatas)
  createdAt?: string;          // ISO timestamp de criação
  updatedAt?: string;          // ISO timestamp de última atualização
}

/**
 * Resultado de uma operação de sincronização
 */
export interface SyncResult {
  success: boolean;
  pushedCount: number;         // Registros enviados ao servidor
  pulledCount: number;         // Registros recebidos do servidor
  conflictCount?: number;      // Conflitos detectados
  duration: number;            // Tempo em ms
  timestamp: string;           // Timestamp da sincronização
  errors?: string[];           // Erros encontrados
}

/**
 * Item de resultado de sincronização individual
 */
export interface SyncResultItem {
  userId: string;
  localSaleId: string;
  success: boolean;
  conflict?: boolean;
  version?: number;
  message?: string;
  warning?: string;
  serverGeneratedId?: string;  // Novo ID em caso de colisão
}

/**
 * Request de sincronização em lote
 */
export interface BulkSyncRequest<T = any> {
  sales?: T[];
  events?: T[];
  comandas?: T[];
  // Expandir conforme necessário
}

/**
 * Response de sincronização em lote
 */
export interface BulkSyncResponse {
  results: SyncResultItem[];
  timestamp?: string;
}

/**
 * Resposta do servidor com dados atualizados
 */
export interface ServerSyncData<T = any> {
  sales?: T[];
  events?: T[];
  comandas?: T[];
  timestamp: string;
  count?: number;
}

/**
 * Resposta do endpoint pull
 */
export interface PullResponse<T = any> {
  sales?: T[];
  events?: T[];
  comandas?: T[];
  count: number;
  timestamp: string;
}

/**
 * Mapeamento de IDs local → servidor
 */
export interface IdMapping {
  localId: number | string;
  serverId: number | string;
  version?: number;
}

/**
 * Configurações da aplicação incluindo modo de DB
 */
export interface AppSettings {
  databaseMode: DatabaseMode;
  serverUrl: string;
  autoSync: boolean;
  syncIntervalMs?: number;
  lastSyncTimestamp?: string;
  userId?: string;
}

/**
 * Estatísticas de sincronização
 */
export interface SyncStats {
  totalPending: number;
  lastSyncTime: string | null;
  syncInProgress: boolean;
  failedSyncs: number;
}

/**
 * Log de operação de sincronização
 */
export interface SyncLogEntry {
  id?: number;
  timestamp: string;
  direction: 'push' | 'pull' | 'bidirectional';
  status: 'success' | 'failure' | 'partial';
  recordCount: number;
  duration: number;
  error?: string;
}

/**
 * Operação pendente na fila de sincronização
 */
export interface SyncOperation {
  id?: number;
  operation: 'create' | 'update' | 'delete';
  table: string;
  localId: number | string;
  data: any;
  timestamp: string;
  retryCount: number;
  error?: string;
  maxRetries?: number;
}
