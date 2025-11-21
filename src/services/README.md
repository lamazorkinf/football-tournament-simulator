# Tournament Services

This directory contains services for managing tournaments using a normalized database schema.

## Service Architecture

### Core Services
- **normalizedTournamentService.ts**: Core tournament CRUD operations
- **normalizedQualifiersService.ts**: Qualifier groups, teams, and matches
- **normalizedWorldCupService.ts**: World Cup groups and knockout stages

Uses relational tables:
- `tournaments_new`
- `qualifier_groups`, `qualifier_group_teams`
- `world_cup_groups`, `world_cup_group_teams`
- `matches_new`
- `team_tournament_skills`

### Tournament Service (Main Entry Point)
- **adaptiveTournamentService.ts**: Main service export (re-exports normalizedTournamentService)
  - Kept for backward compatibility with existing imports
  - All functionality delegates to normalized services

## Database Schema

Uses relational tables:
- `tournaments_new` - Tournament metadata
- `qualifier_groups`, `qualifier_group_teams` - Qualification stage
- `world_cup_groups`, `world_cup_group_teams` - World Cup stage
- `matches_new` - All match records
- `team_tournament_skills` - Team skill snapshots
- `qualifier_standings`, `world_cup_standings` - Computed views

Benefits:
- ✅ Better performance for large datasets
- ✅ Proper foreign key constraints
- ✅ Easier complex queries
- ✅ Automatic standings updates via triggers
- ✅ Better data integrity

## Usage

### Using the Tournament Service (Recommended)

```typescript
import { adaptiveTournamentService } from './services/adaptiveTournamentService';

// Create or update tournament
await adaptiveTournamentService.saveTournament(tournament);

// Load tournament
const tournament = await adaptiveTournamentService.loadTournament(id);
```

### Using Specialized Services

You can import specific services for specialized functionality:

```typescript
import { normalizedQualifiersService } from './services/normalizedQualifiersService';
import { normalizedWorldCupService } from './services/normalizedWorldCupService';

// Create qualifier groups
await normalizedQualifiersService.createQualifierGroups(
  tournamentId,
  'Europe',
  groups
);

// Update match result (standings update automatically)
await normalizedQualifiersService.updateMatchResult(
  matchId,
  3,
  1
);

// World Cup operations
await normalizedWorldCupService.createWorldCupGroups(tournamentId, groups);
```

## Technical Implementation

### Typed Supabase Client

The normalized services use a custom typed client (`src/lib/supabaseNormalized.ts`) to ensure TypeScript compatibility:

```typescript
// src/lib/supabaseNormalized.ts
export const db = {
  tournaments_new: () => (supabase.from('tournaments_new') as any),
  qualifier_groups: () => (supabase.from('qualifier_groups') as any),
  qualifier_group_teams: () => (supabase.from('qualifier_group_teams') as any),
  world_cup_groups: () => (supabase.from('world_cup_groups') as any),
  world_cup_group_teams: () => (supabase.from('world_cup_group_teams') as any),
  matches_new: () => (supabase.from('matches_new') as any),
  team_tournament_skills: () => (supabase.from('team_tournament_skills') as any),
  qualifier_standings: () => (supabase.from('qualifier_standings') as any),
  world_cup_standings: () => (supabase.from('world_cup_standings') as any),
} as const;
```

This approach:
- ✅ Resolves TypeScript type inference issues with Supabase
- ✅ Provides a clean, consistent API
- ✅ Enables successful production builds
- ✅ Maintains type safety where possible

Usage in services:
```typescript
// Instead of:
await supabase.from('tournaments_new').insert({...})

// Use:
await db.tournaments_new().insert({...})
```

## Key Features

### High Performance
```typescript
// Direct database queries with optimized indexes
const standings = await normalizedQualifiersService.getGroupStandings(groupId);
```

### Data Integrity
```typescript
// Foreign key constraints prevent invalid data
// This will throw an error if team doesn't exist:
await db.qualifier_group_teams().insert({
  team_id: 'invalid-team',  // ❌ Error: foreign key constraint
  group_id: groupId
});
```

### Automatic Standing Updates
```typescript
// Database triggers automatically update standings when matches are played
await normalizedQualifiersService.updateMatchResult(matchId, 3, 1);
// Standings are updated automatically! ✨
```

## API Reference

### normalizedTournamentService

- `saveTournament(tournament)` - Create or update tournament
- `loadTournament(id)` - Load tournament with all related data
- `getLatestTournament()` - Get most recent tournament
- `getAllTournaments()` - Get all tournaments
- `deleteTournament(id)` - Delete tournament (cascades to all related data)

### normalizedQualifiersService

- `createQualifierGroups(tournamentId, region, groups)` - Create groups for a region
- `createQualifierMatch(tournamentId, groupId, match)` - Create a single match
- `updateMatchResult(matchId, homeScore, awayScore)` - Update match (auto-updates standings)
- `markTeamsAsQualified(groupId, teamIds)` - Mark teams as qualified
- `getQualifiedTeams(tournamentId)` - Get all qualified team IDs
- `getGroupStandings(groupId)` - Get standings for a group
- `getTournamentStandingsByRegion(tournamentId, region)` - Get all standings for a region

### normalizedWorldCupService

- `createWorldCupGroups(tournamentId, groups)` - Create World Cup groups
- `createWorldCupGroupMatch(tournamentId, groupId, match)` - Create group match
- `updateGroupMatchResult(matchId, homeScore, awayScore)` - Update group match
- `markGroupTeamsAsQualified(groupId, teamIds)` - Mark teams as qualified
- `createKnockoutMatch(tournamentId, match)` - Create knockout match
- `updateKnockoutMatchResult(matchId, homeScore, awayScore, penalties?, winnerId?)` - Update knockout
- `setFinalPositions(tournamentId, positions)` - Set champion, runner-up, etc.
- `getWorldCupGroupStandings(groupId)` - Get group standings
- `getQualifiedTeamsFromGroups(tournamentId)` - Get qualified team IDs

## Database Triggers

The normalized schema includes automatic triggers:

### Standing Updates
When a match result is updated, standings are automatically recalculated:
- Points (3 for win, 1 for draw, 0 for loss)
- Played, won, drawn, lost
- Goals for, goals against, goal difference

This happens automatically via the `trigger_update_group_standings_new` trigger.

## Testing

```typescript
// Example test
describe('Normalized Services', () => {
  it('should auto-update standings when match is played', async () => {
    // Create groups and teams
    await normalizedQualifiersService.createQualifierGroups(...);

    // Create and play match
    await normalizedQualifiersService.createQualifierMatch(...);
    await normalizedQualifiersService.updateMatchResult(matchId, 3, 1);

    // Standings should be updated automatically
    const standings = await normalizedQualifiersService.getGroupStandings(groupId);
    expect(standings[0].points).toBe(3);
    expect(standings[1].points).toBe(0);
  });
});
```

## Troubleshooting

### Feature flag not working
- Check `.env` file has `VITE_USE_NORMALIZED_SCHEMA=true`
- Restart dev server after changing `.env`
- Check browser console for "Using normalized schema service" message

### Foreign key constraint errors
- Ensure teams exist before creating groups/matches
- Check team IDs are correct
- Verify tournament exists before creating groups

### Standings not updating
- Check database trigger is installed: `trigger_update_group_standings_new`
- Verify match is being updated with `is_played: true`
- Check database logs for trigger errors
