# 🚀 FASE 2: Substituição do DatabaseService (SQL.js → Dexie.js)

**Status:** 🔄 Em Implementação
**Data Início:** 2026-01-12
**Tempo Estimado:** 4-6 dias

---

## 🎯 **OBJETIVO**

Substituir a implementação interna do `DatabaseService` de SQL.js para Dexie.js, **mantendo 100% compatibilidade com a API atual** para que nenhum componente ou service precise ser alterado.

---

## ✅ **ESTRATÉGIA**

### **Não faremos:**
- ❌ Migração de dados existentes
- ❌ Alteração de componentes
- ❌ Alteração de outros services
- ❌ Mudança de API pública

### **Faremos:**
- ✅ Substituir implementação interna SQL.js → Dexie.js
- ✅ Manter mesma API pública (mesmos métodos e assinaturas)
- ✅ Garantir que aplicação continue funcionando
- ✅ Dados novos serão salvos no Dexie/IndexedDB
- ✅ Remover SQL.js do projeto (economia de ~500KB)

---

## 📋 **ANÁLISE DA API ATUAL**

### **DatabaseService Atual (SQL.js)**

**Arquivo:** `database.ts` (2.164 linhas)
**Backup:** `database.old.ts` ✅

#### **Métodos Públicos (~60 métodos):**

**Inicialização:**
- `isDbReady: Signal<boolean>` - Indica quando DB está pronto

**Beer Types:**
- Não há métodos públicos diretos (usado internamente)

**Sales:**
- Não há métodos públicos diretos (queries complexas)

**Users:**
- `getUsuarios(): any[]` - Lista todos os usuários

**Events:**
- `createEvent(...)` - Cria evento
- `getAllEvents()` - Lista todos eventos
- `getEventsByStatus(status)` - Filtra por status
- `getEventById(id)` - Busca por ID
- `updateEvent(id, data)` - Atualiza evento
- `deleteEvent(id)` - Remove evento
- `getActiveEvents()` - Eventos ativos
- `updateEventStatus(id, status)` - Muda status
- `getEventStatistics(eventId)` - Estatísticas do evento
- `getSalesByEvent(eventId, filters)` - Vendas do evento

**Comandas:**
- `getAllComandas()` - Lista todas
- `getComandasByStatus(status)` - Filtra por status
- `getComandaByNumero(numero)` - Busca por número
- `getComandaById(id)` - Busca por ID
- `openComanda(numero)` - Abre comanda
- `closeComanda(id)` - Fecha comanda
- `confirmPayment(id)` - Confirma pagamento
- `getComandaItems(id)` - Itens da comanda
- `getComandaWithItems(id)` - Comanda com detalhes

**Settings:**
- `getConfiguredEmails()` - Lista emails configurados

**Stock (Event Sale):**
- `getEventStock(eventId?)` - Estoque do evento
- `getEventStockByBeerId(beerId, eventId?)` - Estoque de cerveja específica
- `setEventStock(data)` - Define estoque
- `removeEventStock(beerId, eventId?)` - Remove estoque
- `subtractFromEventStock(beerId, volume, eventId?)` - Subtrai do estoque
- `getStockAlerts(eventId?)` - Alertas de estoque baixo

**Prices (Sales Config):**
- `getSalesConfigByBeerId(beerId, eventId?)` - Preços de cerveja
- `getAllSalesConfig(eventId?)` - Todos os preços
- `setSalesConfig(data)` - Define preços
- `removeSalesConfig(beerId, eventId?)` - Remove preços

**Reports:**
- `getFullReport(startDate?, endDate?, eventId?)` - Relatório completo
- `getTotalRevenue(startDate?, endDate?, eventId?)` - Receita total
- `getSalesDetailedByEvent(eventId, startDate?, endDate?)` - Vendas detalhadas do evento
- `getSalesDetailedWithoutEvent(startDate?, endDate?)` - Vendas sem evento
- `getEventTotals(eventId)` - Totais do evento

**Utilities:**
- `getDatabaseStats()` - Estatísticas gerais
- `getLastInsertId()` - Último ID inserido
- `tableExists(name)` - Verifica se tabela existe
- `columnExists(table, column)` - Verifica se coluna existe

**Stock Alert Config:**
- `getStockAlertConfig()` - Configuração de alertas
- `setStockAlertConfig(minLiters)` - Define limite de alerta

---

## 🔄 **PLANO DE IMPLEMENTAÇÃO**

### **ETAPA 1: Estender DatabaseV2Service** ✅ (Já existe)

Arquivo atual: `database-v2.service.ts`

**Já implementado:**
- ✅ Schema Dexie com 10 tabelas
- ✅ Hooks automáticos
- ✅ SSR-safe
- ✅ Métodos básicos (stats, export, clear)

**Falta implementar (~60 métodos):**
- ❌ Métodos CRUD de cada tabela
- ❌ Queries complexas de relatórios
- ❌ Lógica de negócio específica

---

### **ETAPA 2: Implementar Métodos Faltantes**

#### **2.1 Users** (1 método)
```typescript
getUsuarios(): Promise<User[]>
```

#### **2.2 Events** (10 métodos)
```typescript
createEvent(data): Promise<number>
getAllEvents(): Promise<Event[]>
getEventsByStatus(status): Promise<Event[]>
getEventById(id): Promise<Event | null>
updateEvent(id, data): Promise<void>
deleteEvent(id): Promise<void>
getActiveEvents(): Promise<Event[]>
updateEventStatus(id, status): Promise<void>
getEventStatistics(id): Promise<Stats>
getSalesByEvent(id, filters): Promise<Sale[]>
```

