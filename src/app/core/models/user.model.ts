// ========================================
// src/app/core/models/user.model.ts
// Model para usuários do sistema
// ========================================

/**
 * Tipo de papel do usuário no sistema
 * - 'user': Usuário comum (pode ver relatórios, registrar vendas)
 * - 'admin': Administrador (acesso total ao sistema)
 */
export type UserRole = 'user' | 'admin';

/**
 * Interface do usuário
 * Representa um usuário cadastrado no sistema
 */
export interface User {
  id: number;                    // ID único (auto-increment)
  username: string;              // Nome de usuário (único)
  email: string;                 // Email (único)
  passwordHash: string;          // Senha com hash (nunca armazenar senha pura!)
  role: UserRole;                // Papel do usuário (user ou admin)
  createdAt: string;             // Data de criação (ISO string)
  lastLoginAt?: string;          // Última vez que fez login (opcional)
}

/**
 * DTO para criar novo usuário
 * Usado no cadastro - não inclui ID nem datas
 */
export interface CreateUserDto {
  username: string;
  email: string;
  password: string;              // Senha em texto (será convertida em hash)
  role?: UserRole;               // Opcional - padrão é 'user'
}

/**
 * DTO para login
 * Apenas email/username e senha
 */
export interface LoginDto {
  emailOrUsername: string;       // Pode usar email OU username
  password: string;
}

/**
 * DTO para resposta de login
 * Retorna usuário sem senha
 */
export interface LoginResponse {
  success: boolean;
  user?: Omit<User, 'passwordHash'>;  // Usuário SEM senha
  message?: string;              // Mensagem de erro/sucesso
}

/**
 * Sessão do usuário (armazenada no localStorage)
 */
export interface UserSession {
  userId: number;
  username: string;
  email: string;
  role: UserRole;
  loginAt: string;               // Quando fez login
  expiresAt: string;             // Quando expira (opcional)
}

// ========================================
// HELPERS / UTILITÁRIOS
// ========================================

/**
 * Verifica se um usuário é administrador
 */
export function isAdmin(user: User | UserSession | null | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * Verifica se um usuário é comum
 */
export function isUser(user: User | UserSession | null | undefined): boolean {
  return user?.role === 'user';
}

/**
 * Type guard para validar User
 */
export function isValidUser(obj: any): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'number' &&
    typeof obj.username === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.passwordHash === 'string' &&
    (obj.role === 'user' || obj.role === 'admin') &&
    typeof obj.createdAt === 'string'
  );
}

/**
 * Type guard para validar UserSession
 */
export function isValidSession(obj: any): obj is UserSession {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.userId === 'number' &&
    typeof obj.username === 'string' &&
    typeof obj.email === 'string' &&
    (obj.role === 'user' || obj.role === 'admin') &&
    typeof obj.loginAt === 'string'
  );
}

/**
 * Remove campos sensíveis do usuário
 * (Remove passwordHash antes de enviar para o frontend)
 */
export function sanitizeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash, ...sanitized } = user;
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
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    loginAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * Verifica se uma sessão expirou
 */
export function isSessionExpired(session: UserSession): boolean {
  if (!session.expiresAt) return false;  // Sem expiração = nunca expira
  
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  
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