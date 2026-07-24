import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PixelBar } from '../PixelBar';

describe('PixelBar', () => {
  it('expone el valor actual en modo determinado', () => {
    render(<PixelBar value={50} max={100} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '50');
  });

  it('omite aria-valuenow en modo indeterminado', () => {
    render(<PixelBar value={0} max={100} indeterminate />);
    const meter = screen.getByRole('meter');
    expect(meter).not.toHaveAttribute('aria-valuenow');
  });
});
