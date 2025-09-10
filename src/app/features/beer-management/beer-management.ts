// src/app/features/beer-management/beer-management.component.ts
import { Component, OnInit, inject, signal, WritableSignal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

// PrimeNG Modules
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { ColorPickerModule } from 'primeng/colorpicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';


// App Services and Models

import { BeerType } from '../../core/models/beer.model';
import { DatabaseService } from '../../core/services/database';

@Component({
  selector: 'app-beer-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    ColorPickerModule,
    TableModule,
    TagModule,
    ConfirmDialogModule,
    ToastModule
  ],
  providers: [ConfirmationService, MessageService], // Serviços do PrimeNG para diálogo e mensagens
  templateUrl: './beer-management.html',
  styleUrls: ['./beer-management.scss']
})
export class BeerManagementComponent implements OnInit {
  // Injeção de dependências moderna com inject()
  private dbService = inject(DatabaseService);
  private fb = inject(FormBuilder);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  // Gerenciamento de estado reativo com Signals
  beerTypes: WritableSignal<BeerType[]> = signal([]);
  isAdding = signal(false);
  beerForm: FormGroup;

  // IDs das cervejas padrão que não podem ser excluídas
  private defaultBeerIds = ['ipa', 'weiss', 'porter', 'pilsen'];

  constructor() {
    // Inicialização do formulário reativo
    this.beerForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      color: ['#D4A574', Validators.required]
    });

    // Efeito para recarregar as cervejas quando o DB estiver pronto
    effect(() => {
      if (this.dbService.isDbReady()) {
        this.loadBeerTypes();
      }
    });
  }

  ngOnInit(): void {
    if (this.dbService.isDbReady()) {
      this.loadBeerTypes();
    }
  }

  loadBeerTypes(): void {
    const beers = this.dbService.executeQuery('SELECT * FROM beer_types ORDER BY name');
    this.beerTypes.set(beers);
  }

  toggleAddForm(): void {
    this.isAdding.update(value => !value);
    this.beerForm.reset({ color: '#D4A574' });
  }

  isDefaultBeer(beerId: string): boolean {
    return this.defaultBeerIds.includes(beerId);
  }

  handleAddBeer(): void {
    if (this.beerForm.invalid) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Por favor, preencha todos os campos obrigatórios.' });
      return;
    }

    const formValue = this.beerForm.value;
    const newBeer: BeerType = {
      id: formValue.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      name: formValue.name,
      description: formValue.description || `Cerveja ${formValue.name}`,
      color: formValue.color
    };

    // Verifica se já existe uma cerveja com o mesmo ID
    const existing = this.dbService.executeQuery('SELECT id FROM beer_types WHERE id = ?', [newBeer.id]);
    if (existing.length > 0) {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Uma cerveja com este nome já existe.' });
      return;
    }

    try {
      this.dbService.executeRun(
        'INSERT INTO beer_types (id, name, description, color) VALUES (?, ?, ?, ?)',
        [newBeer.id, newBeer.name, newBeer.description, newBeer.color]
      );
      this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: `${newBeer.name} adicionada com sucesso!` });
      this.loadBeerTypes();
      this.toggleAddForm();
    } catch (error) {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível adicionar a cerveja.' });
      console.error("Erro ao adicionar cerveja:", error);
    }
  }

  confirmDelete(beer: BeerType): void {
    if (this.isDefaultBeer(beer.id)) return;

    this.confirmationService.confirm({
      message: `Você tem certeza que deseja remover a cerveja "${beer.name}"?`,
      header: 'Confirmação de Exclusão',
      icon: 'pi pi-info-circle',
      acceptLabel: 'Sim, remover',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.handleDeleteBeer(beer);
      }
    });
  }

  private handleDeleteBeer(beer: BeerType): void {
    try {
      this.dbService.executeRun('DELETE FROM sales WHERE beerId = ?', [beer.id]);
      this.dbService.executeRun('DELETE FROM beer_types WHERE id = ?', [beer.id]);
      this.messageService.add({ severity: 'success', summary: 'Sucesso', detail: `${beer.name} foi removida.` });
      this.loadBeerTypes();
    } catch (error) {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Não foi possível remover a cerveja.' });
      console.error("Erro ao remover cerveja:", error);
    }
  }
}
