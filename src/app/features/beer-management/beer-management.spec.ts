import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BeerManagement } from './beer-management';

describe('BeerManagement', () => {
  let component: BeerManagement;
  let fixture: ComponentFixture<BeerManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BeerManagement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BeerManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
