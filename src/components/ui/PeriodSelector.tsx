import { useModeDescriptor } from '../../hooks/useModeDescriptor';
import { TournamentSelector } from './TournamentSelector';
import { SeasonSelector } from './SeasonSelector';

/**
 * "¿Qué edición estoy mirando?" — la misma pregunta en los dos modos.
 *
 * El ciclo mundialista la responde con sus torneos (uno cada cuatro años) y un
 * modo de temporada con sus años. Antes esto era una rama
 * `engine === 'national-cycle' && <TournamentSelector />` repetida en la
 * sidebar, el menú de pausa y el header mobile: tres lugares donde acordarse, y
 * el modo de temporada se quedaba sin selector en los tres.
 */
export function PeriodSelector() {
  const descriptor = useModeDescriptor();
  return descriptor.engine === 'national-cycle' ? <TournamentSelector /> : <SeasonSelector />;
}
