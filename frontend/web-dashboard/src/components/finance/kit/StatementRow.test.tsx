import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatementRow } from './StatementRow';

describe('StatementRow', () => {
  it('renders label, code, dot, and formatted amounts correctly', () => {
    const { getByText, container } = render(
      <StatementRow
        level={2}
        code="5020"
        label="Driver Salaries"
        dotColor="bg-amber-500"
        amounts={174500}
      />
    );

    expect(getByText('Driver Salaries')).toBeTruthy();
    expect(getByText('5020')).toBeTruthy();
    expect(getByText('174,500.00')).toBeTruthy();

    const amountCell = container.querySelector('[data-amount]');
    expect(amountCell).toBeTruthy();
    expect(amountCell?.getAttribute('data-amount')).toBeDefined();
  });

  it('enforces single CSS grid structure across all row variants', () => {
    const { container } = render(
      <div style={{ width: '800px' }}>
        <StatementRow level={0} variant="section" label="Operating Income" amounts={500000} />
        <StatementRow level={1} variant="subgroup" label="Freight Revenue" amounts={400000} />
        <StatementRow level={2} variant="account" code="4010" label="Long Distance Haulage" amounts={400000} />
        <StatementRow level={1} variant="subtotal" label="Total Operating Income" amounts={500000} />
        <StatementRow level={0} variant="grandtotal" label="Net Profit" amounts={100000} />
      </div>
    );

    const rows = container.querySelectorAll('.grid');
    expect(rows.length).toBe(5);

    // Verify grid-template-columns style on every row
    rows.forEach((row) => {
      const style = (row as HTMLElement).style.gridTemplateColumns;
      expect(style).toBe('minmax(0, 1fr) repeat(1, 9.5rem)');
    });

    // Check padding-left values per level
    const labelCells = container.querySelectorAll('[data-level]');
    expect(labelCells.length).toBe(5);

    expect((labelCells[0] as HTMLElement).style.paddingLeft).toBe('0px');
    expect((labelCells[1] as HTMLElement).style.paddingLeft).toBe('16px');
    expect((labelCells[2] as HTMLElement).style.paddingLeft).toBe('32px');
    expect((labelCells[3] as HTMLElement).style.paddingLeft).toBe('16px');
    expect((labelCells[4] as HTMLElement).style.paddingLeft).toBe('0px');
  });

  it('handles comparison amounts array by expanding grid columns dynamically', () => {
    const { container } = render(
      <StatementRow
        level={2}
        code="4010"
        label="Freight Revenue"
        amounts={[100000, 85000, 15000]}
      />
    );

    const row = container.querySelector('.grid') as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('minmax(0, 1fr) repeat(3, 9.5rem)');

    const amountCells = container.querySelectorAll('[data-amount]');
    expect(amountCells.length).toBe(3);
    expect(amountCells[0].textContent).toBe('100,000.00');
    expect(amountCells[1].textContent).toBe('85,000.00');
    expect(amountCells[2].textContent).toBe('15,000.00');
  });
});
