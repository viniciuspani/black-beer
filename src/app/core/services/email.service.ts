import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, filter, map, tap } from 'rxjs/operators';
import { EmailRequest, EmailResponse, SendEmailOptions } from '../models/email.model';

/**
 * Serviço para envio de emails via API externa
 * API Host: https://email-service-api-y7ye.onrender.com
 */
@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private readonly API_BASE_URL = 'https://email-service-api-y7ye.onrender.com';
  private readonly MAX_RECIPIENTS = 10;

  constructor(private http: HttpClient) {}

  /**
   * Envia email com arquivo CSV anexado
   *
   * @param options Opções de envio (recipients, csvFile, onProgress)
   * @returns Observable com a resposta da API
   *
   * @example
   * ```typescript
   * this.emailService.sendEmailWithCSV({
   *   recipients: ['alice@example.com', 'bob@example.com'],
   *   csvFile: csvFileBlob,
   *   onProgress: (progress) => console.log(`Upload: ${progress}%`)
   * }).subscribe({
   *   next: (response) => console.log('Email enviado!', response),
   *   error: (error) => console.error('Erro:', error)
   * });
   * ```
   */
  sendEmailWithCSV(options: SendEmailOptions): Observable<EmailResponse> {
    const { recipients, csvFile, onProgress } = options;

    // Validação de recipients
    if (!recipients || recipients.length === 0) {
      return throwError(() => new Error('É necessário informar pelo menos 1 destinatário.'));
    }

    if (recipients.length > this.MAX_RECIPIENTS) {
      return throwError(() => new Error(`Máximo de ${this.MAX_RECIPIENTS} destinatários permitidos.`));
    }

    // Validação de email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return throwError(() => new Error(`Emails inválidos: ${invalidEmails.join(', ')}`));
    }

    // Validação do arquivo CSV
    if (!csvFile) {
      return throwError(() => new Error('É necessário fornecer um arquivo CSV.'));
    }

    if (!csvFile.name.endsWith('.csv')) {
      return throwError(() => new Error('O arquivo deve ser do tipo CSV (.csv).'));
    }

    // Construir FormData
    const formData = new FormData();
    formData.append('recipients', recipients.join(','));
    formData.append('csvFile', csvFile, csvFile.name);

    // Fazer requisição com progress tracking
    return this.http.post<EmailResponse>(
      `${this.API_BASE_URL}/api/email/send`,
      formData,
      {
        reportProgress: true,
        observe: 'events'
      }
    ).pipe(
      tap((event: HttpEvent<EmailResponse>) => {
        // Tracking do progresso de upload usando tap (side effect)
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const progress = Math.round((100 * event.loaded) / event.total);
          if (onProgress) {
            onProgress(progress);
          }
        }
      }),
      // Filtrar APENAS eventos de Response (type guard para TypeScript)
      filter((event: HttpEvent<EmailResponse>): event is HttpResponse<EmailResponse> =>
        event.type === HttpEventType.Response
      ),
      // Agora temos certeza que é HttpResponse, extrair o body
      map((response: HttpResponse<EmailResponse>) => response.body as EmailResponse),
      catchError(this.handleError)
    );
  }

  /**
   * Valida se um email é válido
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Valida uma lista de emails
   */
  validateRecipients(recipients: string[]): { valid: boolean; invalidEmails: string[] } {
    const invalidEmails = recipients.filter(email => !this.validateEmail(email));
    return {
      valid: invalidEmails.length === 0,
      invalidEmails
    };
  }

  /**
   * Handler de erros HTTP
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Ocorreu um erro ao enviar o email.';

    if (error.error instanceof ErrorEvent) {
      // Erro do lado do cliente
      errorMessage = `Erro: ${error.error.message}`;
    } else {
      // Erro do lado do servidor
      switch (error.status) {
        case 0:
          errorMessage = 'Não foi possível conectar ao servidor de email. Verifique sua conexão.';
          break;
        case 400:
          errorMessage = error.error?.message || 'Requisição inválida.';
          break;
        case 413:
          errorMessage = 'Arquivo CSV muito grande.';
          break;
        case 500:
          errorMessage = 'Erro no servidor de email. Tente novamente mais tarde.';
          break;
        case 503:
          errorMessage = 'Serviço de email temporariamente indisponível.';
          break;
        default:
          errorMessage = error.error?.message || `Erro no servidor: ${error.status}`;
      }
    }

    console.error('Erro no EmailService:', error);
    return throwError(() => new Error(errorMessage));
  }
}
