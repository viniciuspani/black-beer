# ✅ FASE 4: Correções Críticas - EM ANDAMENTO

**Data:** 2026-01-13
**Status:** 🔧 Parcialmente Implementado
**Objetivo:** Corrigir erros críticos de compilação TypeScript

---

## 🎯 OBJETIVO

Corrigir os ~75 erros de compilação TypeScript causados pela substituição do database.ts, focando em:
1. Adicionar `await` onde necessário
2. Adicionar métodos faltantes
3. Corrigir assinaturas de métodos

---

## ✅ CORREÇÕES IMPLEMENTADAS

### **1. DatabaseService - Métodos Adicionados**

#### ✅ `eventHasSales(eventId): Promise<boolean>`
```typescript
async eventHasSales(eventId: number): Promise<boolean> {
  if (!this.isBrowser || !this.db) {
    return false;
  }

  try {
    const count = await this.db.sales.where('eventId').equals(eventId).count();
    return count > 0;
  } catch (error) {
    console.error('❌ Erro ao verificar vendas do evento:', error);
    return false;
  }
}
```

**Motivo:** Método estava faltando, causava erro em `event.service.ts`

---

### **2. event.service.ts - Correções de `await`**

#### ✅ `changeEventStatus()` - Linha 322
```typescript
// ❌ ANTES
const success = this.dbService.updateEventStatus(eventId, newStatus);

// ✅ DEPOIS
const success = await this.dbService.updateEventStatus(eventId, newStatus);
```

#### ✅ `deleteEvent()` - Linhas 227, 233
```typescript
// ❌ ANTES
const hasSales = this.dbService.eventHasSales(eventId);
const success = this.dbService.deleteEvent(eventId);

// ✅ DEPOIS
const hasSales = await this.dbService.eventHasSales(eventId);
const success = await this.dbService.deleteEvent(eventId);
```

#### ✅ `getEventStatistics()` - Assinatura + await
```typescript
// ❌ ANTES
public getEventStatistics(eventId: number): {
  totalSales: number;
  totalVolume: number;
  totalRevenue: number;
  salesByBeer: any[];
} {
  return this.dbService.getEventStatistics(eventId);
}

// ✅ DEPOIS
public async getEventStatistics(eventId: number): Promise<{
  totalSales: number;
  totalVolume: number;
  totalRevenue: number;
  salesByBeer: any[];
}> {
  return await this.dbService.getEventStatistics(eventId);
}
```

#### ✅ `eventHasSales()` - Assinatura + await
```typescript
// ❌ ANTES
public eventHasSales(eventId: number): boolean {
  return this.dbService.eventHasSales(eventId);
}

// ✅ DEPOIS
public async eventHasSales(eventId: number): Promise<boolean> {
  return await this.dbService.eventHasSales(eventId);
}
```

#### ✅ `getEventSales()` - Assinatura + await
```typescript
// ❌ ANTES
public getEventSales(eventId: number): any[] {
  return this.dbService.getSalesByEvent(eventId);
}

// ✅ DEPOIS
public async getEventSales(eventId: number): Promise<any[]> {
  return await this.dbService.getSalesByEvent(eventId);
}
```

#### ✅ `canDeleteEvent()` - Assinatura + await
```typescript
// ❌ ANTES
public canDeleteEvent(eventId: number): { canDelete: boolean; reason?: string } {
  const hasSales = this.dbService.eventHasSales(eventId);
  // ...
}

// ✅ DEPOIS
public async canDeleteEvent(eventId: number): Promise<{ canDelete: boolean; reason?: string }> {
  const hasSales = await this.dbService.eventHasSales(eventId);
  // ...
}
```

**Erros resolvidos:** ~6 erros no event.service.ts

---

### **3. sales.service.ts - Correções de `await`**

