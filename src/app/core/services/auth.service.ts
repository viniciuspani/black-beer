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

  public async listarUsuarios(): Promise<any[]> {
    try {
      // Verifica se o banco está pronto
      if (!this.dbService.isDbReady()) {
        console.warn('⚠️ Banco de dados ainda não está pronto. Aguarde a inicialização.');
        return [];
      }

      const result = await this.dbService.getUsuarios();
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
      if (await this.usernameExists(dto.username)) return { success: false, message: 'Nome de usuário já está em uso' };
      if (await this.emailExists(dto.email)) return { success: false, message: 'Email já está cadastrado' };

      console.log('✅ Dados de registro validados. Criando usuário...');

      const passwordHash = this.hashPassword(dto.password);
      const role: UserRole = dto.role || 'user';

      const db = this.dbService.getDatabase();
      if (!db) {
        return { success: false, message: 'Banco de dados não disponível' };
      }

      const userId = await db.users.add({
        username: dto.username.trim(),
        email: dto.email.trim().toLowerCase(),
        passwordHash: passwordHash,
        role: role,
        createdAt: new Date().toISOString(),
        lastLoginAt: undefined
      });

      console.log('✅ Usuário criado com sucesso. ID:', userId);

      const user = await this.getUserById(userId);
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
    if (!dto.username || dto.username.trim().length === 0) {
      return { valid: false, error: 'Nome de usuário é obrigatório' };
    }
    if (!isValidUsername(dto.username)) {
      return { valid: false, error: 'Nome de usuário inválido (mín. 3 caracteres, apenas letras, números, _ e -)' };
    }
    if (!dto.email || dto.email.trim().length === 0) {
      return { valid: false, error: 'Email é obrigatório' };
    }
    if (!isValidEmail(dto.email)) {
      return { valid: false, error: 'Email inválido' };
    }
    if (!dto.password || dto.password.length === 0) {
      return { valid: false, error: 'Senha é obrigatória' };
    }
    if (!isValidPassword(dto.password)) {
      const error = getPasswordError(dto.password);
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
      const user = await this.findUserByEmailOrUsername(dto.emailOrUsername);
      if (!user) return { success: false, message: 'Usuário ou senha incorretos' };

      const passwordMatch = this.verifyPassword(dto.password, user.passwordHash);
      if (!passwordMatch) return { success: false, message: 'Usuário ou senha incorretos' };

      await this.updateLastLogin(user.id);
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
      console.log('✅ Sessão restaurada:', session.username);
    } catch (error) {
      console.error('❌ Erro ao restaurar sessão:', error);
      this.clearSession();
    }
  }

  // ==================== QUERIES E SUPORTE ====================
  private async usernameExists(username: string): Promise<boolean> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) return false;

      const result = await db.users
        .filter(u => u.username.toLowerCase() === username.trim().toLowerCase())
        .first();
      return !!result;
    } catch (error) {
      console.error('❌ Erro ao verificar username:', error);
      return false;
    }
  }

  private async emailExists(email: string): Promise<boolean> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) return false;

      const result = await db.users
        .filter(u => u.email.toLowerCase() === email.trim().toLowerCase())
        .first();
      return !!result;
    } catch (error) {
      console.error('❌ Erro ao verificar email:', error);
      return false;
    }
  }

  private async getUserById(id: number): Promise<User | null> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) return null;

      const result = await db.users.get(id);
      if (!result) return null;
      return this.mapToUser(result);
    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      return null;
    }
  }

  private async findUserByEmailOrUsername(emailOrUsername: string): Promise<User | null> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) return null;

      const input = emailOrUsername.trim().toLowerCase();
      const result = await db.users
        .filter(u => u.email.toLowerCase() === input || u.username.toLowerCase() === input)
        .first();
      if (!result) return null;
      return this.mapToUser(result);
    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      return null;
    }
  }

  private async updateLastLogin(userId: number): Promise<void> {
    try {
      const db = this.dbService.getDatabase();
      if (!db) return;

      await db.users.update(userId, { lastLoginAt: new Date().toISOString() });
    } catch (error) {
      console.error('❌ Erro ao atualizar último login:', error);
    }
  }

  private mapToUser(row: any): User {
    return {
      id: Number(row.id),
      username: row.username,
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role as UserRole,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
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

  async refreshSession(): Promise<void> {
    const session = this.currentSessionSignal();
    if (!session) return;

    const user = await this.getUserById(session.userId);
    if (!user) {
      this.logout();
      return;
    }

    const newSession = userToSession(user);
    this.setSession(newSession);
    console.log('✅ Sessão renovada');
  }
}
