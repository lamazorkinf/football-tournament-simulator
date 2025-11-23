import { create } from 'zustand';
import type { Match, KnockoutMatch } from '../types';

export interface MatchResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  stage: string;
  groupName?: string;
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
