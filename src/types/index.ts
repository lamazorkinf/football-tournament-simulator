export type Region = 'Europe' | 'America' | 'Africa' | 'Asia';

export type SkillTier = 'Elite' | 'Strong' | 'Average' | 'Weak';

export interface Team {
  id: string;
  name: string;
  flag: string; // emoji or URL
  region: Region;
  skill: number; // 0-100, dynamic rating
  tier?: SkillTier; // Calculated based on skill
  manager?: string; // Optional manager name
  captain?: string; // Optional team captain
}

export interface Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  isPlayed: boolean;
  stage?: string; // 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
  matchday?: number; // Matchday number for fixture ordering (1-20 for qualifiers)
}

export interface TeamStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface Group {
  id: string;
  name: string; // e.g., "Group A"
  region: Region;
  teamIds: string[]; // Always 5 teams for qualifiers
  matches: Match[];
  standings: TeamStanding[];
  letterAssignments?: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'>; // Maps teamId to pot letter
  isDrawComplete?: boolean; // Whether draw and fixtures have been generated
}

export interface WorldCupGroup {
  id: string;
  name: string;
  teamIds: string[]; // 4 teams for World Cup groups
  matches: Match[];
  standings: TeamStanding[];
  letterAssignments?: Record<string, 'A' | 'B' | 'C' | 'D'>; // Maps teamId to pot letter (A=Pot1, B=Pot2, C=Pot3, D=Pot4)
}

export interface KnockoutMatch extends Match {
  round: 'round-of-64' | 'round-of-32' | 'round-of-16' | 'quarter' | 'semi' | 'third-place' | 'final';
  winnerId?: string;
  loserId?: string;
  penalties?: {
    homeScore: number;
    awayScore: number;
  };
  position?: number; // Position in bracket (0-15 for R32, 0-7 for R16, etc.)
}

export interface KnockoutBracket {
  roundOf32: KnockoutMatch[];
  roundOf16: KnockoutMatch[];
  quarterFinals: KnockoutMatch[];
  semiFinals: KnockoutMatch[];
  thirdPlace: KnockoutMatch | null;
  final: KnockoutMatch | null;
}

export interface WorldCup {
  groups: WorldCupGroup[];
  knockout: KnockoutBracket;
  qualifiedTeamIds: string[]; // Teams that qualified from regional qualifiers
  champion?: string;
  runnerUp?: string;
  thirdPlace?: string;
  fourthPlace?: string;
}

export interface Tournament {
  id: string;
  name: string;
  year: number; // Tournament year (e.g., 2026, 2030)
  qualifiers: {
    [key in Region]: Group[];
  };
  worldCup: WorldCup | null;
  isQualifiersComplete: boolean;
  hasAnyMatchPlayed: boolean; // Lock draw button after first match
  originalSkills?: Record<string, number>; // Snapshot of team skills at tournament start
}

export interface TournamentListItem {
  id: string;
  name: string;
  year: number;
  status: 'qualifiers' | 'world-cup' | 'completed';
  playedMatches: number;
  totalMatches: number;
  champion?: string;
  createdAt?: string;
}

/**
 * Estado de la carga inicial contra la DB. La app no tiene copia local de
 * respaldo: sin conexión no hay nada que mostrar, así que el arranque es un
 * estado explícito y no un `currentTournament === null`.
 */
export type InitStatus = 'loading' | 'ready' | 'error' | 'unconfigured';

export interface TournamentState {
  teams: Team[];
  tournaments: Cycle[]; // All tournaments
  currentTournamentId: string | null; // ID of selected tournament
  currentTournament: Cycle | null; // Computed from currentTournamentId
  isSavingMatch: boolean; // Track if a match is being saved to prevent race conditions
  isBatchProcessing: boolean; // Track if batch processing is active to skip individual saves
  initStatus: InitStatus; // Carga inicial desde la DB (única fuente de verdad)

