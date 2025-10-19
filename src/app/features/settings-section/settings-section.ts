// src/app/features/settings-section/settings-section.component.ts
import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';

// App

import { AppSettings } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

@Component({
  selector: 'app-settings-section',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    TagModule
  ],
  providers: [MessageService],
  templateUrl: './settings-section.html',
  styleUrls: ['./settings-section.scss']
})
export class SettingsSectionComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  settingsForm: FormGroup;
  isEmailConfigured = signal(false);

  constructor() {
    this.settingsForm = this.fb.group({
      email: ['', [Validators.email]]
    });

    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadSettings();
      }
    });
  }

  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadSettings();
    }
  }

  loadSettings(): void {
    const emailSetting = this.dbService.executeQuery("SELECT value FROM settings WHERE key = 'emailSettings'")[0];
    if (emailSetting && emailSetting.value) {
      const parsedSettings = JSON.parse(emailSetting.value);
      this.settingsForm.patchValue({ email: parsedSettings.email });
      this.isEmailConfigured.set(parsedSettings.isConfigured);
    }
  }

  saveSettings(): void {
    if (this.settingsForm.invalid) {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Por favor, insira um e-mail válido.' });
      return;
    }

    const email = this.settingsForm.value.email;
    const emailSettings = {
      email: email,
      isConfigured: !!email && this.settingsForm.get('email')?.valid
    };

    try {
      this.dbService.executeRun(
        `INSERT INTO settings (key, value) VALUES ('emailSettings', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [JSON.stringify(emailSettings)]
      );
      
      this.isEmailConfigured.set(true);
      this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: 'Configurações salvas com sucesso!' });
    } catch (error) {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível salvar as configurações.' });
      console.error("Erro ao salvar configurações:", error);
    }
  }
}