import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatPill } from '../stat-pill';

describe('StatPill Component', () => {
  it('renders count, label, and value with specified tone', () => {
    render(<StatPill count={12} label="invoices due" value="4,250.00 SAR" tone="warning" />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('invoices due')).toBeTruthy();
    expect(screen.getByText('4,250.00 SAR').className).toContain('text-chip-warning-fg');
  });

  it('renders without count if count is omitted', () => {
    render(<StatPill label="Total Outstanding" value="10,000.00" tone="positive" />);
    expect(screen.getByText('Total Outstanding')).toBeTruthy();
    expect(screen.getByText('10,000.00').className).toContain('text-chip-positive-fg');
  });
});

