import { create } from 'zustand';
import type { Region } from '../types';
import type { TableSummaryView } from '../core/tableMoves';

export interface MatchResult {
  homeTeam: string;
  awayTeam: string;
  /**
   * Ids de los equipos: el modal dibuja sus banderas. Opcionales porque el
   * nombre alcanza para leer el resultado y no todo productor los tiene.
   */
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore: number;
  awayScore: number;
  groupName?: string;
  /**
   * Confederación del partido, cuando la fase la tiene (continental y
   * clasificatorias). Sin ella, una jornada continental repite "R64" 82 veces
   * sin decir de qué continente es cada cruce. La etapa no viaja acá: no puede
   * variar dentro de una jornada y ya está en el título del resumen.
   */
  region?: Region;
  /** Involucra un equipo favorito: el modal lo ordena primero. */
  isFavorite?: boolean;
  /**
   * Definición por penales, aparte del marcador: no son goles del partido y
   * no entran en los totales del resumen.
   */
  penalties?: { homeScore: number; awayScore: number };
  /**
   * Skill de cada lado ANTES de este partido: es lo que mide la sorpresa de un
   * titular. Opcionales porque sólo los completa quien capturó el pool de
   * equipos antes de simular — al volver del await, el store ya aplicó los
   * deltas y el skill de "antes" ya no existe.
   */
  homeSkillBefore?: number;
  awaySkillBefore?: number;
  /** El partido se resolvió en el alargue. */
  wentToExtraTime?: boolean;
}

interface MatchResultsState {
  isOpen: boolean;
  results: MatchResult[];
  title: string;
  /**
   * Movimientos de la tabla de esta fecha. Sólo lo trae una jornada de UNA
   * liga: una fecha de clasificatorias reparte sus partidos en ~14 grupos y no
   * hay una tabla única que resumir.
   */
  table: TableSummaryView | null;
  showResults: (results: MatchResult[], title: string, table?: TableSummaryView) => void;
  close: () => void;
}

export const useMatchResultsStore = create<MatchResultsState>((set) => ({
  isOpen: false,
  results: [],
  title: '',
  table: null,

  showResults: (results: MatchResult[], title: string, table?: TableSummaryView) => {
    set({
      isOpen: true,
      results,
      title,
      table: table ?? null,
    });
  },

  close: () => {
    set({
      isOpen: false,
      results: [],
      title: '',
      table: null,
    });
  },
}));