#### ✅ `getTotalRevenue()` - Assinatura + await + conversão de tipos
```typescript
// ❌ ANTES
public getTotalRevenue(startDate?: Date, endDate?: Date, eventId?: number): number {
  return this.dbService.getTotalRevenue(startDate, endDate, eventId);
}

// ✅ DEPOIS
public async getTotalRevenue(startDate?: Date, endDate?: Date, eventId?: number): Promise<number> {
  // Converter Date para string ISO
  const startStr = startDate?.toISOString();
  const endStr = endDate?.toISOString();

  return await this.dbService.getTotalRevenue(startStr, endStr, eventId);
}
```

**Motivo:** DatabaseService espera strings ISO, não objetos Date

#### ✅ `hasPriceConfiguration()` - Assinatura + await
```typescript
// ❌ ANTES
public hasPriceConfiguration(beerId: number): boolean {
  const config = this.dbService.getSalesConfigByBeerId(beerId);
  return config !== null;
}

// ✅ DEPOIS
public async hasPriceConfiguration(beerId: number): Promise<boolean> {
  const config = await this.dbService.getSalesConfigByBeerId(beerId);
  return config !== null;
}
```

#### ✅ `getUnitPrice()` - Assinatura + await
```typescript
// ❌ ANTES
public getUnitPrice(beerId: number, cupSize: 300 | 500 | 1000): number {
  const config = this.dbService.getSalesConfigByBeerId(beerId);
  // ...
}

// ✅ DEPOIS
public async getUnitPrice(beerId: number, cupSize: 300 | 500 | 1000): Promise<number> {
  const config = await this.dbService.getSalesConfigByBeerId(beerId);
  // ...
}
```

#### ✅ `calculateSaleValue()` - Assinatura + await
```typescript
// ❌ ANTES
public calculateSaleValue(beerId: number, cupSize: 300 | 500 | 1000, quantity: number): number {
  const unitPrice = this.getUnitPrice(beerId, cupSize);
  return unitPrice * quantity;
}

// ✅ DEPOIS
public async calculateSaleValue(beerId: number, cupSize: 300 | 500 | 1000, quantity: number): Promise<number> {
  const unitPrice = await this.getUnitPrice(beerId, cupSize);
  return unitPrice * quantity;
}
```

**Erros resolvidos:** 4 erros no sales.service.ts

---

### **4. sales-form.ts - Correções Completas** ✅

#### ✅ Migração de `loadBeerTypes()` - executeQuery → Dexie
```typescript
// ❌ ANTES
const beers = this.dbService.executeQuery(
  'SELECT * FROM beer_types ORDER BY name'
);

// ✅ DEPOIS
const db = this.dbService.getDatabase();
const beers = await db.beerTypes.orderBy('name').toArray();
```

#### ✅ Migração de `insertSaleIntoDatabase()` - executeRun → Dexie
```typescript
// ❌ ANTES
this.dbService.executeRun(query, [sale.beerId, sale.beerName, ...]);

// ✅ DEPOIS
const db = this.dbService.getDatabase();
await db.sales.add({ beerId: sale.beerId, beerName: sale.beerName, ... });
```

#### ✅ Métodos convertidos para async/Promise:
1. `finalizeSale()` - Adicionado await, convertido forEach → for...of
2. `validateCartStock()` - Adicionado await
3. `updateEventStock()` - Adicionado await
4. `checkStockAlert()` - Adicionado await
5. `incrementCartItem()` - Adicionado await
6. `loadAvailableComandas()` - Adicionado await
7. `openComandaDialog()` - Adicionado await
8. `finalizeWithComanda()` - Adicionado await, convertido forEach → for...of

**Total:** 2 executeQuery/Run migrados + 8 métodos com await = ~35 erros corrigidos

---

### **5. beer-management.ts - Migração Completa** ✅

#### ✅ Métodos migrados de SQL para Dexie:

1. **`loadBeerTypes()`** - Migrado executeQuery → Dexie
```typescript
// ❌ ANTES
const beers = this.dbService.executeQuery('SELECT * FROM beer_types ORDER BY name');

// ✅ DEPOIS
const db = this.dbService.getDatabase();
const beers = await db.beerTypes.orderBy('name').toArray();
```

