# 🚀 Guia de Deploy no Netlify - Black Beer App

Este guia contém instruções detalhadas para fazer deploy da aplicação Black Beer no Netlify.

## 📋 Pré-requisitos

- Conta no [Netlify](https://www.netlify.com/)
- Repositório Git (GitHub, GitLab ou Bitbucket)
- Node.js 20+ instalado localmente

## 🔧 Preparação do Projeto

O projeto já está configurado com:

- ✅ `netlify.toml` - Configuração principal do Netlify
- ✅ `.nvmrc` - Versão do Node.js (20)
- ✅ `public/_redirects` - Redirecionamentos para SPA
- ✅ `public/_headers` - Headers HTTP para WASM e assets
- ✅ `scripts/copy-wasm.js` - Script para copiar arquivos WebAssembly

## 📦 Arquivos WebAssembly (sql.js)

O projeto usa **sql.js** que requer arquivos `.wasm`. O script `copy-wasm.js` copia automaticamente:
- `sql-wasm.wasm` - Arquivo WebAssembly do SQLite
- `sql-wasm.js` - Wrapper JavaScript

### Locais de cópia:
1. `src/assets/` - Para desenvolvimento
2. `public/` - Para build de produção

## 🌐 Deploy via Git (Recomendado)

### 1. Commitar e fazer push do código

```bash
git add .
git commit -m "feat: Configuração para deploy no Netlify"
git push origin main
```

### 2. Conectar repositório no Netlify

1. Faça login no [Netlify](https://app.netlify.com/)
2. Clique em **"Add new site"** > **"Import an existing project"**
3. Conecte seu repositório (GitHub/GitLab/Bitbucket)
4. Selecione o repositório `black-beer`

### 3. Configurar Build Settings

O Netlify irá detectar automaticamente as configurações do `netlify.toml`:

- **Build command**: `npm run build:netlify`
- **Publish directory**: `dist/black-beer/browser`
- **Node version**: `20` (via `.nvmrc`)

### 4. Adicionar variáveis de ambiente (se necessário)

Se sua aplicação precisa de variáveis de ambiente:

1. Vá em **Site settings** > **Environment variables**
2. Adicione as variáveis necessárias

### 5. Deploy!

Clique em **"Deploy site"** e aguarde o build completar.

## 🔨 Deploy Manual (via CLI)

### 1. Instalar Netlify CLI

```bash
npm install -g netlify-cli
```

### 2. Login no Netlify

```bash
netlify login
```

### 3. Build local

```bash
npm run build:netlify
```

### 4. Deploy

**Deploy de teste:**
```bash
netlify deploy
```

**Deploy em produção:**
```bash
netlify deploy --prod
```

## ✅ Verificação Pós-Deploy

Após o deploy, verifique:

1. **Roteamento Angular**: Navegue para diferentes rotas (ex: `/login`, `/menu`)
2. **Banco de dados SQLite**: Faça login e verifique se os dados são salvos
3. **WebAssembly**: Abra o DevTools > Network e confirme que `sql-wasm.wasm` é carregado com:
   - Status: `200`
   - Type: `wasm`
   - Content-Type: `application/wasm`

## 🐛 Troubleshooting

### Erro: "Failed to load WASM file"

**Solução**: Verifique se o arquivo `sql-wasm.wasm` está em:
- `dist/black-beer/browser/sql-wasm.wasm` ou
- `dist/black-beer/browser/assets/sql-wasm.wasm`

Execute:
```bash
npm run copy:wasm
npm run build:netlify
```

### Erro: "404 Not Found" em rotas do Angular

**Solução**: O arquivo `_redirects` deve estar em `dist/black-beer/browser/_redirects`.

Verifique se:
1. `public/_redirects` existe
2. `angular.json` inclui `public` nos assets

### Erro: Build timeout

**Solução**: Aumente o timeout no Netlify:
1. Site settings > Build & deploy > Build settings
2. Adicione variável de ambiente: `NETLIFY_BUILD_TIMEOUT=15`

### Erro: MIME type incorreto para WASM

**Solução**: Verifique se o arquivo `_headers` está sendo copiado corretamente.

Em `netlify.toml`, a seção `[[headers]]` deve incluir:
```toml
[[headers]]
  for = "/*.wasm"
  [headers.values]
    Content-Type = "application/wasm"
```

## 📊 Otimizações de Produção

### Service Worker (PWA)

O projeto já está configurado com Service Worker:
- `ngsw-config.json` - Configuração do Angular Service Worker
- Build de produção gera automaticamente o SW

### Bundle Size

Monitore o tamanho do bundle:
```bash
npm run build:netlify
npx source-map-explorer dist/black-beer/browser/**/*.js
```

### Budgets

Os budgets estão configurados em `angular.json`:
- Initial: 1MB (error)
- Component Style: 8kB (error)

## 🔗 Links Úteis

- [Documentação Netlify](https://docs.netlify.com/)
- [Angular Deployment](https://angular.dev/tools/cli/deployment)
- [sql.js Documentation](https://sql.js.org/)

## 📝 Comandos Úteis

```bash
# Build local para produção
npm run build:netlify

# Testar build localmente
npx serve dist/black-beer/browser

# Ver logs do Netlify
netlify logs

# Limpar cache do Netlify
netlify build --clear-cache
```

## 🎯 Checklist Final

Antes de fazer deploy:

- [ ] Código commitado e pushed para o repositório
- [ ] Variáveis de ambiente configuradas (se necessário)
- [ ] Build local funcionando (`npm run build:netlify`)
- [ ] Arquivos `.wasm` copiados corretamente
- [ ] `netlify.toml` presente na raiz do projeto
- [ ] `.nvmrc` com versão correta do Node.js
- [ ] Testes executados com sucesso

---

**Deploy realizado com sucesso?** 🎉 Acesse sua aplicação em: `https://seu-site.netlify.app`
