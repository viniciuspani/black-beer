// ========================================
// src/app/core/models/user.model.ts
// Model para usuários do sistema
// ========================================

/**
 * Tipo de papel do usuário no sistema
 * - 'user': Usuário comum (pode ver relatórios, registrar vendas)
 * - 'gestor': Gestor (pode gerenciar usuários, configurações básicas)
 * - 'admin': Administrador (acesso total ao sistema)
 */
export type UserRole = 'user' | 'gestor' | 'admin';

/**
 * Interface do usuário
 * Convenção de nomenclatura:
 * - num_ : Colunas INTEGER e REAL
 * - desc_ : Colunas TEXT (dados gerais)
 * - dt_ : Colunas TEXT com DEFAULT CURRENT_TIMESTAMP
 */
export interface User {
  num_id: number;                    // ID único (auto-increment)
  desc_username: string;             // Nome de usuário (único)
  desc_email: string;                // Email (único)
  desc_password_hash: string;        // Senha com hash (nunca armazenar senha pura!)
  desc_role: UserRole;               // Papel do usuário (user ou admin)
  int_user_active: number;           // Status do usuário (0=inativo, 1=ativo)
  dt_created_at: string;             // Data de criação (ISO string)
  dt_last_login_at?: string;         // Última vez que fez login (opcional)
}

/**
 * DTO para criar novo usuário
 * Usado no cadastro - não inclui ID nem datas
 */
export interface CreateUserDto {
  desc_username: string;
  desc_email: string;
  desc_password: string;         // Senha em texto (será convertida em hash)
  desc_role?: UserRole;          // Opcional - padrão é 'user'
}

/**
 * DTO para login
 * Apenas email/username e senha
 */
export interface LoginDto {
  desc_email_or_username: string;  // Pode usar email OU username
  desc_password: string;
}

/**
 * DTO para resposta de login
 * Retorna usuário sem senha
 */
export interface LoginResponse {
  success: boolean;
  user?: Omit<User, 'desc_password_hash'>;  // Usuário SEM senha
  message?: string;                         // Mensagem de erro/sucesso
}

/**
 * Sessão do usuário (armazenada no localStorage)
 */
export interface UserSession {
  num_user_id: number;
  desc_username: string;
  desc_email: string;
  desc_role: UserRole;
  dt_login_at: string;           // Quando fez login
  dt_expires_at: string;         // Quando expira
}

// ========================================
// HELPERS / UTILITÁRIOS
// ========================================

/**
 * Verifica se um usuário é administrador
 */
export function isAdmin(user: User | UserSession | null | undefined): boolean {
  return user?.desc_role === 'admin';
}

/**
 * Verifica se um usuário é gestor
 */
export function isGestor(user: User | UserSession | null | undefined): boolean {
  return user?.desc_role === 'gestor';
}

/**
 * Verifica se um usuário é gestor ou admin (pode gerenciar usuários)
 */
export function canManageUsers(user: User | UserSession | null | undefined): boolean {
  return user?.desc_role === 'admin' || user?.desc_role === 'gestor';
}

/**
 * Verifica se um usuário é comum
 */
export function isUser(user: User | UserSession | null | undefined): boolean {
  return user?.desc_role === 'user';
}

/**
 * Type guard para validar User
 */
export function isValidUser(obj: any): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.num_id === 'number' &&
    typeof obj.desc_username === 'string' &&
    typeof obj.desc_email === 'string' &&
    typeof obj.desc_password_hash === 'string' &&
    (obj.desc_role === 'user' || obj.desc_role === 'gestor' || obj.desc_role === 'admin') &&
    typeof obj.int_user_active === 'number' &&
    typeof obj.dt_created_at === 'string'
  );
}

/**
 * Verifica se um usuário está ativo
 */
export function isUserActive(user: User | null | undefined): boolean {
  return user?.int_user_active === 1;
}

/**
 * Type guard para validar UserSession
 */
export function isValidSession(obj: any): obj is UserSession {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.num_user_id === 'number' &&
    typeof obj.desc_username === 'string' &&
    typeof obj.desc_email === 'string' &&
    (obj.desc_role === 'user' || obj.desc_role === 'gestor' || obj.desc_role === 'admin') &&
    typeof obj.dt_login_at === 'string'
  );
}

/**
 * Remove campos sensíveis do usuário
 * (Remove desc_password_hash antes de enviar para o frontend)
 */
export function sanitizeUser(user: User): Omit<User, 'desc_password_hash'> {
  const { desc_password_hash, ...sanitized } = user;
  return sanitized;
}

/**
 * Converte User em UserSession
 * Usado após login bem-sucedido
 */
export function userToSession(user: User, expiresInHours: number = 24): UserSession {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

  return {
    num_user_id: user.num_id,
    desc_username: user.desc_username,
    desc_email: user.desc_email,
    desc_role: user.desc_role,
    dt_login_at: now.toISOString(),
    dt_expires_at: expiresAt.toISOString()
  };
}

/**
 * Verifica se uma sessão expirou
 */
export function isSessionExpired(session: UserSession): boolean {
  if (!session.dt_expires_at) return false;  // Sem expiração = nunca expira

  const now = new Date();
  const expiresAt = new Date(session.dt_expires_at);

  return now > expiresAt;
}

/**
 * Valida formato de email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valida formato de username
 * - Mínimo 3 caracteres
 * - Apenas letras, números, underscore e hífen
 */
export function isValidUsername(username: string): boolean {
  if (username.length < 3) return false;
  
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  return usernameRegex.test(username);
}

/**
 * Valida força da senha
 * - Mínimo 6 caracteres
 * - Pelo menos 1 letra e 1 número (opcional, pode ajustar)
 */
export function isValidPassword(password: string): boolean {
  if (password.length < 6) return false;
  
  // Opcional: exigir letra E número
  // const hasLetter = /[a-zA-Z]/.test(password);
  // const hasNumber = /[0-9]/.test(password);
  // return hasLetter && hasNumber;
  
  return true;  // Por enquanto, apenas comprimento
}

/**
 * Gera mensagem de erro de validação
 */
export function getPasswordError(password: string): string | null {
  if (password.length < 6) {
    return 'A senha deve ter no mínimo 6 caracteres';
  }
  
  // Se adicionar validação de letra+número:
  // if (!/[a-zA-Z]/.test(password)) {
  //   return 'A senha deve conter pelo menos uma letra';
  // }
  // if (!/[0-9]/.test(password)) {
  //   return 'A senha deve conter pelo menos um número';
  // }
  
  return null;
}

/**
 * Constantes do sistema
 */
export const USER_CONSTANTS = {
  MIN_PASSWORD_LENGTH: 6,
  MIN_USERNAME_LENGTH: 3,
  SESSION_DURATION_HOURS: 24,
  SESSION_STORAGE_KEY: 'blackbeer_session'
} as const;