2. **`handleAddBeer()`** - Migrado executeRun → Dexie
```typescript
// ❌ ANTES
this.dbService.executeRun('INSERT INTO beer_types (...) VALUES (...)', [...]);

// ✅ DEPOIS
const insertedId = await db.beerTypes.add({ name, description, color });
```

3. **`beerNameExists()`** - Migrado executeQuery → Dexie filter
```typescript
// ❌ ANTES
const existing = this.dbService.executeQuery('SELECT id FROM beer_types WHERE LOWER(name) = LOWER(?)', [name]);

// ✅ DEPOIS
const count = await db.beerTypes.filter(beer => beer.name.toLowerCase() === nameLower).count();
```

4. **`handleUpdateBeer()`** - Migrado executeRun → Dexie update
```typescript
// ❌ ANTES
this.dbService.executeRun('UPDATE beer_types SET ... WHERE id = ?', [...]);

// ✅ DEPOIS
await db.beerTypes.update(id, { name, description, color });
```

5. **`handleDeleteBeer()`** - Migrado 2x executeRun → Dexie delete
```typescript
// ❌ ANTES
this.dbService.executeRun('DELETE FROM sales WHERE beerId = ?', [id]);
this.dbService.executeRun('DELETE FROM beer_types WHERE id = ?', [id]);

// ✅ DEPOIS
await db.sales.where('beerId').equals(id).delete();
await db.beerTypes.delete(id);
```

**Total:** 6 executeQuery/Run migrados + 5 métodos convertidos para async = ~8 erros corrigidos

---

### **6. settings-admin.ts - Correção de Tipos e Async** ✅

#### ✅ Interface `DatabaseStats` atualizada
```typescript
// ❌ ANTES (não correspondia ao retorno real)
interface DatabaseStats {
  totalSales: number;
  totalBeerTypes: number;
  hasSettings: boolean;
  dbVersion: number;
}

// ✅ DEPOIS (corresponde a getDatabaseStats())
interface DatabaseStats {
  beerTypes: number;
  sales: number;
  users: number;
  events: number;
  comandas: number;
  totalRecords: number;
}
```

#### ✅ Método `updateDatabaseStats()` - Convertido para async
```typescript
// ❌ ANTES
private updateDatabaseStats(): void {
  try {
    const stats = this.dbService.getDatabaseStats();  // ❌ Faltava await
    this.dbStatsSignal.set(stats);
  } catch (error) {
    console.error('❌ Erro ao atualizar estatísticas:', error);
    this.dbStatsSignal.set({
      totalSales: 0,
      totalBeerTypes: 0,
      hasSettings: false,
      dbVersion: 0
    });
  }
}

// ✅ DEPOIS
private async updateDatabaseStats(): Promise<void> {
  try {
    const stats = await this.dbService.getDatabaseStats();
    this.dbStatsSignal.set(stats);
  } catch (error) {
    console.error('❌ Erro ao atualizar estatísticas:', error);
    this.dbStatsSignal.set({
      beerTypes: 0,
      sales: 0,
      users: 0,
      events: 0,
      comandas: 0,
      totalRecords: 0
    });
  }
}
```

#### ✅ Métodos auxiliares ajustados
```typescript
// getDatabaseStatus() - usa totalRecords ao invés de totalSales
getDatabaseStatus(): string {
  if (!this.dbReady()) {
    return 'Inicializando...';
  }

  const stats = this.dbStats();
  if (stats.totalRecords === 0) {  // ✅ Mudou de totalSales
    return 'Vazio';
  }

  return 'Operacional';
}

// hasDataToClear() - usa totalRecords ao invés de totalSales + hasSettings
hasDataToClear(): boolean {
  const stats = this.dbStats();
  return stats.totalRecords > 0;  // ✅ Simplificado
}

// getDatabaseVersion() - retorna hardcoded
getDatabaseVersion(): number {
  return 2;  // ✅ Versão do schema Dexie
}
```

**Total:** 2 erros corrigidos (tipo de interface + await faltante)

---

### **7. help.ts - Simplificação do getDatabaseVersion()** ✅

