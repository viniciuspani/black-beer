/**
 * Modelo para requisição de envio de email
 */
export interface EmailRequest {
  recipients: string[];  // Lista de emails (máx. 10)
  csvFile: File;        // Arquivo CSV
}

/**
 * Resposta da API de envio de email
 */
export interface EmailResponse {
  success: boolean;
  message: string;
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
