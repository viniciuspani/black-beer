/**
 * Modelo para configurações do cliente (white-label)
 * Armazena informações personalizáveis como logo da empresa
 */
export interface ClientConfig {
  /**
   * ID único da configuração (sempre 1 para single-tenant)
   */
  id: number;

  /**
   * Nome da empresa cliente
   */
  companyName?: string;

  /**
   * Logo da empresa em formato base64
   * Formato: data:image/jpeg;base64,<string>
   */
  logoBase64?: string;

  /**
   * Tipo MIME da imagem
   * Exemplos: 'image/jpeg', 'image/png', 'image/svg+xml'
   */
  logoMimeType?: string;

  /**
   * Nome original do arquivo da logo
   */
  logoFileName?: string;

  /**
   * Timestamp da última atualização
   */
  updatedAt: Date;
}
