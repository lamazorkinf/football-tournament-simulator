import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeadlinesCard } from '../HeadlinesCard';
import type { HeadlineView } from '../../../core/headlines';

const headline = (over: Partial<HeadlineView> = {}): HeadlineView => ({
  kind: 'upset',
  label: 'BATACAZO',
  detail: 'le ganó a un rival 25 puntos mejor',
  subjectTeamId: 'A',
  score: 0.6,
  homeTeamName: 'Ben Hur',
  awayTeamName: 'Alumni',
  match: {
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: 2,
    awayScore: 0,
    homeSkillBefore: 60,
    awaySkillBefore: 85,
    stage: 'league',
  },
  ...over,
});

describe('HeadlinesCard', () => {
  it('sin titulares no rinde nada', () => {
    const { container } = render(<HeadlinesCard headlines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rinde etiqueta, marcador y explicación', () => {
    render(<HeadlinesCard headlines={[headline()]} />);
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    // El nombre de cada equipo vive en un único <span> del DOM: el mismo
    // bloque escudo+nombre sirve para la fila ancha (>= sm) y para el
    // marcador apilado (< sm) — sólo cambia de posición por CSS
    // (`display: contents`), no se duplica. Por eso `getByText` (que exige
    // una única coincidencia) sigue siendo válido acá.
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText('Alumni')).toBeInTheDocument();
    // El marcador combinado "2 - 0" es el que se ve en la fila ancha; el
    // marcador apilado usa goles individuales por renglón (ver el test de
    // abajo), así que este texto exacto no se duplica.
    expect(screen.getByText('2 - 0')).toBeInTheDocument();
    expect(screen.getByText('le ganó a un rival 25 puntos mejor')).toBeInTheDocument();
  });

  it('el renglón apilado de cada equipo (< sm) muestra su nombre completo junto a su propio gol', () => {
    const { container } = render(
      <HeadlinesCard
        headlines={[
          headline({
            homeTeamName: 'Independiente (H)',
            awayTeamName: 'Juventud Río de la Plata',
            match: { ...headline().match, homeScore: 3, awayScore: 1 },
          }),
        ]}
      />,
    );

    // `TeamScoreRow` marca su renglón con la clase `sm:contents`: por debajo
    // de `sm` es un renglón propio (escudo, nombre, gol); desde `sm` se
    // aplana y su contenido pasa a ser un ítem directo de la fila ancha.
    // jsdom no aplica media queries, así que lo que se comprueba acá es la
    // presencia y el contenido de cada renglón, no cuál variante se ve.
    const renglones = container.querySelectorAll('.sm\\:contents');
    expect(renglones).toHaveLength(2);
    expect(renglones[0]).toHaveTextContent('Independiente (H)');
    expect(renglones[0]).toHaveTextContent('3');
    expect(renglones[1]).toHaveTextContent('Juventud Río de la Plata');
    expect(renglones[1]).toHaveTextContent('1');
  });

  it('el resaltado del equipo sujeto (subjectTeamId) se aplica en las dos variantes', () => {
    // subjectTeamId por defecto es 'A', que coincide con homeTeamId: el
    // equipo local ("Ben Hur") es el resaltado. Como el bloque escudo+nombre
    // no se duplica (ver el test de arriba), el mismo <span> resaltado es el
    // que participa tanto del renglón apilado como, aplanado por CSS, de la
    // fila ancha — comprobar la clase una vez alcanza para las dos.
    const { container } = render(<HeadlinesCard headlines={[headline()]} />);

    const nombreLocal = screen.getByText('Ben Hur');
    const nombreVisitante = screen.getByText('Alumni');
    expect(nombreLocal).toHaveClass('text-gold');
    expect(nombreVisitante).not.toHaveClass('text-gold');

    const renglones = container.querySelectorAll('.sm\\:contents');
    expect(renglones).toHaveLength(2);
    expect(renglones[0]).toContainElement(nombreLocal);
    expect(renglones[1]).toContainElement(nombreVisitante);
  });

  it('rinde los tres titulares de la portada', () => {
    render(
      <HeadlinesCard
        headlines={[
          headline(),
          headline({
            kind: 'rout',
            label: 'GOLEADA',
            detail: '5 goles de diferencia',
            homeTeamName: 'Ferrocarril',
            awayTeamName: 'Bochas',
            match: { ...headline().match, homeTeamId: 'C', awayTeamId: 'D' },
          }),
          headline({
            kind: 'streak',
            label: 'RACHA',
            detail: '6 victorias al hilo',
            homeTeamName: 'Talleres',
            awayTeamName: 'Alem',
            match: { ...headline().match, homeTeamId: 'E', awayTeamId: 'F' },
          }),
        ]}
      />,
    );
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('GOLEADA')).toBeInTheDocument();
    expect(screen.getByText('RACHA')).toBeInTheDocument();
  });

  it('muestra la tanda de penales junto al marcador', () => {
    render(
      <HeadlinesCard
        headlines={[
          headline({
            kind: 'decider',
            label: 'PENALES',
            detail: 'se definió por penales',
            subjectTeamId: undefined,
            match: {
              ...headline().match,
              homeScore: 1,
              awayScore: 1,
              penalties: { homeScore: 4, awayScore: 2 },
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Penales 4 - 2/)).toBeInTheDocument();
  });

  /**
   * El texto se escribe en minúscula y la mayúscula la pone el CSS (`uppercase`),
   * igual que el bloque que este reemplaza — por eso las aserciones van con
   * regex insensible a mayúsculas y no con el string literal.
   */
  it('titula el bloque en la tipografía arcade', () => {
    render(<HeadlinesCard headlines={[headline()]} />);
    const titulo = screen.getByText(/titulares/i);
    expect(titulo.className).toContain('font-arcade');
  });

  /**
   * Un titular de PENALES no tiene sujeto: el partido lo definió la tanda, no
   * una actuación de uno de los dos. Resaltar a cualquiera de ellos sería
   * elegir un protagonista que la derivación se negó a elegir.
   */
  it('un titular sin sujeto no resalta a ningún equipo', () => {
    render(
      <HeadlinesCard
        headlines={[
          headline({
            kind: 'decider',
            label: 'PENALES',
            detail: 'se definió por penales',
            subjectTeamId: undefined,
          }),
        ]}
      />,
    );
    expect(screen.getByText('Ben Hur').className).not.toContain('text-gold');
    expect(screen.getByText('Alumni').className).not.toContain('text-gold');
  });
});
