import { Trophy } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { PixelBar } from '../ui/PixelBar';
import { Skeleton } from '../ui/Skeleton';
import { navIcon } from '../ui/navIcons';
import { cn } from '../../lib/utils';
import { HeadlinesCard } from './HeadlinesCard';
import type { NavItem } from '../../modes/nav';
import type { HubIdle } from '../../modes/hubHeader';
import type { MobileAction } from '../../hooks/useMobileAction';
import type { HeadlineView } from '../../core/headlines';
import type { View } from '../../types/view';

interface HubViewProps {
  title: string;
  phaseLabel: string;
  /** 0..1 — progreso del modo entero. */
  progress: number;
  nextAction: MobileAction | null;
  /** Los items `competition` de la nav del modo. No se re-derivan acá. */
  ladder: NavItem[];
  /**
   * Vista actual de la app: marca cuál peldaño de la escalera está activo.
   * Parado en el inicio vale `'hub'`, que es el primer peldaño de la sección de
   * competición en los dos motores.
   */
  currentView: View;
  onSelectStep: (item: NavItem) => void;
  /** La portada: lo más notable de los últimos partidos del modo. Vacía ⇒ no se rinde. */
  headlines: HeadlineView[];
  /**
   * Qué pasa cuando no hay próxima acción. `loading` rinde el esqueleto (el modo
   * todavía no contestó); `blocked` rinde la explicación del propio modo; `done`
   * cae en el texto genérico de cierre. No se adivina desde `nextAction === null`:
   * mientras cargaba, adivinarlo hacía que el Hub dijera que no quedaba nada por
   * jugar.
   */
  idle: HubIdle;
  /** Salida cuando el ciclo terminó. Ausente en los modos que no terminan nunca. */
  onNewTournament?: () => void;
}

/**
 * Pantalla de inicio única para todos los modos. Recibe todo por props y no
 * importa ningún store: eso la hace testeable con objetos literales y evita que
 * vuelva a crecer una rama `¿es selecciones o es temporada?` adentro.
 */
export function HubView({
  title,
  phaseLabel,
  progress,
  nextAction,
  ladder,
  currentView,
  onSelectStep,
  headlines,
  idle,
  onNewTournament,
}: HubViewProps) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card>
        <CardContent className="space-y-4 py-6">
          <div>
            {/* `text-base` hasta sm, la misma escala que fija `ViewHeader`:
                Press Start 2P a `text-lg` no entra en móvil con los títulos
                largos ("Temporada 2028" son 14 caracteres ≈ 252px contra los
                ~232px útiles de una pantalla de 320px). */}
            <h1 className="font-arcade text-base sm:text-lg text-gold text-shadow-retro">
              {title}
            </h1>
            <p className="text-grass-soft text-sm mt-1">{phaseLabel}</p>
          </div>
          <PixelBar value={Math.round(progress * 100)} max={100} color="led" />
        </CardContent>
      </Card>

      <HeadlinesCard headlines={headlines} />

      {idle.kind === 'loading' ? (
        <Skeleton className="h-16 w-full" />
      ) : nextAction ? (
        // `text-xs` sobre `size="lg"`, exactamente como lo rinde el `ActionDock`
        // de móvil: son las mismas etiquetas, y con el `text-sm` que trae el
        // tamaño "▶ JUGAR CLASIFICATORIAS" (23 caracteres) se parte en dos
        // renglones a 320px.
        <Button
          size="lg"
          className="w-full text-xs"
          onClick={nextAction.onPress}
          disabled={nextAction.disabled}
        >
          {nextAction.label}
        </Button>
      ) : (
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <Trophy className="w-12 h-12 text-gold mx-auto" />
            <p className="text-grass-soft text-sm">
              {idle.kind === 'blocked' ? idle.message : 'No queda nada por jugar en este modo.'}
            </p>
            {onNewTournament && (
              <Button variant="secondary" size="sm" onClick={onNewTournament}>
                Nuevo torneo
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {ladder.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ladder.map((item) => {
            const Icon = navIcon(item.icon);
            const active = currentView === item.target.view;
            return (
              <button
                key={item.key}
                onClick={() => onSelectStep(item)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 font-arcade text-[10px] uppercase border-2 transition-colors',
                  item.locked
                    ? 'bg-grass-dark text-grass-soft border-grass opacity-60'
                    : active
                      ? 'bg-gold text-night border-white'
                      : 'bg-grass text-white border-line',
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
