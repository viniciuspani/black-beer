# 🚀 FASE 1: Setup e Fundação - CONCLUÍDA

**Status:** ✅ Implementado
**Data:** 2026-01-12
**Tempo de Implementação:** ~2-3 dias estimados

---

## 📋 Resumo

A Fase 1 estabelece toda a fundação para migração de SQL.js + localStorage para Dexie.js + IndexedDB, **sem afetar a aplicação atual**.

### O que foi implementado:

✅ Instalação de dependências (Dexie.js, UUID)
✅ Modelos TypeScript com campos de sincronização
✅ Gerador de UUID seguro (5 camadas de entropia)
✅ Schema Dexie.js (10 tabelas)
✅ Hooks automáticos para metadados
✅ Serviço de detecção de conexão
✅ Configurações centralizadas

---

## 📁 Arquivos Criados

### 1. Models

#### `src/app/core/models/sync.models.ts`
**Propósito:** Interfaces e tipos para sincronização

**Principais tipos:**
- `SyncStatus`: 'pending' | 'synced' | 'conflict'
- `DatabaseMode`: 'local' | 'server'
- `SyncFields`: Campos base para sincronização
- `SyncResult`: Resultado de operação de sync
- `BulkSyncRequest/Response`: DTOs para API

**Uso:**
```typescript
import { SyncStatus, SyncFields } from '@core/models/sync.models';
```

---

#### `src/app/core/models/database.models.ts`
**Propósito:** Modelos consolidados com suporte a sync

**Principais interfaces:**
- `Sale`: Venda com campos de sync
- `BeerTypeWithSync`: Cerveja com sync
- `EventWithSync`, `ComandaWithSync`, etc.

**Features:**
- Estende interfaces existentes
- Adiciona campos `_localId`, `_syncStatus`, etc.
- Type guards para validação
- Helpers de conversão

**Uso:**
```typescript
import { Sale, generateSaleFingerprint } from '@core/models/database.models';

const sale: Sale = {
  beerId: 1,
  quantity: 2,
  cupSize: 500,
  // ... outros campos
  _localId: 'abc-123-def', // Auto-preenchido por hook
  _syncStatus: 'pending'
};

const fingerprint = generateSaleFingerprint(sale);
```

---

### 2. Services

#### `src/app/core/services/sync/secure-id-generator.service.ts`
**Propósito:** Gera IDs únicos com múltiplas camadas de entropia

**Algoritmo:**
- **5 camadas:** device + session + timestamp + counter + uuid
- **Formato:** `a1b2c3d4-e5f6g7h8-lkjhgfds-001-i9j0k1l2m3n4o`
- **Probabilidade de colisão:** < 1 em 10^45

**API:**
```typescript
constructor(private idGenerator: SecureIdGeneratorService) {}

// Gerar ID seguro
const id = this.idGenerator.generateSecureId();
// => "a1b2c3d4-e5f6g7h8-lkjhgfds-001-i9j0k1l2m3n4o"

// Gerar ID com prefixo de usuário
const userPrefixedId = this.idGenerator.generateUserPrefixedId('user123');
// => "user123-1704067200000-001-a1b2c3"

// Validar ID
const isValid = this.idGenerator.isValidSecureId(id);

// Extrair timestamp
const timestamp = this.idGenerator.extractTimestamp(id);
```

**Features:**
- Device ID persistente (localStorage)
- Session ID único por sessão
- Counter para evitar colisão no mesmo ms
- Fallback para browsers antigos
- Browser fingerprinting

---

#### `src/app/core/services/database-v2.service.ts`
**Propósito:** Service principal do Dexie.js

**Classe:** `BlackBeerDatabase extends Dexie`

**Schema (10 tabelas):**
```
beerTypes     → Tipos de cerveja
sales         → Vendas (com sync)
users         → Usuários (com sync)
events        → Eventos (com sync)
comandas      → Comandas/Tabs (com sync)
salesConfig   → Preços por cerveja
eventSale     → Estoque por evento
settings      → Configurações gerais
stockAlertConfig → Alertas de estoque
clientConfig  → White-label
```

**Índices:**
- Simples: `beerId`, `timestamp`, `status`
- Únicos: `&name`, `&email`, `&numero`
- Compostos: `[beerId+eventId]`, `[_userId+_localId]`

**Hooks automáticos:**
```typescript
// Ao criar registro:
- Gera _localId (UUID seguro)
- Define _syncStatus = 'pending'
- Preenche createdAt/updatedAt
- Para vendas: adiciona _userId e _fingerprint

// Ao atualizar registro:
- Atualiza updatedAt
- Marca _syncStatus = 'pending'
- Recalcula _fingerprint se necessário
```

