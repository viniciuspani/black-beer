/**
 * Modelo para requisição de envio de email
 */
export interface EmailRequest {
  recipients: string[];  // Lista de emails (máx. 10)
  csvFile: File;        // Arquivo CSV
}

/**
 * Resposta da API de envio de email
 * A API retorna { message, recipients, filename, filesize } em caso de sucesso
 * ou { error } em caso de falha
 */
export interface EmailResponse {
  // Campos de sucesso
  message?: string;
  recipients?: number;
  filename?: string;
  filesize?: string;

  // Campo de erro
  error?: string;

  // Campos legados (mantidos para compatibilidade)
  success?: boolean;
  data?: {
    emailsSent: number;
    recipients: string[];
  };
}

/**
 * Opções para envio de email
 */
export interface SendEmailOptions {
  recipients: string[];
  csvFile: File;
  onProgress?: (progress: number) => void;
}
