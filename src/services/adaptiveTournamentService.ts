/**
 * Tournament Service
 *
 * This is a simplified re-export of the normalized tournament service.
 * Previously this was an "adaptive" service that could switch between
 * JSONB and normalized schemas, but we now exclusively use normalized schema.
 *
 * This file is kept for backward compatibility with existing imports,
 * but it simply delegates to normalizedTournamentService.
 */

export { normalizedTournamentService as adaptiveTournamentService } from './normalizedTournamentService';
export { normalizedTournamentService as default } from './normalizedTournamentService';