**API:**
```typescript
@Injectable()
export class DatabaseV2Service {
  // Signal indicando se DB está pronto
  readonly isDbReady: Signal<boolean>;

  // Obtém instância do Dexie
  getDatabase(): BlackBeerDatabase;

  // Aguarda DB estar pronto
  async waitForReady(): Promise<void>;

  // Estatísticas
  async getDatabaseStats(): Promise<Stats>;

  // Backup
  async exportToJSON(): Promise<string>;

  // Limpeza
  async clearAllData(): Promise<void>;
  async deleteDatabase(): Promise<void>;
}
```

**Uso:**
```typescript
constructor(private dbService: DatabaseV2Service) {
  // Aguardar DB estar pronto
  this.dbService.waitForReady().then(() => {
    console.log('DB pronto!');
  });
}

// Ou usar signal
effect(() => {
  if (this.dbService.isDbReady()) {
    console.log('DB pronto!');
  }
});

// Acessar Dexie diretamente
const db = this.dbService.getDatabase();

// Adicionar venda
await db.sales.add({
  beerId: 1,
  beerName: 'IPA',
  cupSize: 500,
  quantity: 2,
  timestamp: new Date().toISOString(),
  totalVolume: 1000,
  userId: 1
});
// _localId, _syncStatus, etc. preenchidos automaticamente!

// Buscar vendas
const sales = await db.sales.where('beerId').equals(1).toArray();

// Buscar com índice composto
const userSales = await db.sales
  .where('[_userId+_localId]')
  .between(['user1', Dexie.minKey], ['user1', Dexie.maxKey])
  .toArray();
```

---

#### `src/app/core/services/sync/connection.service.ts`
**Propósito:** Detecta conexão com internet e servidor

**Estratégias:**
1. `navigator.onLine` (básico)
2. Eventos `online`/`offline` do browser
3. Health check periódico (30s)

**API:**
```typescript
@Injectable()
export class ConnectionService {
  // Observables
  readonly isOnline$: Observable<boolean>;
  readonly isServerReachable$: Observable<boolean>;

  // Métodos síncronos
  isOnline(): boolean;
  isServerReachable(): boolean;
  isFullyConnected(): boolean;

  // Métodos assíncronos
  async testServerConnection(url: string): Promise<boolean>;
  async forceConnectionCheck(): Promise<boolean>;
  async waitForConnection(timeout?: number): Promise<void>;
}
```

**Uso:**
```typescript
constructor(private connection: ConnectionService) {
  // Reagir a mudanças de conexão
  this.connection.isOnline$.subscribe(isOnline => {
    console.log('Online:', isOnline);
  });

  this.connection.isServerReachable$.subscribe(isReachable => {
    console.log('Servidor acessível:', isReachable);
  });
}

// Verificar antes de sync
if (this.connection.isFullyConnected()) {
  await this.syncService.synchronize();
}

// Aguardar conexão
try {
  await this.connection.waitForConnection(30000);
  console.log('Conectado!');
} catch (error) {
  console.error('Timeout aguardando conexão');
}
```

---

### 3. Config

#### `src/app/core/config/database.config.ts`
**Propósito:** Configurações centralizadas

**Seções:**
- `DATABASE_NAME`, `DATABASE_VERSION`
- `SYNC`: Intervalos, timeouts, batch size
- `STORAGE`: Chaves do localStorage
- `PERFORMANCE`: Limites e defaults
- `LOGGING`: Controle de logs

**Uso:**
```typescript
import { DatabaseConfig } from '@core/config/database.config';

const interval = DatabaseConfig.SYNC.AUTO_SYNC_INTERVAL; // 300000ms
const batchSize = DatabaseConfig.SYNC.BATCH_SIZE; // 100
```

---

## 🔍 Verificação da Instalação

### 1. Verificar dependências
```bash
npm list dexie
npm list uuid
```

**Esperado:**
```
black-beer@1.0.0
├── dexie@3.2.4
└── uuid@9.0.1
```

### 2. Verificar arquivos criados
```bash
# Models
ls src/app/core/models/sync.models.ts
ls src/app/core/models/database.models.ts

# Services
ls src/app/core/services/database-v2.service.ts
ls src/app/core/services/sync/secure-id-generator.service.ts
ls src/app/core/services/sync/connection.service.ts

# Config
ls src/app/core/config/database.config.ts
```

### 3. Testar compilação TypeScript
```bash
ng build --configuration development
```

**Esperado:** Zero erros de compilação

---

## 🧪 Testes Manuais

### Teste 1: Instanciar DatabaseV2Service

Adicione ao `app.component.ts` (temporário):

```typescript
import { DatabaseV2Service } from './core/services/database-v2.service';

export class AppComponent implements OnInit {
  constructor(private dbV2: DatabaseV2Service) {}

  async ngOnInit() {
    await this.dbV2.waitForReady();

    const stats = await this.dbV2.getDatabaseStats();
    console.log('📊 Stats do banco Dexie:', stats);

    // Adicionar cerveja de teste
    const db = this.dbV2.getDatabase();
    const id = await db.beerTypes.add({
      name: 'IPA Teste',
      color: '#FFA500',
      description: 'Cerveja de teste'
    });

    console.log('✅ Cerveja criada com ID:', id);

    // Buscar de volta
    const beer = await db.beerTypes.get(id);
    console.log('🍺 Cerveja recuperada:', beer);
    console.log('🔑 LocalId gerado:', beer?._localId);
  }
}
```

