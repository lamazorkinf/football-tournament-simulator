import { useEffect, useMemo, useState } from 'react';
import { deriveHeadlines, type Headline, type HeadlineMatch } from '../core/headlines';
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

export interface HeadlineView extends Headline {
  homeTeamName: string;
  awayTeamName: string;
}

/** Adapta una fila del historial a la forma neutra que consume la derivación. */
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
 */
export function useRecentHeadlines(): HeadlineView[] {
  const modeId = useModeStore((s) => s.activeModeId);
  const revision = useHistoryRevisionStore((s) => s.revision);
  const teams = useTournamentStore((s) => s.teams);
  const [headlines, setHeadlines] = useState<Headline[]>([]);

  // `teams` NO es dependencia de este efecto: los nombres se resuelven abajo, y
  // meterlo acá dispararía una consulta cada vez que cambia un skill.
  useEffect(() => {
    if (!modeId) {
      setHeadlines([]);
      return;
    }
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
        setHeadlines(deriveHeadlines(page.matches.map(toHeadlineMatch)));
      } catch (error) {
        if (cancelled) return;
        // Decoración: un fallo de red no puede romper el Hub ni bloquear el
        // botón de continuar. Se avisa por consola y no se rinde nada.
        console.error('No se pudieron leer los titulares:', error);
        setHeadlines([]);
      }
    }, HEADLINES_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modeId, revision]);

  return useMemo(
    () =>
      headlines.map((headline) => ({
        ...headline,
        homeTeamName:
          teams.find((t) => t.id === headline.match.homeTeamId)?.name ?? headline.match.homeTeamId,
        awayTeamName:
          teams.find((t) => t.id === headline.match.awayTeamId)?.name ?? headline.match.awayTeamId,
      })),
    [headlines, teams],
  );
}
