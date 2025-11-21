export type Region = 'Europe' | 'America' | 'Africa' | 'Asia' | 'Oceania';

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
}

export interface KnockoutMatch extends Match {
  round: 'round-of-32' | 'round-of-16' | 'quarter-final' | 'semi-final' | 'third-place' | 'final';
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

export interface TournamentState {
  teams: Team[];
  tournaments: Tournament[]; // All tournaments
  currentTournamentId: string | null; // ID of selected tournament
  currentTournament: Tournament | null; // Computed from currentTournamentId

  // Actions
  loadTeamsFromDatabase: () => Promise<void>;
  initializeTournament: () => void;
  createNewTournament: (year: number) => Promise<void>;
  selectTournament: (id: string) => void;
  deleteTournament: (id: string) => Promise<void>;
  resetCurrentTournamentMatches: () => Promise<void>;
  updateTeam: (teamId: string, updates: Partial<Team>) => Promise<void>;
  simulateMatch: (matchId: string, groupId: string, stage: 'qualifier' | 'world-cup') => void;
  simulateAllGroupMatches: (groupId: string, stage: 'qualifier' | 'world-cup') => void;
  advanceToWorldCup: () => void;
  advanceToKnockout: () => void;
  simulateKnockoutMatch: (matchId: string) => void;
  generateDrawAndFixtures: () => void;
}

export interface EngineConfig {
  kFactor: number;
  homeAdvantage: number;
  skillMin: number;
  skillMax: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  homeSkillChange: number;
  awaySkillChange: number;
}