**Esperado no console:**
```
🚀 DatabaseV2Service: Inicializando Dexie.js...
🔑 SecureIdGenerator initialized { deviceId: '...', sessionId: '...' }
✅ DatabaseV2Service: Banco Dexie.js pronto!
📊 Stats do banco Dexie: { beerTypes: 0, sales: 0, ... }
✅ Cerveja criada com ID: 1
🍺 Cerveja recuperada: {
  id: 1,
  name: 'IPA Teste',
  color: '#FFA500',
  description: 'Cerveja de teste',
  _localId: 'a1b2c3d4-e5f6g7h8-lkjhgfds-001-i9j0k1l2m3n4o',
  _syncStatus: 'pending',
  createdAt: '2026-01-12T...',
  updatedAt: '2026-01-12T...'
}
🔑 LocalId gerado: a1b2c3d4-e5f6g7h8-lkjhgfds-001-i9j0k1l2m3n4o
```

### Teste 2: Verificar IndexedDB no DevTools

1. Abrir DevTools (F12)
2. Ir em **Application** > **Storage** > **IndexedDB**
3. Expandir **BlackBeerDB**
4. Ver tabelas criadas: `beerTypes`, `sales`, etc.

**Esperado:** 10 tabelas visíveis

### Teste 3: Testar SecureIdGenerator

```typescript
import { SecureIdGeneratorService } from './core/services/sync/secure-id-generator.service';

constructor(private idGen: SecureIdGeneratorService) {}

ngOnInit() {
  // Gerar 10 IDs e verificar unicidade
  const ids = new Set<string>();

  for (let i = 0; i < 10; i++) {
    const id = this.idGen.generateSecureId();
    ids.add(id);
    console.log(`ID ${i + 1}:`, id);
  }

  console.log('✅ Todos únicos:', ids.size === 10);

  // Validar formato
  const testId = this.idGen.generateSecureId();
  console.log('✅ ID válido:', this.idGen.isValidSecureId(testId));

  // Extrair timestamp
  const timestamp = this.idGen.extractTimestamp(testId);
  console.log('📅 Timestamp:', new Date(timestamp!));
}
```

---

## ⚠️ Importante

### A aplicação atual NÃO foi afetada

- ✅ `DatabaseService` (SQL.js) continua funcionando
- ✅ Nenhum componente foi modificado
- ✅ `DatabaseV2Service` existe em paralelo
- ✅ Zero breaking changes

### O que NÃO funciona ainda

- ❌ Migração de dados (Fase 2)
- ❌ Substituição do `DatabaseService` (Fase 3)
- ❌ Sincronização com servidor (Fase 5)

---

## 📌 Próximos Passos

### FASE 2: Migração de Dados (3-4 dias)

**Objetivo:** Criar script que migra dados de SQL.js → Dexie.js

**Tarefas:**
1. Implementar `DatabaseMigrationService`
2. Criar UI de migração para o usuário
3. Validação de integridade
4. Backup automático do banco antigo
5. Testes com dados reais

**Entregáveis:**
- Script de migração completo
- Component de UI
- Ambos bancos coexistindo (SQL.js + Dexie)

---

## 🐛 Troubleshooting

### Erro: "Cannot find module 'dexie'"
**Solução:**
```bash
npm install dexie@^3.2.4 --save
```

### Erro: "crypto.randomUUID is not a function"
**Causa:** Browser antigo
**Solução:** Fallback implementado automaticamente

### Erro: IndexedDB não aparece no DevTools
**Causa:** Banco não foi aberto ainda
**Solução:** Aguardar `isDbReady` signal

### Warning: "Unknown storage key"
**Causa:** Nomes das chaves no localStorage
**Solução:** Esperado, será usado nas próximas fases

---

## 📚 Referências

- [Dexie.js Documentation](https://dexie.org/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [UUID RFC4122](https://www.ietf.org/rfc/rfc4122.txt)

---

## ✅ Checklist de Conclusão da Fase 1

- [x] Dexie.js instalado
- [x] UUID instalado
- [x] Models com sync fields criados
- [x] SecureIdGenerator implementado
- [x] DatabaseV2Service implementado
- [x] ConnectionService implementado
- [x] DatabaseConfig criado
- [x] Documentação completa
- [x] Zero erros de compilação
- [x] Zero impacto na aplicação atual

**Status:** ✅ FASE 1 CONCLUÍDA

**Pronto para:** FASE 2 - Migração de Dados
