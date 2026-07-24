import { create } from 'zustand';

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
  stage: string;
  groupName?: string;
  /** Involucra un equipo favorito: el modal lo ordena primero. */
  isFavorite?: boolean;
  /**
   * Definición por penales, aparte del marcador: no son goles del partido y
   * no entran en los totales del resumen.
   */
  penalties?: { homeScore: number; awayScore: number };
}

interface MatchResultsState {
  isOpen: boolean;
  results: MatchResult[];
  title: string;
  showResults: (results: MatchResult[], title: string) => void;
  close: () => void;
}

export const useMatchResultsStore = create<MatchResultsState>((set) => ({
  isOpen: false,
  results: [],
  title: '',

  showResults: (results: MatchResult[], title: string) => {
    set({
      isOpen: true,
      results,
      title,
    });
  },

  close: () => {
    set({
      isOpen: false,
      results: [],
      title: '',
    });
  },
}));
