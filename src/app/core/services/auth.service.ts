// ========================================
// auth.service.ts (versão final corrigida e comentada)
// Compatível com Angular 20 + SSR + PWA
// ========================================

/**
 * Correções aplicadas:
 * - Substituído typeof window por isPlatformBrowser (uso oficial Angular SSR)
 * - Protegido o construtor contra execução no servidor (evita ReferenceError: localStorage is not defined)
 * - Mantidos todos os comentários originais e adicionados comentários de correção
 * - Nenhuma funcionalidade removida; apenas ajustes para SSR-safe
 */

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { DatabaseService } from './database';
import {
  User,
  UserSession,
  CreateUserDto,
  LoginDto,
  LoginResponse,
  UserRole,
  isValidSession,
  isSessionExpired,
  userToSession,
  sanitizeUser,
  isValidEmail,
  isValidUsername,
  isValidPassword,
  getPasswordError,
  USER_CONSTANTS,
  isAdmin
} from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // ==================== INJEÇÃO ====================
  private readonly dbService = inject(DatabaseService);
  private readonly router = inject(Router);

  // ✅ Correção SSR: injetar PLATFORM_ID e usar isPlatformBrowser
  private readonly platformId = inject(PLATFORM_ID);

  // ==================== SIGNALS ====================
  private readonly currentSessionSignal = signal<UserSession | null>(null);

  // ✅ Método SSR-safe para detectar ambiente browser
  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  readonly isAuthenticated = computed(() => {
    const session = this.currentSessionSignal();
    if (!session) return false;
    if (isSessionExpired(session)) {
      this.logout();
      return false;
    }
    return true;
  });

  readonly isAdmin = computed(() => isAdmin(this.currentSessionSignal()));
  readonly currentUser = computed(() => this.currentSessionSignal());

  // ==================== CONSTRUCTOR ====================
  constructor() {
    // ✅ Correção SSR: evita restaurar sessão durante renderização no servidor
    if (this.isBrowser()) {
      this.restoreSession();
    }
  }

  // ==================== REGISTRO (CADASTRO) ====================

  public listarUsuarios(): any[] {
    try {
      // Verifica se o banco está pronto
      if (!this.dbService.isDbReady()) {
        console.warn('⚠️ Banco de dados ainda não está pronto. Aguarde a inicialização.');
        return [];
      }

      const result = this.dbService.getUsuarios();
      console.log('✅ Usuários listados:', result);
      console.log('✅ Total de usuários:', result.length);
      return result;
    } catch (error) {
      console.error('❌ Erro ao listar usuários:', error);
      return [];
    }
  }

  async register(dto: CreateUserDto): Promise<LoginResponse> {
    if (!this.dbService.isDbReady()) {
      return { success: false, message: 'Sistema não está pronto. Aguarde...' };
    }

    console.log('📝 Tentando registrar usuário:', dto);

    const validation = this.validateRegistration(dto);

    if (!validation.valid) {
      return { success: false, message: validation.error! };
    }

    try {
      if (this.usernameExists(dto.desc_username)) return { success: false, message: 'Nome de usuário já está em uso' };
      if (this.emailExists(dto.desc_email)) return { success: false, message: 'Email já está cadastrado' };

      console.log('✅ Dados de registro validados. Criando usuário...');
      console.log('🔐 Verifica usuario...', this.usernameExists(dto.desc_username));
      console.log('🔐 Verifica email...', this.emailExists(dto.desc_email));


      const passwordHash = this.hashPassword(dto.desc_password);
      const role: UserRole = dto.desc_role || 'user';

      var resultado = this.dbService.executeRun('INSERT INTO prd_users (desc_username, desc_email, desc_password_hash, desc_role) VALUES (?, ?, ?, ?)', [
        dto.desc_username.trim(),
        dto.desc_email.trim().toLowerCase(),
        passwordHash,
        role,
      ]);

      console.log('✅ Usuário criado. Resultado:', resultado);
      console.log('✅ Usuário criado com sucesso. ID:', this.dbService.getLastInsertId());

      const userId = this.dbService.getLastInsertId();
      const user = this.getUserById(userId);
      if (!user) return { success: false, message: 'Erro ao buscar usuário criado' };

      const session = userToSession(user);
      this.setSession(session);

      return { success: true, user: sanitizeUser(user), message: 'Cadastro realizado com sucesso!' };
    } catch (error) {
      console.error('❌ Erro ao registrar usuário:', error);
      return { success: false, message: 'Erro ao criar conta. Tente novamente.' };
    }
  }

  private validateRegistration(dto: CreateUserDto): { valid: boolean; error?: string } {
    if (!dto.desc_username || dto.desc_username.trim().length === 0) {
      return { valid: false, error: 'Nome de usuário é obrigatório' };
    }
    if (!isValidUsername(dto.desc_username)) {
      return { valid: false, error: 'Nome de usuário inválido (mín. 3 caracteres, apenas letras, números, _ e -)' };
    }
    if (!dto.desc_email || dto.desc_email.trim().length === 0) {
      return { valid: false, error: 'Email é obrigatório' };
    }
    if (!isValidEmail(dto.desc_email)) {
      return { valid: false, error: 'Email inválido' };
    }
    if (!dto.desc_password || dto.desc_password.length === 0) {
      return { valid: false, error: 'Senha é obrigatória' };
    }
    if (!isValidPassword(dto.desc_password)) {
      const error = getPasswordError(dto.desc_password);
      return { valid: false, error: error || 'Senha inválida' };
    }
    return { valid: true };
  }

  // ==================== LOGIN ====================
  async login(dto: LoginDto): Promise<LoginResponse> {
    if (!this.dbService.isDbReady()) {
      return { success: false, message: 'Sistema não está pronto. Aguarde...' };
    }

    try {
      const user = this.findUserByEmailOrUsername(dto.desc_email_or_username);
      if (!user) return { success: false, message: 'Usuário ou senha incorretos' };

      const passwordMatch = this.verifyPassword(dto.desc_password, user.desc_password_hash);
      if (!passwordMatch) return { success: false, message: 'Usuário ou senha incorretos' };

      this.updateLastLogin(user.num_id);
      const session = userToSession(user);
      this.setSession(session);

      return { success: true, user: sanitizeUser(user), message: 'Login realizado com sucesso!' };
    } catch (error) {
      console.error('❌ Erro ao fazer login:', error);
      return { success: false, message: 'Erro ao fazer login. Tente novamente.' };
    }
  }

  // ==================== LOGOUT ====================
  logout(redirectToLogin: boolean = true): void {
    this.clearSession();
    if (redirectToLogin && this.isBrowser()) {
      this.router.navigate(['/login']);
    }
  }

  // ==================== SESSÃO ====================
  private setSession(session: UserSession): void {
    try {
      if (this.isBrowser()) {
        localStorage.setItem(USER_CONSTANTS.SESSION_STORAGE_KEY, JSON.stringify(session));
      }
      this.currentSessionSignal.set(session);
    } catch (error) {
      console.error('❌ Erro ao salvar sessão:', error);
    }
  }

  private clearSession(): void {
    try {
      if (this.isBrowser()) {
        localStorage.removeItem(USER_CONSTANTS.SESSION_STORAGE_KEY);
      }
      this.currentSessionSignal.set(null);
    } catch (error) {
      console.error('❌ Erro ao limpar sessão:', error);
    }
  }

  private restoreSession(): void {
    // ✅ Protegido contra SSR (não executa em ambiente Node)
    if (!this.isBrowser()) return;

    try {
      const sessionData = localStorage.getItem(USER_CONSTANTS.SESSION_STORAGE_KEY);
      if (!sessionData) return;

      const session = JSON.parse(sessionData);
      if (!isValidSession(session) || isSessionExpired(session)) {
        this.clearSession();
        return;
      }
      this.currentSessionSignal.set(session);
      console.log('✅ Sessão restaurada:', session.desc_username);
    } catch (error) {
      console.error('❌ Erro ao restaurar sessão:', error);
      this.clearSession();
    }
  }

  // ==================== QUERIES E SUPORTE ====================
  private usernameExists(username: string): boolean {
    try {
      const result = this.dbService.executeQuery('SELECT num_id FROM prd_users WHERE LOWER(desc_username) = LOWER(?) LIMIT 1', [username.trim()]);
      return result.length > 0;
    } catch (error) {
      console.error('❌ Erro ao verificar username:', error);
      return false;
    }
  }

  private emailExists(email: string): boolean {
    try {
      const result = this.dbService.executeQuery('SELECT num_id FROM prd_users WHERE LOWER(desc_email) = LOWER(?) LIMIT 1', [email.trim()]);
      return result.length > 0;
    } catch (error) {
      console.error('❌ Erro ao verificar email:', error);
      return false;
    }
  }

  private getUserById(id: number): User | null {
    try {
      const result = this.dbService.executeQuery('SELECT * FROM prd_users WHERE num_id = ? LIMIT 1', [id]);
      if (result.length === 0) return null;
      return this.mapToUser(result[0]);
    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      return null;
    }
  }

  private findUserByEmailOrUsername(emailOrUsername: string): User | null {
    try {
      const input = emailOrUsername.trim().toLowerCase();
      const result = this.dbService.executeQuery('SELECT * FROM prd_users WHERE LOWER(desc_email) = ? OR LOWER(desc_username) = ? LIMIT 1', [input, input]);
      if (result.length === 0) return null;
      return this.mapToUser(result[0]);
    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      return null;
    }
  }

  private updateLastLogin(userId: number): void {
    try {
      this.dbService.executeRun('UPDATE prd_users SET dt_last_login_at = ? WHERE num_id = ?', [new Date().toISOString(), userId]);
    } catch (error) {
      console.error('❌ Erro ao atualizar último login:', error);
    }
  }

  private mapToUser(row: any): User {
    return {
      num_id: Number(row.num_id),
      desc_username: row.desc_username,
      desc_email: row.desc_email,
      desc_password_hash: row.desc_password_hash,
      desc_role: row.desc_role as UserRole,
      dt_created_at: row.dt_created_at,
      dt_last_login_at: row.dt_last_login_at,
    };
  }

  // ==================== HASH (SIMPLIFICADO) ====================
  private hashPassword(password: string): string {
    const salt = 'blackbeer_salt_2025';
    const combined = salt + password + salt;
    return btoa(combined);
  }

  private verifyPassword(password: string, hash: string): boolean {
    const testHash = this.hashPassword(password);
    return testHash === hash;
  }

  // ==================== MÉTODOS PÚBLICOS ====================
  getCurrentUser(): UserSession | null {
    return this.currentUser();
  }

  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  isUserAdmin(): boolean {
    return this.isAdmin();
  }

  refreshSession(): void {
    const session = this.currentSessionSignal();
    if (!session) return;

    const user = this.getUserById(session.num_user_id);
    if (!user) {
      this.logout();
      return;
    }

    const newSession = userToSession(user);
    this.setSession(newSession);
    console.log('✅ Sessão renovada');
  }
}
