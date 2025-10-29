import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportsSection } from './reports-section';

describe('ReportsSection', () => {
  let component: ReportsSection;
  let fixture: ComponentFixture<ReportsSection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsSection]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportsSection);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