#### **2.3 Comandas** (9 métodos)
```typescript
getAllComandas(): Promise<Comanda[]>
getComandasByStatus(status): Promise<Comanda[]>
getComandaByNumero(numero): Promise<Comanda | null>
getComandaById(id): Promise<Comanda | null>
openComanda(numero): Promise<number>
closeComanda(id): Promise<void>
confirmPayment(id): Promise<void>
getComandaItems(id): Promise<Sale[]>
getComandaWithItems(id): Promise<ComandaWithItems>
```

#### **2.4 Stock Management** (6 métodos)
```typescript
getEventStock(eventId?): Promise<EventSale[]>
getEventStockByBeerId(beerId, eventId?): Promise<EventSale | null>
setEventStock(data): Promise<void>
removeEventStock(beerId, eventId?): Promise<void>
subtractFromEventStock(beerId, volume, eventId?): Promise<void>
getStockAlerts(eventId?): Promise<EventSale[]>
```

#### **2.5 Price Management** (4 métodos)
```typescript
getSalesConfigByBeerId(beerId, eventId?): Promise<SalesConfig | null>
getAllSalesConfig(eventId?): Promise<SalesConfig[]>
setSalesConfig(data): Promise<void>
removeSalesConfig(beerId, eventId?): Promise<void>
```

#### **2.6 Reports** (5 métodos - os mais complexos!)
```typescript
getFullReport(startDate?, endDate?, eventId?): Promise<FullReport>
getTotalRevenue(startDate?, endDate?, eventId?): Promise<number>
getSalesDetailedByEvent(eventId, startDate?, endDate?): Promise<DetailedReport>
getSalesDetailedWithoutEvent(startDate?, endDate?): Promise<DetailedReport>
getEventTotals(eventId): Promise<EventTotals>
```

#### **2.7 Settings & Config** (3 métodos)
```typescript
getConfiguredEmails(): Promise<string[]>
getStockAlertConfig(): Promise<StockAlertConfig>
setStockAlertConfig(minLiters): Promise<void>
```

#### **2.8 Utilities** (3 métodos)
```typescript
getLastInsertId(): number
tableExists(name): Promise<boolean>
columnExists(table, column): Promise<boolean>
```

---

### **ETAPA 3: Substituir database.ts**

1. Renomear `database-v2.service.ts` → `database.service.ts`
2. Atualizar imports em todos os arquivos
3. Testar aplicação

---

### **ETAPA 4: Remover SQL.js**

1. Desinstalar: `npm uninstall sql.js`
2. Remover `assets/sql-wasm.wasm`
3. Limpar imports antigos
4. Testar build

---

## 📊 **PRIORIDADES DE IMPLEMENTAÇÃO**

### **Priority 1: CRÍTICO** (aplicação não funciona sem isso)
1. Events (create, list, update)
2. Comandas (open, close, list)
3. Stock management
4. Price management

### **Priority 2: IMPORTANTE** (features principais)
1. Reports (getFullReport, getTotalRevenue)
2. Sales queries
3. Event statistics

### **Priority 3: NICE TO HAVE** (utilities)
1. Settings/Config
2. Database utilities (tableExists, etc.)

---

## 🧪 **ESTRATÉGIA DE TESTES**

### **Testes Incrementais:**

Após implementar cada grupo de métodos:

1. **Smoke Test:** App carrega sem erros
2. **Feature Test:** Funcionalidade específica funciona
3. **Integration Test:** Funcionalidade interage com outras

### **Checklist de Funcionalidades:**

- [ ] Criar evento
- [ ] Listar eventos
- [ ] Abrir comanda
- [ ] Fechar comanda
- [ ] Registrar venda
- [ ] Visualizar relatórios
- [ ] Gerenciar estoque
- [ ] Configurar preços

---

## 📦 **BENEFÍCIOS ESPERADOS**

### **Performance:**
- ⚡ **10-100x mais rápido** em escritas (assíncrono)
- 🚀 **Startup 10-50x mais rápido** (não precisa carregar DB inteiro)
- 💾 **-60% a -80% uso de RAM** (lazy loading)

### **Tamanho:**
- 📉 **-500KB** de bundle (remover SQL.js)
- 📦 **+20KB** de Dexie (resultado: **-480KB**)

### **Capacidade:**
- 💾 **10x mais espaço** (5-10MB → 50+ MB)
- 📈 **Escala melhor** com muitos dados

### **DX (Developer Experience):**
- ✅ Código mais limpo (async/await vs callbacks)
- ✅ TypeScript nativo
- ✅ Queries mais legíveis
- ✅ SSR-safe desde o início

---

## ⚠️ **RISCOS E MITIGAÇÕES**

### **Risco 1: Queries SQL complexas**
**Mitigação:** Converter para Dexie queries passo a passo, com testes

### **Risco 2: Dados existentes perdidos**
**Mitigação:** Usuário começa com banco vazio (aceitável por você)

### **Risco 3: Bugs não detectados**
**Mitigação:** Manter `database.old.ts` como referência

### **Risco 4: Performance piora**
**Mitigação:** Improvável (Dexie é mais rápido), mas podemos otimizar

---

## 📝 **PRÓXIMOS PASSOS IMEDIATOS**

1. ✅ Backup de `database.ts` → `database.old.ts`
2. 🔄 Estender `database-v2.service.ts` com métodos faltantes
3. ⏳ Testar cada grupo de métodos
4. ⏳ Substituir `database.ts`
5. ⏳ Remover SQL.js

---

## 📚 **REFERÊNCIAS**

- [database.old.ts](database.old.ts) - Implementação SQL.js original
- [database-v2.service.ts](src/app/core/services/database-v2.service.ts) - Implementação Dexie atual
- [Dexie.js Docs](https://dexie.org/)

---

**Status:** Pronto para começar implementação dos métodos! 🚀