  // Actions
  loadTeamsFromDatabase: () => Promise<void>;
  initializeTournament: () => Promise<void>;
  refreshFromDatabase: () => Promise<void>;
  createNewTournament: (year: number) => Promise<void>;
  selectTournament: (id: string) => Promise<void>;
  importTournament: (tournament: Cycle) => Promise<void>;
  deleteTournament: (id: string) => Promise<void>;
  recalculateTournamentPerformances: (tournamentId: string) => Promise<void>;
  resetCurrentTournamentMatches: () => Promise<void>;
  updateTeam: (teamId: string, updates: Partial<Team>) => Promise<void>;
  simulateMatch: (matchId: string, groupId: string, stage: 'qualifier' | 'world-cup') => Promise<SimulatedMatchOutcome | null>;
  simulateMatchdayBatch: (matches: Array<{ matchId: string; groupId: string; stage: 'qualifier' | 'world-cup'; groupName: string; region?: Region }>) => Promise<MatchdayOutcome[]>;
  simulateRoundBatch: (items: Array<{ matchId: string; kind: 'knockout' | 'continental' | 'confederations' }>) => Promise<MatchdayOutcome[]>;
  advanceToWorldCup: () => void;
  advanceToWorldCupWithManualDraw: (worldCupGroups: WorldCupGroup[]) => void;
  advanceToKnockout: () => Promise<void>;
  regenerateKnockoutStage: () => Promise<void>;
  simulateKnockoutMatch: (matchId: string) => Promise<SimulatedMatchOutcome | null>;
  generateDrawAndFixtures: () => void;
  regenerateWorldCupDrawAndFixtures: () => Promise<void>;
  drawContinental: () => void;
  simulateContinentalMatch: (matchId: string) => Promise<SimulatedMatchOutcome | null>;
  drawConfederations: () => void;
  simulateConfederationsMatch: (matchId: string) => Promise<SimulatedMatchOutcome | null>;
  advanceToQualifiers: () => void;
}

/** Fase activa del ciclo (puntero de calendario). */
export type CyclePhase =
  | 'continental'
  | 'confed'
  | 'wc-qualifiers'
  | 'wc-groups'
  | 'wc-knockout'
  | 'completed';

/** Puntero del calendario global dentro del ciclo. */
export interface CalendarState {
  phase: CyclePhase;
  matchday: number; // 1-based: jornada/ronda actual dentro de la fase
}

/** Bracket de eliminación directa de un torneo continental (arranca en R64). */
export interface ContinentalBracket {
  region: Region;
  roundOf64: KnockoutMatch[]; // solo los cruces reales; los byes no generan partido
  roundOf32: KnockoutMatch[];
  roundOf16: KnockoutMatch[];
  quarterFinals: KnockoutMatch[];
  semiFinals: KnockoutMatch[];
  final: KnockoutMatch | null;
  thirdPlace: KnockoutMatch | null;
  championId?: string; // finalista 1 (campeón)
  runnerUpId?: string; // finalista 2 (subcampeón)
  thirdPlaceId?: string;
  byeTeamIds: string[]; // cabezas de serie con bye directo a R32
}

/** Los 4 brackets continentales de una edición del ciclo. */
export interface ContinentalStage {
  brackets: Record<Region, ContinentalBracket>;
  isComplete: boolean;
}

/** Copa Confederaciones: 2 grupos de 4 + semis/3er puesto/final. */
export interface ConfederationsCup {
  groups: WorldCupGroup[]; // 2 grupos de 4 (una selección por confederación por grupo)
  knockout: {
    semiFinals: KnockoutMatch[]; // 1ºA-2ºB, 1ºB-2ºA
    thirdPlace: KnockoutMatch | null;
    final: KnockoutMatch | null;
  };
  championId?: string;
  isComplete: boolean;
}

/** Ciclo de 4 años: extiende el Tournament con las fases previas y el calendario. */
export interface Cycle extends Tournament {
  continental: ContinentalStage;
  confederationsCup: ConfederationsCup;
  calendar: CalendarState;
}

/**
 * La definición real de EngineConfig vive en el store de configuración, que es
 * la única fuente de verdad (incluye eloDivisor). Se reexporta desde aquí para
 * que no vuelva a aparecer una copia desincronizada.
 */
export type { EngineConfig } from '../store/useConfigStore';

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  homeSkillChange: number;
  awaySkillChange: number;
}

/** Resultado comprometido por una acción simulate*, para reproducir en vivo. */
export interface SimulatedMatchOutcome {
  homeScore: number;
  awayScore: number;
  penalties?: { homeScore: number; awayScore: number };
}

/** Resultado de un partido dentro de un batch de jornada, con sus equipos. */
export interface MatchdayOutcome extends SimulatedMatchOutcome {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
}
