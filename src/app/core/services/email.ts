// ========================================
// src/app/core/services/email.service.ts
// ========================================

import { Injectable, inject } from '@angular/core';
import { DatabaseService } from './database';
import { FullReport } from '../models/report.model';
import { emailsFromDb, toBooleanFromDb } from '../models/beer.model';

/**
 * Serviço responsável por enviar relatórios por email
 * 
 * IMPORTANTE: Como este é um PWA offline, o "envio" é simulado:
 * - Gera o arquivo CSV do relatório
 * - Baixa localmente no dispositivo do usuário
 * - Mostra os emails configurados para envio manual
 * 
 * Para envio real de email, seria necessário:
 * - Backend com API (Node.js, Python, etc)
 * - Serviço de email (SendGrid, AWS SES, etc)
 * - Conexão com internet
 * 
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private readonly dbService = inject(DatabaseService);

  /**
   * Obtém os emails configurados no sistema
   * @returns Array de emails configurados
   */
  getConfiguredEmails(): string[] {
    try {
      const result = this.dbService.executeQuery(
        'SELECT desc_email, num_is_configured FROM config_settings LIMIT 1'
      );

      if (result && result.length > 0) {
        const row = result[0];
        const isConfigured = toBooleanFromDb(row.num_is_configured);

        if (isConfigured && row.desc_email) {
          const emails = emailsFromDb(row.desc_email);
          return emails;
        }
      }

      return [];
    } catch (error) {
      console.error('❌ Erro ao obter emails configurados:', error);
      return [];
    }
  }

  /**
   * Verifica se há emails configurados no sistema
   * @returns true se há pelo menos 1 email configurado
   */
  hasConfiguredEmails(): boolean {
    return this.getConfiguredEmails().length > 0;
  }

  /**
   * Gera o conteúdo CSV do relatório
   * @param report Dados do relatório completo
   * @param dateRange Informação sobre o período do relatório
   * @returns String com conteúdo CSV formatado
   */
  private generateCSVContent(report: FullReport, dateRange?: string): string {
    const lines: string[] = [];
    
    // Header do arquivo
    lines.push('# RELATÓRIO DE VENDAS - BLACK BEER');
    lines.push(`# Gerado em: ${new Date().toLocaleString('pt-BR')}`);
    if (dateRange) {
      lines.push(`# Período: ${dateRange}`);
    }
    lines.push('');
    
    // ========== SEÇÃO 1: RESUMO GERAL ==========
    lines.push('# RESUMO GERAL');
    lines.push('Total de Vendas,' + report.summary.num_total_sales);
    lines.push('Volume Total (Litros),' + report.summary.num_total_volume_liters.toFixed(2));
    lines.push('');
    
    // ========== SEÇÃO 2: VENDAS POR TAMANHO ==========
    lines.push('# VENDAS POR TAMANHO');
    lines.push('Tamanho,Quantidade');
    
    if (report.salesByCupSize.length > 0) {
      report.salesByCupSize.forEach(item => {
        lines.push(`${item.num_cup_size}ml,${item.num_count}`);
      });
    } else {
      lines.push('Nenhuma venda registrada,0');
    }
    lines.push('');
    
    // ========== SEÇÃO 3: VENDAS POR TIPO DE CERVEJA ==========
    lines.push('# VENDAS POR TIPO DE CERVEJA');
    lines.push('Nome,Litros,Copos');
    
    if (report.salesByBeerType.length > 0) {
      report.salesByBeerType.forEach(item => {
        lines.push(`${item.desc_name},${item.num_total_liters.toFixed(2)},${item.num_total_cups}`);
      });
    } else {
      lines.push('Nenhuma venda registrada,0.00,0');
    }
    
    return lines.join('\n');
  }

  /**
   * Gera o nome do arquivo CSV com data e hora
   * Formato: relatorio-vendas-YYYY-MM-DD_HH-mm.csv
   * @returns Nome do arquivo
   */
  private generateFileName(): string {
    const now = new Date();
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `relatorio-vendas-${year}-${month}-${day}_${hours}-${minutes}.csv`;
  }

  /**
   * Cria e baixa o arquivo CSV no navegador
   * @param content Conteúdo do CSV
   * @param filename Nome do arquivo
   */
  private downloadCSV(content: string, filename: string): void {
    // Adiciona BOM para compatibilidade com Excel
    const BOM = '\uFEFF';
    const csvContent = BOM + content;
    
    // Cria blob com encoding UTF-8
    const blob = new Blob([csvContent], { 
      type: 'text/csv;charset=utf-8;' 
    });
    
    // Cria URL temporária
    const url = window.URL.createObjectURL(blob);
    
    // Cria link de download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    // Adiciona ao DOM, clica e remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Libera memória
    window.URL.revokeObjectURL(url);
    
    console.log('✅ Arquivo CSV baixado:', filename);
  }

  /**
   * Envia o relatório por email (simulado)
   * 
   * FLUXO:
   * 1. Verifica se há emails configurados
   * 2. Gera conteúdo CSV
   * 3. Baixa arquivo localmente
   * 4. Retorna lista de emails para envio manual
   * 
   * @param report Dados do relatório completo
   * @param dateRange Descrição do período (opcional)
   * @returns Objeto com status e informações
   */
  async sendReport(
    report: FullReport, 
    dateRange?: string
  ): Promise<{
    success: boolean;
    emails: string[];
    filename: string;
    message: string;
  }> {
    try {
      // 1. Verifica emails configurados
      const emails = this.getConfiguredEmails();
      
      if (emails.length === 0) {
        return {
          success: false,
          emails: [],
          filename: '',
          message: 'Nenhum email configurado. Configure emails nas configurações.'
        };
      }
      
      // 2. Gera conteúdo CSV
      const csvContent = this.generateCSVContent(report, dateRange);
      
      // 3. Gera nome do arquivo
      const filename = this.generateFileName();
      
      // 4. Baixa arquivo
      this.downloadCSV(csvContent, filename);
      
      // 5. Simula delay de "envio"
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 6. Retorna sucesso
      const emailList = emails.join(', ');
      const message = emails.length === 1
        ? `Relatório gerado! Envie manualmente para: ${emailList}`
        : `Relatório gerado! Envie manualmente para os ${emails.length} emails configurados: ${emailList}`;
      
      return {
        success: true,
        emails,
        filename,
        message
      };
      
    } catch (error) {
      console.error('❌ Erro ao enviar relatório:', error);
      return {
        success: false,
        emails: [],
        filename: '',
        message: 'Erro ao gerar relatório. Tente novamente.'
      };
    }
  }

  /**
   * Valida se o relatório tem dados suficientes para envio
   * @param report Relatório a ser validado
   * @returns true se o relatório é válido
   */
  isReportValid(report: FullReport | null): boolean {
    if (!report) return false;
    
    // Verifica se há pelo menos uma venda
    return report.summary.num_total_sales > 0;
  }

  /**
   * Retorna mensagem de status dos emails configurados
   * Útil para exibir no componente
   * @returns String com status
   */
  getEmailsStatusMessage(): string {
    const emails = this.getConfiguredEmails();
    
    if (emails.length === 0) {
      return 'Nenhum email configurado';
    }
    
    if (emails.length === 1) {
      return `1 email configurado: ${emails[0]}`;
    }
    
    return `${emails.length} emails configurados`;
  }

  /**
   * Formata a lista de emails para exibição
   * @param maxLength Número máximo de emails a exibir (default: 3)
   * @returns String formatada
   */
  getFormattedEmailsList(maxLength: number = 3): string {
    const emails = this.getConfiguredEmails();
    
    if (emails.length === 0) {
      return 'Nenhum email';
    }
    
    if (emails.length <= maxLength) {
      return emails.join(', ');
    }
    
    const visible = emails.slice(0, maxLength);
    const remaining = emails.length - maxLength;
    
    return `${visible.join(', ')} e mais ${remaining}`;
  }
}


