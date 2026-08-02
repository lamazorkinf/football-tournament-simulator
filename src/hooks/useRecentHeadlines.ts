import { useEffect, useMemo, useState } from 'react';
import {
  deriveHeadlines,
  type Headline,
  type HeadlineMatch,
  type HeadlineView,
} from '../core/headlines';
import { matchHistoryService, type MatchHistoryEntry } from '../services/matchHistoryService';
import { useHistoryRevisionStore } from '../store/useHistoryRevisionStore';
import { useModeStore } from '../store/useModeStore';
import { useTournamentStore } from '../store/useTournamentStore';

/**
 * Cuántos partidos mira la portada. El RPC `get_matches_page` topea en 100.
 *
 * La ventana NO es "la última fecha", y no puede serlo: el ciclo persiste en
 * batch (una transacción, todos los `played_at` idénticos) pero el modo de
 * temporada persiste partido por partido, con `played_at` distintos por
 * milisegundos. Cualquier agrupamiento por tiempo sería frágil en un motor o en
 * el otro. Son los últimos 80 partidos del modo, y el decaimiento de
 * `deriveHeadlines` se encarga de que lo viejo pese menos.
 */
export const HEADLINES_WINDOW = 80;

/** Una fecha de temporada dispara diez inserts en paralelo, o sea diez bumps. */
export const HEADLINES_DEBOUNCE_MS = 300;

/**
 * Adapta una fila del historial a la forma neutra que consume la derivación.
 *
 * LOS DELTAS EN CERO. `collectPlayedCycleMatches` reconstruye los partidos
 * continental/confed cuyo insert best-effort se perdió, y los reinserta con el
 * skill de HOY en las dos columnas de "antes" y los dos cambios en 0. Esa fila
 * fabrica una brecha que nunca existió, así que hay que reconocerla.
 *
 * La marca son justamente los dos deltas en 0. En una fila REAL un delta vale 0
 * sólo si el resultado esperado coincidió exacto con el real, y eso pide skills
 * idénticos Y empate — en cuyo caso la brecha es 0 y ni BATACAZO ni AGUANTE
 * podían dispararse igual (piden brecha ≥ 6 y ≥ 12). O sea: la heurística no
 * silencia ningún titular que se hubiera emitido de todos modos.
 */
export function toHeadlineMatch(entry: MatchHistoryEntry): HeadlineMatch {
  const penalties = (
    entry.metadata as { penalties?: { homeScore: number; awayScore: number } } | undefined
  )?.penalties;
  return {
    homeTeamId: entry.homeTeamId,
    awayTeamId: entry.awayTeamId,
    homeScore: entry.homeScore,
    awayScore: entry.awayScore,
    homeSkillBefore: entry.homeSkillBefore,
    awaySkillBefore: entry.awaySkillBefore,
    stage: entry.stage,
    wentToExtraTime: entry.wentToExtraTime,
    skillsReconstructed: entry.homeSkillChange === 0 && entry.awaySkillChange === 0,
    ...(penalties ? { penalties } : {}),
  };
}

/**
 * Los titulares del modo activo, listos para dibujar.
 *
 * Es el único lugar de esta feature que toca stores y servicios: la derivación
 * es pura y la tarjeta es presentacional.
 *
 * No devuelve `loading` a propósito: mientras carga no se rinde nada. Un
 * esqueleto para un bloque opcional sería ruido, y el Hub ya tiene su propio
 * `idle` para lo que sí importa.
 *
 * @param enabled Sólo consulta si está en `true`. Lo apaga quien lo llama
 *   cuando el Hub no está a la vista: una tanda de octavos son 16 incrementos
 *   de la revisión espaciados por más de un debounce (`simulateRoundBatch` es
 *   secuencial y cada llave espera dos round trips), o sea 16 páginas de 80
 *   filas peleándole la conexión a los writes de la simulación con la portada
 *   desmontada.
 */
export function useRecentHeadlines(enabled: boolean = true): HeadlineView[] {
  const modeId = useModeStore((s) => s.activeModeId);
  const revision = useHistoryRevisionStore((s) => s.revision);
  const teams = useTournamentStore((s) => s.teams);
  /**
   * Los titulares viajan junto al modo del que salieron. Sin eso, cambiar de
   * modo dejaba la portada del modo anterior en pantalla los 300 ms del debounce
   * más el round trip — y con `loadTeamsFromDatabase` ya rotando el pool, los
   * nombres caían al id crudo ("isl 2 - 1 bra") sobre el Hub del modo nuevo.
   * Comparar contra el modo activo vacía la portada en el mismo render.
   */
  const [cached, setCached] = useState<{ modeId: string | null; headlines: Headline[] }>({
    modeId: null,
    headlines: [],
  });

  // `teams` NO es dependencia de este efecto: los nombres se resuelven abajo, y
  // meterlo acá dispararía una consulta cada vez que cambia un skill.
  useEffect(() => {
    // Apagado NO limpia lo cacheado, a propósito: ir a otra vista y volver
    // muestra al toque los titulares de antes, y la consulta que dispara el
    // re-encendido los refresca 300 ms después. Vaciar acá sería un parpadeo
    // gratis en el camino más común (entrar al Hub, salir, volver). Lo que sí
    // vacía la portada es cambiar de modo, y eso lo resuelve `cached.modeId`.
    if (!enabled) return;
    let cancelled = false;
    // El cleanup cancela el timer anterior, así que ráfagas de bumps colapsan en
    // una sola consulta: un debounce trailing sin código extra.
    const timer = setTimeout(async () => {
      try {
        const page = await matchHistoryService.getMatchesPage({
          modeId,
          pageSize: HEADLINES_WINDOW,
        });
        if (cancelled) return;
        setCached({ modeId, headlines: deriveHeadlines(page.matches.map(toHeadlineMatch)) });
      } catch (error) {
        if (cancelled) return;
        // Decoración: un fallo de red no puede romper el Hub ni bloquear el
        // botón de continuar. Se avisa por consola y no se rinde nada.
        console.error('No se pudieron leer los titulares:', error);
        setCached({ modeId, headlines: [] });
      }
    }, HEADLINES_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, modeId, revision]);

  return useMemo(() => {
    const headlines = cached.modeId === modeId ? cached.headlines : [];
    return headlines.map((headline) => ({
      ...headline,
      homeTeamName:
        teams.find((t) => t.id === headline.match.homeTeamId)?.name ?? headline.match.homeTeamId,
      awayTeamName:
        teams.find((t) => t.id === headline.match.awayTeamId)?.name ?? headline.match.awayTeamId,
    }));
  }, [cached, modeId, teams]);
}