#### ✅ Método simplificado - retorna versão hardcoded
```typescript
// ❌ ANTES (tentava acessar propriedade inexistente)
getDatabaseVersion(): number {
  try {
    const stats = this.dbService.getDatabaseStats();
    return stats.dbVersion;  // ❌ Propriedade não existe
  } catch (error) {
    console.error('❌ Erro ao obter versão do banco:', error);
    return 0;
  }
}

// ✅ DEPOIS (retorna versão conhecida)
getDatabaseVersion(): number {
  // Retorna versão do schema Dexie (versão 2)
  return 2;
}
```

**Motivo:** `getDatabaseStats()` não retorna `dbVersion`, então retornamos diretamente a versão do schema Dexie (2).

**Total:** 1 erro corrigido

---

### **8. settings-sales.ts - Migração executeQuery + Wrappers Legacy** ✅

#### ✅ Migração `loadBeerTypes()` - executeQuery → Dexie
```typescript
// ❌ ANTES
private loadBeerTypes(): void {
  try {
    const beers = this.dbService.executeQuery(
      'SELECT * FROM beer_types ORDER BY name'
    );
    // ...
  }
}

// ✅ DEPOIS
private async loadBeerTypes(): Promise<void> {
  try {
    const db = this.dbService.getDatabase();
    if (!db) {
      console.warn('⚠️ Database não disponível');
      return;
    }

    const beers = await db.beerTypes.orderBy('name').toArray();
    // ...
    await this.loadBeerStocks(typedBeers);
    await this.loadBeerPrices(typedBeers);
  }
}
```

#### ✅ Método `loadBeerStocks()` - Convertido para async com Promise.all
```typescript
// ❌ ANTES
private loadBeerStocks(beers: BeerType[]): void {
  try {
    const eventId = this.selectedEventId();
    const stocks: BeerStock[] = beers.map(beer => {
      const eventStock = this.dbService.getEventStockByBeerId(beer.id, eventId);  // ❌ Sem await
      // ...
    });
    this.beerStocks.set(stocks);
  }
}

// ✅ DEPOIS
private async loadBeerStocks(beers: BeerType[]): Promise<void> {
  try {
    const eventId = this.selectedEventId();
    const stocksPromises = beers.map(async beer => {
      const eventStock = await this.dbService.getEventStockByBeerId(beer.id, eventId);
      // ...
    });

    const stocks = await Promise.all(stocksPromises);
    this.beerStocks.set(stocks);
  }
}
```

#### ✅ Método `loadBeerPrices()` - Convertido para async com Promise.all
```typescript
// ❌ ANTES
private loadBeerPrices(beers: BeerType[]): void {
  const prices: BeerPrice[] = beers.map(beer => {
    const salesConfig = this.dbService.getSalesConfigByBeerId(beer.id, eventId);  // ❌ Sem await
    // ...
  });
}

// ✅ DEPOIS
private async loadBeerPrices(beers: BeerType[]): Promise<void> {
  const pricesPromises = beers.map(async beer => {
    const salesConfig = await this.dbService.getSalesConfigByBeerId(beer.id, eventId);
    // ...
  });

  const prices = await Promise.all(pricesPromises);
  this.beerPrices.set(prices);
}
```

#### ✅ Métodos de escrita usando wrappers Legacy

**1. `saveStockForBeer()` - Usa setEventStockLegacy:**
```typescript
// ✅ Usa wrapper Legacy (5 parâmetros)
async saveStockForBeer(stock: BeerStock): Promise<void> {
  try {
    const eventId = this.selectedEventId();
    await this.dbService.setEventStockLegacy(
      stock.beerId,
      stock.beerName,
      stock.quantidadeLitros,
      stock.minLitersAlert,
      eventId
    );
    await this.checkStockAlerts();
  }
}
```

