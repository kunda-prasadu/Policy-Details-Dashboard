/**
 * @fileoverview Unit tests for EmptyState shared component.
 *
 * DECISION: Uses full TestBed compilation with real component imports.
 * EmptyState has no store dependencies — it is a pure presentational
 * component, so no additional providers are needed beyond zoneless change
 * detection and the component itself.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  let fixture: ComponentFixture<EmptyState>;
  let component: EmptyState;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyState],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyState);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should display the title and description input values', () => {
    fixture.componentRef.setInput('title', 'No policies found');
    fixture.componentRef.setInput('description', 'Adjust your filters to see results.');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No policies found');
    expect(el.textContent).toContain('Adjust your filters to see results.');
  });
});
