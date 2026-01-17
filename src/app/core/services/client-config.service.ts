import { Injectable, inject, signal, effect } from '@angular/core';
import { DatabaseService } from './database';
import { ClientConfig } from '../models/client-config.model';

/**
 * Service para gerenciar configurações do cliente (white-label)
 * Permite upload, leitura e exclusão de logo da empresa
 */
@Injectable({
  providedIn: 'root'
})
export class ClientConfigService {
  private db = inject(DatabaseService);

  /**
   * Configuração atual do cliente em signal (reativo)
   */
  private clientConfigSignal = signal<ClientConfig | null>(null);

  /**
   * Signal público read-only para acesso à configuração
   */
  public readonly clientConfig = this.clientConfigSignal.asReadonly();

  /**
   * ID fixo para single-tenant
   */
  private readonly CONFIG_ID = 1;

  constructor() {
    // Aguarda o banco estar pronto antes de carregar
    effect(() => {
      if (this.db.isDbReady()) {
        void this.loadConfig();
      }
    });
  }

  /**
   * Carrega a configuração do IndexedDB
   */
  private async loadConfig(): Promise<void> {
    try {
      const config = await this.getConfig();
      this.clientConfigSignal.set(config);
    } catch (error) {
      console.error('Erro ao carregar configuração do cliente:', error);
      this.clientConfigSignal.set(null);
    }
  }

  /**
   * Obtém a configuração do cliente do IndexedDB
   */
  async getConfig(): Promise<ClientConfig | null> {
    try {
      const database = this.db.getDatabase();
      if (!database) return null;

      const row = await database.clientConfig.get(this.CONFIG_ID);

      if (!row) {
        return null;
      }

      return {
        id: Number(row.id),
        companyName: row.companyName || undefined,
        logoBase64: row.logoBase64 || undefined,
        logoMimeType: row.logoMimeType || undefined,
        logoFileName: row.logoFileName || undefined,
        updatedAt: new Date(row.updatedAt)
      };
    } catch (error) {
      console.error('Erro ao buscar configuração:', error);
      return null;
    }
  }

  /**
   * Salva ou atualiza a logo da empresa
   * @param file Arquivo de imagem (JPEG, PNG, SVG)
   * @param companyName Nome da empresa (opcional)
   */
  async uploadLogo(file: File, companyName?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Validação de tipo de arquivo
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
      if (!validTypes.includes(file.type)) {
        reject(new Error('Formato de arquivo inválido. Use JPEG, PNG ou SVG.'));
        return;
      }

      // Validação de tamanho (máximo 2MB)
      const maxSize = 2 * 1024 * 1024; // 2MB
      if (file.size > maxSize) {
        reject(new Error('Arquivo muito grande. Tamanho máximo: 2MB.'));
        return;
      }

      // Converte imagem para base64
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const base64 = e.target?.result as string;

          const config: ClientConfig = {
            id: this.CONFIG_ID,
            companyName: companyName,
            logoBase64: base64,
            logoMimeType: file.type,
            logoFileName: file.name,
            updatedAt: new Date()
          };

          await this.saveConfig(config);
          this.clientConfigSignal.set(config);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Erro ao ler arquivo.'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Salva a configuração no IndexedDB
   */
  private async saveConfig(config: ClientConfig): Promise<void> {
    try {
      const database = this.db.getDatabase();
      if (!database) {
        throw new Error('Database não disponível');
      }

      const exists = await database.clientConfig.get(this.CONFIG_ID);

      if (exists) {
        // UPDATE
        await database.clientConfig.update(this.CONFIG_ID, {
          companyName: config.companyName || undefined,
          logoBase64: config.logoBase64 || undefined,
          logoMimeType: config.logoMimeType || undefined,
          logoFileName: config.logoFileName || undefined,
          updatedAt: config.updatedAt.toISOString()
        });
      } else {
        // INSERT
        await database.clientConfig.add({
          id: this.CONFIG_ID,
          companyName: config.companyName || undefined,
          logoBase64: config.logoBase64 || undefined,
          logoMimeType: config.logoMimeType || undefined,
          logoFileName: config.logoFileName || undefined,
          updatedAt: config.updatedAt.toISOString()
        });
      }
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      throw error;
    }
  }

  /**
   * Remove a logo da empresa
   */
  async removeLogo(): Promise<void> {
    try {
      const currentConfig = await this.getConfig();

      if (currentConfig) {
        const updatedConfig: ClientConfig = {
          ...currentConfig,
          logoBase64: undefined,
          logoMimeType: undefined,
          logoFileName: undefined,
          updatedAt: new Date()
        };

        await this.saveConfig(updatedConfig);
        this.clientConfigSignal.set(updatedConfig);
      }
    } catch (error) {
      console.error('Erro ao remover logo:', error);
      throw error;
    }
  }

  /**
   * Atualiza o nome da empresa
   */
  async updateCompanyName(companyName: string): Promise<void> {
    try {
      const currentConfig = await this.getConfig();

      const updatedConfig: ClientConfig = {
        id: this.CONFIG_ID,
        companyName,
        logoBase64: currentConfig?.logoBase64,
        logoMimeType: currentConfig?.logoMimeType,
        logoFileName: currentConfig?.logoFileName,
        updatedAt: new Date()
      };

      await this.saveConfig(updatedConfig);
      this.clientConfigSignal.set(updatedConfig);
    } catch (error) {
      console.error('Erro ao atualizar nome da empresa:', error);
      throw error;
    }
  }

  /**
   * Obtém a URL da logo (data URL)
   */
  getLogoUrl(): string | null {
    const config = this.clientConfigSignal();
    return config?.logoBase64 || null;
  }

  /**
   * Verifica se existe uma logo configurada
   */
  hasLogo(): boolean {
    const config = this.clientConfigSignal();
    return !!config?.logoBase64;
  }

  /**
   * Obtém o nome da empresa
   */
  getCompanyName(): string | null {
    const config = this.clientConfigSignal();
    return config?.companyName || null;
  }
}

