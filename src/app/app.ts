import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { BeerManagementComponent } from './features/beer-management/beer-management';
import { SalesFormComponent } from './features/sales-form/sales-form';
import { ReportsSectionComponent } from "./features/reports-section/reports-section";
import { SettingsSectionComponent } from './features/settings-section/settings-section';
// Importe os componentes que criaremos a seguir
// import { SalesFormComponent } from './features/sales-form/sales-form.component';
// import { ReportsSectionComponent } from './features/reports-section/reports-section.component';
// import { SettingsSectionComponent } from './features/settings-section/settings-section.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TabsModule,
    SalesFormComponent,   
    BeerManagementComponent,
    ReportsSectionComponent,
    SettingsSectionComponent
],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('black-beer');

}
