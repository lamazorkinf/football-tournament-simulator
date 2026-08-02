import { ArrowDown, ArrowUp, Crown } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TableSummaryView } from '../../core/tableMoves';

/**
 * El bloque "qué cambió en la tabla" del resumen de fecha. Presentacional puro:
 * recibe el resumen ya con los nombres resueltos y no importa ningún store.
 *
 * Sin movimientos igual se rinde: que nadie se haya movido también es
 * información, y el puntero se anuncia siempre.
 */
export function TableMovesCard({ table }: { table: TableSummaryView }) {
  // Tres estados, no dos: en la primera fecha de una liga no había tabla contra
  // la cual sostenerse (el orden de antes era el de siembra), así que ahí el
  // puntero no "sigue" ni es "nuevo" — simplemente es.
  const leaderLabel = !table.hadPreviousTable
    ? 'es el puntero'
    : table.leaderIsNew
      ? 'es el nuevo puntero'
      : 'sigue puntero';

  return (
    <div className="bg-night border-2 border-grass p-3 sm:p-4 space-y-2">
      {/* "La tabla" en minúscula, con la mayúscula puesta por CSS: Press Start
          2P no tiene mayúsculas acentuadas, así que los rótulos arcade se
          eligen sin tildes. */}
      <p className="font-arcade text-[9px] text-grass-soft uppercase">La tabla</p>

      <p className="flex items-center gap-2 text-sm min-w-0">
        <Crown className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
        <span className="truncate text-gold">{table.leaderTeamName}</span>
        <span className="text-grass-soft shrink-0">{leaderLabel}</span>
      </p>

      {table.moves.map((move) => {
        // Menor número de posición es mejor: bajar de 7º a 4º es subir.
        const subio = move.to < move.from;
        const Icon = subio ? ArrowUp : ArrowDown;
        return (
          <p key={move.teamId} className="flex items-center gap-2 text-xs min-w-0">
            <Icon
              className={cn('w-3.5 h-3.5 shrink-0', subio ? 'text-led' : 'text-grass-soft')}
              aria-hidden="true"
            />
            <span className="truncate">{move.teamName}</span>
            <span className="text-grass-soft shrink-0 tabular-nums">
              {move.from}º → {move.to}º
            </span>
          </p>
        );
      })}
    </div>
  );
}