**2. `saveAllStocks()` - Usa for...of com await:**
```typescript
// ✅ Convertido forEach → for...of para await funcionar
async saveAllStocks(): Promise<void> {
  this.isSaving.set(true);

  try {
    const eventId = this.selectedEventId();

    // Usar for...of para await funcionar corretamente
    for (const stock of this.beerStocks()) {
      const hasChanges = /* ... */;

      if (hasChanges) {
        await this.dbService.setEventStockLegacy(
          stock.beerId,
          stock.beerName,
          stock.quantidadeLitros,
          stock.minLitersAlert,
          eventId
        );
        savedCount++;
      }
    }

    await this.checkStockAlerts();
  } finally {
    this.isSaving.set(false);
  }
}
```

**3. `savePriceForBeer()` - Usa setSalesConfigLegacy:**
```typescript
async savePriceForBeer(price: BeerPrice): Promise<void> {
  try {
    const eventId = this.selectedEventId();
    await this.dbService.setSalesConfigLegacy(
      price.beerId,
      price.beerName,
      price.price300ml,
      price.price500ml,
      price.price1000ml,
      eventId
    );
  }
}
```

**4. `saveAllPrices()` - Usa for...of com await:**
```typescript
async saveAllPrices(): Promise<void> {
  this.isSaving.set(true);

  try {
    for (const price of this.beerPrices()) {
      const hasChanges = /* ... */;

      if (hasChanges) {
        await this.dbService.setSalesConfigLegacy(
          price.beerId,
          price.beerName,
          price.price300ml,
          price.price500ml,
          price.price1000ml,
          eventId
        );
        savedCount++;
      }
    }
  } finally {
    this.isSaving.set(false);
  }
}
```

#### ✅ Outros métodos convertidos para async:
- `loadAlertConfig()` - await getStockAlertConfig()
- `checkStockAlerts()` - await getStockAlerts()
- `saveAlertConfig()` - await setStockAlertConfig()
- `resetStockForBeer()` - await removeEventStock()

**Total:** 1 executeQuery migrado + 10 métodos convertidos para async/Promise + 4 métodos usando wrappers Legacy = ~15 erros corrigidos

---

### **9. reports-section.ts - Refatoração de Computed + Async** ✅

#### ✅ Problema identificado
O componente usava um `computed()` signal que chamava métodos assíncronos sem await, o que não é suportado em computed signals.

#### ✅ Solução: Refatorar de computed para signal normal

**ANTES:**
```typescript
protected readonly report = computed<FullReport>(() => {
  this.refreshTrigger();

  if (!this.dbService.isDbReady()) {
    return { /* default */ };
  }

  const start = this.startDate();
  const end = this.endDate();
  const eventId = this.selectedEventId();

  // ❌ Chamada assíncrona sem await dentro de computed
  return this.dbService.getFullReport(
    start ?? undefined,
    end ?? undefined,
    eventId ?? undefined
  );
});
```

**DEPOIS:**
```typescript
// Signal normal ao invés de computed
protected readonly report = signal<FullReport>({
  summary: { totalSales: 0, totalVolumeLiters: 0 },
  salesByCupSize: [],
  salesByBeerType: []
});

// Método async para carregar dados
private async loadReport(): Promise<void> {
  if (!this.dbService.isDbReady()) {
    this.report.set({ /* default */ });
    return;
  }

  const start = this.startDate();
  const end = this.endDate();
  const eventId = this.selectedEventId();

  // ✅ Agora com await
  const reportData = await this.dbService.getFullReport(
    start ?? undefined,
    end ?? undefined,
    eventId ?? undefined
  );

  this.report.set(reportData);
}
```

#### ✅ Métodos convertidos para async e chamam loadReport():
1. `ngOnInit()` - carrega relatório inicial
2. `setPeriod()` - recarrega ao mudar período
3. `setEventFilter()` - recarrega ao mudar evento
4. `applyCustomFilter()` - recarrega ao aplicar filtro custom
5. `clearCustomFilter()` - recarrega ao limpar filtro
6. `refreshData()` - recarrega quando aba é ativada

