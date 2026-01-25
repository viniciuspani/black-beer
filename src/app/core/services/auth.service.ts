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
  isAdmin,
  isGestor,
  canManageUsers,
  isUserActive
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
  readonly isGestor = computed(() => isGestor(this.currentSessionSignal()));
  readonly canManageUsers = computed(() => canManageUsers(this.currentSessionSignal()));
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

  /**
   * Registra um novo usuário no sistema
   * @param dto Dados do usuário a ser criado
   * @param autoLogin Se true, faz login automático após criar (padrão: true para auto-registro, false para criação via painel admin)
   */
  async register(dto: CreateUserDto, autoLogin: boolean = true): Promise<LoginResponse> {
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

      const passwordHash = this.hashPassword(dto.desc_password);
      const role: UserRole = dto.desc_role || 'user';

      const emailNormalized = dto.desc_email.trim().toLowerCase();

      this.dbService.executeRun('INSERT INTO prd_users (desc_username, desc_email, desc_password_hash, desc_role, int_user_active) VALUES (?, ?, ?, ?, ?)', [
        dto.desc_username.trim(),
        emailNormalized,
        passwordHash,
        role,
        1  // Novo usuário sempre ativo
      ]);

      // Buscar usuário pelo email (mais confiável que last_insert_rowid)
      const user = this.findUserByEmailOrUsername(emailNormalized);
      if (!user) {
        console.error('❌ Usuário criado mas não encontrado pelo email:', emailNormalized);
        return { success: false, message: 'Erro ao buscar usuário criado' };
      }

      console.log('✅ Usuário criado com sucesso. ID:', user.num_id);

      // Apenas faz login automático se autoLogin for true
      // Quando um admin/gestor cria usuário pelo painel, não deve trocar a sessão
      if (autoLogin) {
        const session = userToSession(user);
        this.setSession(session);
      }

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

      // Verifica se o usuário está ativo
      if (!isUserActive(user)) {
        return { success: false, message: 'Usuário inativo. Entre em contato com o administrador.' };
      }

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
      int_user_active: Number(row.int_user_active ?? 1),
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

  isUserGestor(): boolean {
    return this.isGestor();
  }

  userCanManageUsers(): boolean {
    return this.canManageUsers();
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

  // ==================== GESTÃO DE USUÁRIOS ====================

  /**
   * Ativa ou desativa um usuário
   * @param userId ID do usuário
   * @param active true para ativar, false para desativar
   * @returns true se a operação foi bem-sucedida
   */
  toggleUserActive(userId: number, active: boolean): boolean {
    if (!this.dbService.isDbReady()) {
      console.error('❌ Banco de dados não está pronto');
      return false;
    }

    return this.dbService.toggleUserActive(userId, active);
  }

  /**
   * Retorna lista de usuários (sem senha)
   * Para uso no painel de gestão
   */
  getUsuariosList(): Omit<User, 'desc_password_hash'>[] {
    const usuarios = this.listarUsuarios();
    return usuarios.map((u: any) => ({
      num_id: Number(u.num_id),
      desc_username: u.desc_username,
      desc_email: u.desc_email,
      desc_role: u.desc_role as UserRole,
      int_user_active: Number(u.int_user_active ?? 1),
      dt_created_at: u.dt_created_at,
      dt_last_login_at: u.dt_last_login_at,
    }));
  }

  // ==================== GESTÃO DE EMPRESAS ====================

  /**
   * Retorna lista de todas as empresas
   */
  getEmpresasList(): any[] {
    if (!this.dbService.isDbReady()) {
      console.warn('⚠️ Banco de dados ainda não está pronto.');
      return [];
    }

    try {
      const empresas = this.dbService.getAllEmpresas();
      console.log('✅ Empresas listadas:', empresas.length);
      return empresas;
    } catch (error) {
      console.error('❌ Erro ao listar empresas:', error);
      return [];
    }
  }

  /**
   * Busca empresa por ID
   */
  getEmpresaById(id: number): any | null {
    if (!this.dbService.isDbReady()) {
      return null;
    }

    return this.dbService.getEmpresaById(id);
  }

  /**
   * Cria uma nova empresa
   */
  createEmpresa(empresaData: {
    razaoSocial: string;
    cnpj: string;
    endereco: string;
    cep: string;
    cidade: string;
    estado: string;
    responsavelEmpresa: string;
    gestorEmpresa?: number | null;
  }): { success: boolean; empresaId?: number; message: string } {
    if (!this.dbService.isDbReady()) {
      return { success: false, message: 'Sistema não está pronto. Aguarde...' };
    }

    // Verifica se CNPJ já existe
    const existingEmpresa = this.dbService.getEmpresaByCnpj(empresaData.cnpj);
    if (existingEmpresa) {
      return { success: false, message: 'CNPJ já cadastrado no sistema.' };
    }

    const empresaId = this.dbService.createEmpresa(empresaData);

    if (empresaId) {
      return { success: true, empresaId, message: 'Empresa criada com sucesso!' };
    }

    return { success: false, message: 'Erro ao criar empresa. Tente novamente.' };
  }

  /**
   * Atualiza uma empresa existente
   */
  updateEmpresa(id: number, empresaData: {
    razaoSocial?: string;
    cnpj?: string;
    endereco?: string;
    cep?: string;
    cidade?: string;
    estado?: string;
    responsavelEmpresa?: string;
    gestorEmpresa?: number | null;
    active?: boolean;
  }): { success: boolean; message: string } {
    if (!this.dbService.isDbReady()) {
      return { success: false, message: 'Sistema não está pronto. Aguarde...' };
    }

    // Se estiver atualizando CNPJ, verifica se já existe em outra empresa
    if (empresaData.cnpj) {
      const existingEmpresa = this.dbService.getEmpresaByCnpj(empresaData.cnpj);
      if (existingEmpresa && existingEmpresa.num_id !== id) {
        return { success: false, message: 'CNPJ já cadastrado em outra empresa.' };
      }
    }

    const success = this.dbService.updateEmpresa(id, empresaData);

    if (success) {
      return { success: true, message: 'Empresa atualizada com sucesso!' };
    }

    return { success: false, message: 'Erro ao atualizar empresa. Tente novamente.' };
  }

  /**
   * Ativa ou desativa uma empresa
   */
  toggleEmpresaActive(empresaId: number, active: boolean): boolean {
    if (!this.dbService.isDbReady()) {
      return false;
    }

    return this.dbService.toggleEmpresaActive(empresaId, active);
  }

  /**
   * Deleta uma empresa
   */
  deleteEmpresa(id: number): { success: boolean; message: string } {
    if (!this.dbService.isDbReady()) {
      return { success: false, message: 'Sistema não está pronto. Aguarde...' };
    }

    const success = this.dbService.deleteEmpresa(id);

    if (success) {
      return { success: true, message: 'Empresa excluída com sucesso!' };
    }

    return { success: false, message: 'Erro ao excluir empresa. Tente novamente.' };
  }

  /**
   * Retorna lista de usuários gestores para seleção
   */
  getGestoresList(): any[] {
    if (!this.dbService.isDbReady()) {
      return [];
    }

    return this.dbService.getGestores();
  }
}
