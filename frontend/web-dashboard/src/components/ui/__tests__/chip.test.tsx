import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip } from '../chip';

describe('Chip Component', () => {
  it('renders neutral soft chip by default', () => {
    render(<Chip>Active</Chip>);
    const chip = screen.getByText('Active');
    expect(chip).toBeTruthy();
    expect(chip.parentElement?.className).toContain('bg-chip-neutral-bg');
  });

  it('renders positive soft chip with dot', () => {
    render(<Chip tone="positive" dot>Approved</Chip>);
    const chip = screen.getByText('Approved');
    expect(chip).toBeTruthy();
    expect(chip.parentElement?.className).toContain('bg-chip-positive-bg');
    expect(chip.parentElement?.className).toContain('text-chip-positive-fg');
  });

  it('renders solid variant for count badges', () => {
    render(<Chip tone="negative" variant="solid">5</Chip>);
    const chip = screen.getByText('5');
    expect(chip.parentElement?.className).toContain('bg-chip-negative-fg');
    expect(chip.parentElement?.className).toContain('text-white');
  });

  it('supports asChild rendering link', () => {
    render(
      <Chip tone="brand" asChild>
        <a href="/test">Link Chip</a>
      </Chip>
    );
    const link = screen.getByRole('link', { name: 'Link Chip' });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/test');
    expect(link.className).toContain('bg-chip-brand-bg');
  });
});