#### ✅ Método `generateCSV()` convertido para async:
```typescript
// ❌ ANTES
private generateCSV(): File {
  const totalRevenue = this.getTotalRevenue();  // ❌ Sem await
  const salesByEvent = this.dbService.getSalesDetailedByEvent(...);  // ❌ Sem await
  const eventTotals = this.dbService.getEventTotals(...);  // ❌ Sem await
  const salesWithoutEvent = this.dbService.getSalesDetailedWithoutEvent(...);  // ❌ Sem await
}

// ✅ DEPOIS
private async generateCSV(): Promise<File> {
  const totalRevenue = await this.getTotalRevenue();
  const salesByEvent = await this.dbService.getSalesDetailedByEvent(...);
  const eventTotals = await this.dbService.getEventTotals(...);
  const salesWithoutEvent = await this.dbService.getSalesDetailedWithoutEvent(...);
}
```

#### ✅ Métodos que chamam generateCSV() atualizados:
```typescript
// sendReportByEmail() - já era async, só adicionou await
const csvFile = await this.generateCSV();

// downloadCSV() - convertido para async
protected async downloadCSV(): Promise<void> {
  const csvFile = await this.generateCSV();
  // ...
}
```

#### ✅ Método auxiliar convertido:
```typescript
// getTotalRevenue() - convertido para async
protected async getTotalRevenue(): Promise<number> {
  return await this.salesService.getTotalRevenue(...);
}
```

**Total:** 1 computed refatorado + 10 métodos convertidos para async/Promise = ~10 erros corrigidos

---

## ⚠️ CORREÇÕES PENDENTES

### **Componentes que AINDA precisam correção:**

#### **1. settings-section.ts (~4 erros)**
- Chamadas de `executeQuery/Run` - precisam migração
- Chamada de `clearDatabase()` - ✅ já tem wrapper (deve funcionar)

#### **2. settings-user.ts (~4 erros)**
- Chamadas de `executeQuery/Run` - precisam migração

---

### **Componentes corrigidos (10 de 12):**

#### **1. database.ts** ✅ CORRIGIDO
- Adicionado método `eventHasSales()`

#### **2. event.service.ts** ✅ CORRIGIDO
- 6 métodos convertidos para async/Promise
- Adicionados awaits necessários

#### **3. sales.service.ts** ✅ CORRIGIDO
- 4 métodos convertidos para async/Promise

#### **4. comanda.service.ts** ✅ CORRIGIDO
- 9 métodos convertidos para async/Promise

#### **5. sales-form.ts** ✅ CORRIGIDO
- ~35 awaits adicionados
- Métodos migrados de executeQuery/Run

#### **6. beer-management.ts** ✅ CORRIGIDO
- 6 executeQuery/Run migrados
- 5 métodos convertidos para async/Promise

#### **7. settings-admin.ts** ✅ CORRIGIDO
- ~~Tipo incompatível em `getDatabaseStats()`~~
- Interface `DatabaseStats` atualizada para corresponder ao retorno real
- Método `updateDatabaseStats()` convertido para async/Promise
- Adicionado `await` na chamada de `getDatabaseStats()`
- Métodos `getDatabaseStatus()`, `hasDataToClear()` e `getDatabaseVersion()` ajustados

#### **8. help.ts** ✅ CORRIGIDO
- ~~Propriedade `dbVersion` não existe no retorno de `getDatabaseStats()`~~
- Método `getDatabaseVersion()` simplificado para retornar versão hardcoded (2)

#### **9. settings-sales.ts** ✅ CORRIGIDO
- 1 executeQuery migrado para Dexie
- 10 métodos convertidos para async/Promise
- 4 métodos usando wrappers Legacy (setEventStockLegacy, setSalesConfigLegacy)

#### **10. reports-section.ts** ✅ CORRIGIDO
- 1 computed signal refatorado para signal normal + método async
- 10 métodos convertidos para async/Promise
- Todos os métodos de filtro agora recarregam o relatório automaticamente

---

#### **RESUMO: comanda.service.ts** ✅ (já documentado anteriormente)
- Adicionados `await` em todas as 9 chamadas assíncronas
- Todos os métodos convertidos para async/Promise