// ========================================
// TESTES UNITÁRIOS (OPCIONAL)
// src/app/core/services/email.service.spec.ts
// ========================================

/**
 * Exemplo de testes unitários para o EmailService
 * 
 * import { TestBed } from '@angular/core/testing';
 * import { EmailService } from './email.service';
 * 
 * describe('EmailService', () => {
 *   let service: EmailService;
 * 
 *   beforeEach(() => {
 *     TestBed.configureTestingModule({});
 *     service = TestBed.inject(EmailService);
 *   });
 * 
 *   it('should be created', () => {
 *     expect(service).toBeTruthy();
 *   });
 * 
 *   it('should return empty array when no emails configured', () => {
 *     const emails = service.getConfiguredEmails();
 *     expect(emails).toEqual([]);
 *   });
 * 
 *   it('should validate report with sales', () => {
 *     const report = {
 *       summary: { totalSales: 10, totalVolumeLiters: 5 },
 *       salesByCupSize: [],
 *       salesByBeerType: []
 *     };
 *     expect(service.isReportValid(report)).toBe(true);
 *   });
 * 
 *   it('should invalidate report without sales', () => {
 *     const report = {
 *       summary: { totalSales: 0, totalVolumeLiters: 0 },
 *       salesByCupSize: [],
 *       salesByBeerType: []
 *     };
 *     expect(service.isReportValid(report)).toBe(false);
 *   });
 * });
 */