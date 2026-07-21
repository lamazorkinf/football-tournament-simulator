import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('harness jsdom + testing-library', () => {
  it('renderiza un componente y usa matchers de jest-dom', () => {
    render(<div>hola ciclo</div>);
    expect(screen.getByText('hola ciclo')).toBeInTheDocument();
  });
});