**Métodos corrigidos:**
```typescript
// Todas as chamadas agora com await
await this.dbService.getComandasByStatus()
await this.dbService.getComandaByNumero()
await this.dbService.openComanda()
await this.dbService.getComandaById()
await this.dbService.getComandaItems()
await this.dbService.closeComanda()
await this.dbService.confirmPayment()
await this.dbService.getComandaWithItems()
await this.dbService.getAllComandas()
```

---

## 📊 PROGRESSO GERAL

| Componente | Erros Originais | Erros Corrigidos | Status |
|------------|-----------------|------------------|--------|
| **database.ts** | 1 | 1 | ✅ |
| **event.service.ts** | 6 | 6 | ✅ |
| **sales.service.ts** | 4 | 4 | ✅ |
| **comanda.service.ts** | 9 | 9 | ✅ |
| **sales-form.ts** | 35 | 35 | ✅ |
| **beer-management.ts** | 8 | 8 | ✅ |
| **settings-admin.ts** | 2 | 2 | ✅ |
| **help.ts** | 1 | 1 | ✅ |
| **settings-sales.ts** | 15 | 15 | ✅ |
| **reports-section.ts** | 10 | 10 | ✅ |
| **settings-section.ts** | 4 | 0 | ❌ |
| **settings-user.ts** | 4 | 0 | ❌ |
| **TOTAL** | **~99** | **~92** | **93%** |

---

## 🎯 PRÓXIMAS AÇÕES RECOMENDADAS

### **Opção A: Correção Completa (RECOMENDADO)**

Continuar corrigindo os erros de forma sistemática:

1. **sales.service.ts** - Terminar correções de await
2. **comanda.service.ts** - Adicionar await
3. **sales-form.ts** - Adicionar ~35 awaits (maior impacto)
4. **settings-sales.ts** - Usar wrappers Legacy + awaits
5. **beer-management.ts** - Migrar executeQuery/Run para Dexie
6. **reports-section.ts** - Awaits + conversão de tipos
7. **settings-*.ts** - Migrar executeQuery/Run
8. **help.ts** - Ajustar tipo Stats

**Estimativa:** 2-3 horas de trabalho

### **Opção B: Build Parcial (RÁPIDO MAS LIMITADO)**

Desabilitar temporariamente os componentes problemáticos:

```typescript
// Em app.routes.ts
{
  path: 'beer-management',
  loadComponent: () => import('./features/placeholder').then(m => m.PlaceholderComponent)
  // component: BeerManagementComponent, // ❌ Desabilitado
}
```

**Vantagens:**
- ✅ Aplicação compila rapidamente
- ✅ Partes funcionais podem ser testadas

**Desvantagens:**
- ❌ Funcionalidades críticas não funcionam
- ❌ Não é solução definitiva

---

## 🔧 COMANDOS ÚTEIS

### **Testar compilação:**
```bash
npx tsc --noEmit --skipLibCheck
```

### **Iniciar servidor:**
```bash
npm start
```

### **Build de produção:**
```bash
npm run build
```

---

## 📝 NOTAS IMPORTANTES

1. **Métodos Legacy:** Os wrappers `setEventStockLegacy()` e `setSalesConfigLegacy()` foram criados para facilitar a transição. Use-os temporariamente onde for mais prático.

2. **executeQuery/Run:** Esses métodos **lançam exceção** em runtime. Componentes que os usam precisam migração obrigatória para funcionar.

3. **Testes:** Cada correção deve ser testada isoladamente se possível. Componentes corrigidos devem ser testados no navegador.

4. **Documentação:** Manter este documento atualizado conforme correções avançam.

---

**Status Final da Fase 4:** 🔧 **EM ANDAMENTO (~93% concluído)**

**Componentes corrigidos:** 10 de 12 (database.ts, event.service.ts, sales.service.ts, comanda.service.ts, sales-form.ts, beer-management.ts, settings-admin.ts, help.ts, settings-sales.ts, reports-section.ts)

**Componentes restantes:** 2 (settings-section.ts, settings-user.ts) - ~8 erros

**Próximo passo:** Migrar settings-section.ts e settings-user.ts (últimos componentes!).
