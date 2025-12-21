/**
 * Script para copiar arquivos WASM do sql.js para o diretório de assets
 * Cross-platform (Windows, Linux, macOS)
 */

const fs = require('fs');
const path = require('path');

// Diretórios
const SOURCE_DIR = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
const TARGET_DIR = path.join(__dirname, '..', 'src', 'assets');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Arquivos a copiar
const FILES_TO_COPY = [
  'sql-wasm.wasm',
  'sql-wasm.js'
];

/**
 * Copia um arquivo de origem para destino
 */
function copyFile(source, target) {
  try {
    // Criar diretório de destino se não existir
    if (!fs.existsSync(path.dirname(target))) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
    }

    // Copiar arquivo
    fs.copyFileSync(source, target);
    console.log(`✅ Copiado: ${path.basename(target)}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao copiar ${path.basename(source)}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('📦 Copiando arquivos WebAssembly do sql.js...\n');

  let successCount = 0;
  let totalFiles = FILES_TO_COPY.length * 2; // assets + public

  // Copiar para src/assets
  console.log('📂 Copiando para src/assets:');
  FILES_TO_COPY.forEach(file => {
    const source = path.join(SOURCE_DIR, file);
    const target = path.join(TARGET_DIR, file);
    if (copyFile(source, target)) successCount++;
  });

  console.log(''); // linha em branco

  // Copiar para public (usado no build)
  console.log('📂 Copiando para public:');
  FILES_TO_COPY.forEach(file => {
    const source = path.join(SOURCE_DIR, file);
    const target = path.join(PUBLIC_DIR, file);
    if (copyFile(source, target)) successCount++;
  });

  console.log(''); // linha em branco
  console.log(`✨ Concluído: ${successCount}/${totalFiles} arquivos copiados com sucesso!`);

  // Retornar erro se alguma cópia falhou
  if (successCount !== totalFiles) {
    process.exit(1);
  }
}

// Executar
main();
