/**
 * Modelo para configurações do cliente (white-label)
 * Armazena informações personalizáveis como logo da empresa
 *
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 * - dt_ : Colunas TEXT com DEFAULT CURRENT_TIMESTAMP
 */
export interface ClientConfig {
  /**
   * ID único da configuração (sempre 1 para single-tenant)
   */
  num_id: number;

  /**
   * Nome da empresa cliente
   */
  desc_company_name?: string;

  /**
   * Logo da empresa em formato base64
   * Formato: data:image/jpeg;base64,<string>
   */
  desc_logo_base64?: string;

  /**
   * Tipo MIME da imagem
   * Exemplos: 'image/jpeg', 'image/png', 'image/svg+xml'
   */
  desc_logo_mime_type?: string;

  /**
   * Nome original do arquivo da logo
   */
  desc_logo_file_name?: string;

  /**
   * Timestamp da última atualização
   */
  dt_updated_at: Date;
}
