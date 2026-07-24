import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Trophy } from 'lucide-react';
import { ViewHeader } from '../ViewHeader';

describe('ViewHeader', () => {
  it('renderiza el título como encabezado de nivel 2', () => {
    render(<ViewHeader icon={Trophy} title="Copa del Mundo" subtitle="Mundial 2026" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Copa del Mundo' })).toBeInTheDocument();
    expect(screen.getByText('Mundial 2026')).toBeInTheDocument();
  });

  it('renderiza las acciones que recibe', () => {
    render(<ViewHeader icon={Trophy} title="Copa del Mundo" actions={<button>Regenerar</button>} />);
    expect(screen.getByRole('button', { name: 'Regenerar' })).toBeInTheDocument();
  });
});
