import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TournamentState, Team, Region, Tournament, Group, Match, KnockoutMatch } from '../types';
import teamsData from '../data/teams.json';
import { nanoid } from 'nanoid';
import {
  createQualifierGroups,
  updateStandings,
  sortStandings,
} from '../core/scheduler';
import { createSmartWorldCupDraw } from '../core/seeding';
import { updateTeamsTiers } from '../core/tiers';
import { simulateMatch as simulateGroupMatch, simulateMatchWithPenalties, updateTeamSkill } from '../core/engine';
import {
  initializeKnockoutBracket,
  areGroupsComplete,
  isRoundComplete,
  generateRoundOf32,
  generateRoundOf16,
  generateQuarterFinals,
  generateSemiFinals,
  generateThirdPlaceMatch,
  generateFinal,
} from '../core/knockout';
import { matchHistoryService } from '../services/matchHistoryService';
import { teamsService } from '../services/teamsService';
import { adaptiveTournamentService } from '../services/adaptiveTournamentService';
import { normalizedQualifiersService } from '../services/normalizedQualifiersService';
import { normalizedWorldCupService } from '../services/normalizedWorldCupService';
import { isSupabaseConfigured } from '../lib/supabase';
import { performDraw, generateGroupMatches, initializeStandings } from '../utils/drawSystem';

// Helper function to update tournament in state and database
const updateTournamentInState = (set: any, _get: any, updatedTournament: Tournament) => {
  // Update in tournaments list
  set((state: TournamentState) => {
    const updatedTournaments = state.tournaments.map(t =>
      t.id === updatedTournament.id ? updatedTournament : t
    );
    return {
      tournaments: updatedTournaments,
      currentTournament: state.currentTournamentId === updatedTournament.id
        ? updatedTournament
        : state.currentTournament
    };
  });

  // Save to database
  if (isSupabaseConfigured()) {
    adaptiveTournamentService
      .saveTournament(updatedTournament)
      .catch((error) => console.error('Error auto-saving tournament:', error));
  }
};

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => {
      return {
        teams: teamsData as Team[],
        tournaments: [],
        currentTournamentId: null,
        currentTournament: null,

      loadTeamsFromDatabase: async () => {
        if (!isSupabaseConfigured()) {
          console.log('Supabase not configured, using local teams data');
          return;
        }

        try {
          const dbTeams = await teamsService.getAllTeams();
          if (dbTeams && dbTeams.length > 0) {
            console.log(`Loaded ${dbTeams.length} teams from database`);
            const teamsWithTiers = updateTeamsTiers(dbTeams);
            set({ teams: teamsWithTiers });
          } else {
            console.log('No teams in database, using local teams data');
          }
        } catch (error) {
          console.error('Error loading teams from database:', error);
          console.log('Falling back to local teams data');
        }
      },

      initializeTournament: async () => {
        // Try to load all tournaments from database first
        if (isSupabaseConfigured()) {
          try {
            const allTournaments = await adaptiveTournamentService.getAllTournaments();
            if (allTournaments && allTournaments.length > 0) {
              console.log(`Loaded ${allTournaments.length} tournaments from database`);
              // Select the most recent tournament
              const latestTournament = allTournaments[0]; // Already sorted by created_at desc
              set({
                tournaments: allTournaments,
                currentTournamentId: latestTournament.id,
                currentTournament: latestTournament
              });
              return;
            }
          } catch (error) {
            console.error('Error loading tournaments from database:', error);
          }
        }

        // No tournaments in database, create first one with year 2026
        const teamsWithTiers = updateTeamsTiers(get().teams);

        // Capture original skills at tournament start
        const originalSkills: Record<string, number> = {};
        teamsWithTiers.forEach((team) => {
          originalSkills[team.id] = team.skill;
        });

        const qualifiers: Record<Region, Group[]> = {
          Europe: createQualifierGroups(teamsWithTiers, 'Europe'),
          America: createQualifierGroups(teamsWithTiers, 'America'),
          Africa: createQualifierGroups(teamsWithTiers, 'Africa'),
          Asia: createQualifierGroups(teamsWithTiers, 'Asia'),
          Oceania: createQualifierGroups(teamsWithTiers, 'Oceania'),
        };

        const tournament: Tournament = {
          id: nanoid(),
          name: 'World Cup 2026',
          year: 2026,
          qualifiers,
          worldCup: null,
          isQualifiersComplete: false,
          hasAnyMatchPlayed: false,
          originalSkills,
        };

        set({
          teams: teamsWithTiers,
          tournaments: [tournament],
          currentTournamentId: tournament.id,
          currentTournament: tournament
        });

        // Save new tournament to database
        if (isSupabaseConfigured()) {
          adaptiveTournamentService
            .saveTournament(tournament)
            .catch((error) => console.error('Error saving new tournament:', error));
        }
      },

      createNewTournament: async (year: number) => {
        const teamsWithTiers = updateTeamsTiers(get().teams);

        // Capture original skills at tournament start
        const originalSkills: Record<string, number> = {};
        teamsWithTiers.forEach((team) => {
          originalSkills[team.id] = team.skill;
        });

        const qualifiers: Record<Region, Group[]> = {
          Europe: createQualifierGroups(teamsWithTiers, 'Europe'),
          America: createQualifierGroups(teamsWithTiers, 'America'),
          Africa: createQualifierGroups(teamsWithTiers, 'Africa'),
          Asia: createQualifierGroups(teamsWithTiers, 'Asia'),
          Oceania: createQualifierGroups(teamsWithTiers, 'Oceania'),
        };

        const tournament: Tournament = {
          id: nanoid(),
          name: `World Cup ${year}`,
          year,
          qualifiers,
          worldCup: null,
          isQualifiersComplete: false,
          hasAnyMatchPlayed: false,
          originalSkills,
        };

        // Add to tournaments list
        set((state) => ({
          tournaments: [tournament, ...state.tournaments],
        }));

        // Save new tournament to database
        if (isSupabaseConfigured()) {
          try {
            await adaptiveTournamentService.saveTournament(tournament);
            console.log(`Tournament ${year} created and saved to database`);

            // Save empty qualifier groups to database
            const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia', 'Oceania'];
            await Promise.all(
              regions.map(async (region) => {
                try {
                  await normalizedQualifiersService.createQualifierGroups(
                    tournament.id,
                    region,
                    qualifiers[region]
                  );
                  console.log(`  ✅ Saved empty ${region} qualifier groups to database`);
                } catch (error) {
                  console.error(`  ❌ Error saving ${region} qualifier groups:`, error);
                  throw error;
                }
              })
            );
            console.log(`✅ All empty qualifier groups saved for tournament ${year}`);
          } catch (error) {
            console.error('Error saving new tournament:', error);
          }
        }

        // Ask user if they want to switch to the new tournament
        const shouldSwitch = confirm(
          `Torneo Mundial ${year} creado exitosamente.\n\n¿Deseas cambiar a este torneo ahora?`
        );

        if (shouldSwitch) {
          set({
            currentTournamentId: tournament.id,
            currentTournament: tournament
          });
        }
      },

      selectTournament: (id: string) => {
        const state = get();
        const tournament = state.tournaments.find(t => t.id === id);
        if (tournament) {
          set({
            currentTournamentId: id,
            currentTournament: tournament
          });
          console.log(`Switched to tournament: ${tournament.name}`);
        }
      },

      deleteTournament: async (id: string) => {
        const state = get();
        const tournament = state.tournaments.find(t => t.id === id);

        if (!tournament) return;

        // Don't allow deleting if it's the only tournament
        if (state.tournaments.length === 1) {
          alert('No puedes eliminar el único torneo existente.');
          return;
        }

        // Confirm deletion
        if (!confirm(`¿Eliminar el torneo "${tournament.name}"?\n\nEsta acción no se puede deshacer.`)) {
          return;
        }

        // Delete from database
        if (isSupabaseConfigured()) {
          try {
            await adaptiveTournamentService.deleteTournament(id);
            console.log(`Tournament ${id} deleted from database`);
          } catch (error) {
            console.error('Error deleting tournament:', error);
            alert('Error al eliminar el torneo de la base de datos.');
            return;
          }
        }

        // If we're deleting the current tournament, switch to another one
        let newCurrentId = state.currentTournamentId;
        let newCurrentTournament = state.currentTournament;
        if (state.currentTournamentId === id) {
          const remainingTournaments = state.tournaments.filter(t => t.id !== id);
          newCurrentId = remainingTournaments[0]?.id ?? null;
          newCurrentTournament = remainingTournaments[0] ?? null;
        }

        // Remove from list
        set((state) => ({
          tournaments: state.tournaments.filter(t => t.id !== id),
          currentTournamentId: newCurrentId,
          currentTournament: newCurrentTournament
        }));
      },

      resetCurrentTournamentMatches: async () => {
        const state = get();
        if (!state.currentTournament) return;

        const tournamentId = state.currentTournament.id;

        // Delete all data from database
        if (isSupabaseConfigured()) {
          try {
            // Delete match history
            await matchHistoryService.deleteMatchesByTournament(tournamentId);
            console.log(`✅ Deleted match history for tournament ${tournamentId}`);

            // Delete qualifier data (groups, teams, matches)
            await normalizedQualifiersService.deleteQualifierData(tournamentId);
            console.log(`✅ Deleted qualifier data for tournament ${tournamentId}`);

            // Delete World Cup data if exists
            if (state.currentTournament.worldCup) {
              await normalizedWorldCupService.deleteWorldCupData(tournamentId);
              console.log(`✅ Deleted World Cup data for tournament ${tournamentId}`);
            }
          } catch (error) {
            console.error('❌ Error deleting tournament data:', error);
          }
        }

        // Reset all qualifiers: clear matches and set isPlayed to false
        const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia', 'Oceania'];
        const resetQualifiers: Record<Region, Group[]> = {} as any;

        regions.forEach((region) => {
          const groups = state.currentTournament!.qualifiers[region];

          resetQualifiers[region] = groups.map((group) => ({
            ...group,
            matches: [], // Clear all matches
            standings: initializeStandings(group.teamIds), // Reset standings
            isDrawComplete: false, // Allow redraw
          }));
        });

        // Update tournament
        const updatedTournament: Tournament = {
          ...state.currentTournament,
          qualifiers: resetQualifiers,
          worldCup: null, // Remove World Cup if it exists
          isQualifiersComplete: false,
          hasAnyMatchPlayed: false,
        };

        // Update in state and save to database
        updateTournamentInState(set, get, updatedTournament);
      },

      updateTeam: async (teamId: string, updates: Partial<Team>) => {
        // Update in Supabase if configured
        if (isSupabaseConfigured()) {
          try {
            await teamsService.updateTeam(teamId, updates);
            console.log(`Team ${teamId} updated in database`);
          } catch (error) {
            console.error('Error updating team in database:', error);
          }
        }

        set((state) => {
          const updatedTeams = state.teams.map((team) =>
            team.id === teamId ? { ...team, ...updates } : team
          );

          // If region changed or tournament exists, we need to regenerate groups
          const team = state.teams.find((t) => t.id === teamId);
          const needsRegeneration =
            team && updates.region && updates.region !== team.region;

          if (needsRegeneration && state.currentTournament) {
            // Regenerate all qualifier groups with updated teams
            const qualifiers: Record<Region, Group[]> = {
              Europe: createQualifierGroups(updatedTeams, 'Europe'),
              America: createQualifierGroups(updatedTeams, 'America'),
              Africa: createQualifierGroups(updatedTeams, 'Africa'),
              Asia: createQualifierGroups(updatedTeams, 'Asia'),
              Oceania: createQualifierGroups(updatedTeams, 'Oceania'),
            };

            return {
              teams: updatedTeams,
              currentTournament: {
                ...state.currentTournament,
                qualifiers,
                isQualifiersComplete: false,
              },
            };
          }

          return { teams: updatedTeams };
        });
      },

      simulateMatch: (matchId: string, groupId: string, stage: 'qualifier' | 'world-cup') => {
        const state = get();
        if (!state.currentTournament) return;

        // Find the group and match
        let targetGroup: Group | undefined;

        if (stage === 'qualifier') {
          // Search in qualifiers
          for (const region in state.currentTournament.qualifiers) {
            const groups = state.currentTournament.qualifiers[region as Region];
            targetGroup = groups.find((g) => g.id === groupId);
            if (targetGroup) break;
          }
        } else {
          // Search in world cup groups
          if (state.currentTournament.worldCup) {
            targetGroup = state.currentTournament.worldCup.groups.find(
              (g) => g.id === groupId
            ) as Group | undefined;
          }
        }

        if (!targetGroup) return;

        const matchIndex = targetGroup.matches.findIndex((m) => m.id === matchId);
        if (matchIndex === -1) return;

        const match = targetGroup.matches[matchIndex];
        if (match.isPlayed) return;

        // Get team skills
        const homeTeam = state.teams.find((t) => t.id === match.homeTeamId);
        const awayTeam = state.teams.find((t) => t.id === match.awayTeamId);

        if (!homeTeam || !awayTeam) return;

        // Simulate the match
        const result = simulateGroupMatch(homeTeam.skill, awayTeam.skill);

        // Update match
        const updatedMatch: Match = {
          ...match,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isPlayed: true,
        };

        // Calculate new skills
        const newHomeSkill = updateTeamSkill(homeTeam.skill, result.homeSkillChange);
        const newAwaySkill = updateTeamSkill(awayTeam.skill, result.awaySkillChange);

        // Save to database (async, don't wait)
        if (isSupabaseConfigured()) {
          // Update match result in normalized schema
          normalizedQualifiersService
            .updateMatchResult(matchId, result.homeScore, result.awayScore)
            .catch((error) => console.error('Error updating match result:', error));

          // Log match to history
          matchHistoryService
            .createMatch({
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              stage: stage === 'qualifier' ? 'qualifier' : 'world-cup-group',
              groupName: targetGroup.name,
              region: targetGroup.region,
              tournamentId: state.currentTournament.id,
              homeSkillBefore: homeTeam.skill,
              awaySkillBefore: awayTeam.skill,
              homeSkillAfter: newHomeSkill,
              awaySkillAfter: newAwaySkill,
              homeSkillChange: result.homeSkillChange,
              awaySkillChange: result.awaySkillChange,
            })
            .catch((error) => console.error('Error logging match:', error));

          // Update team skills in database
          teamsService
            .batchUpdateTeams([
              { id: homeTeam.id, skill: newHomeSkill },
              { id: awayTeam.id, skill: newAwaySkill },
            ])
            .catch((error) => console.error('Error updating team skills:', error));
        }

        // Update team skills in local state
        const updatedTeams = state.teams.map((team) => {
          if (team.id === homeTeam.id) {
            return {
              ...team,
              skill: newHomeSkill,
            };
          }
          if (team.id === awayTeam.id) {
            return {
              ...team,
              skill: newAwaySkill,
            };
          }
          return team;
        });

        // Update standings
        const updatedStandings = updateStandings(targetGroup.standings, updatedMatch);
        const sortedStandings = sortStandings(updatedStandings, updatedTeams);

        // Update the group
        const updatedGroup: Group = {
          ...targetGroup,
          matches: targetGroup.matches.map((m, i) =>
            i === matchIndex ? updatedMatch : m
          ),
          standings: sortedStandings,
        };

        // Update tournament
        if (stage === 'qualifier') {
          const updatedQualifiers = { ...state.currentTournament.qualifiers };
          updatedQualifiers[targetGroup.region] = updatedQualifiers[
            targetGroup.region
          ].map((g) => (g.id === groupId ? updatedGroup : g));

          const updatedTournament = {
            ...state.currentTournament,
            qualifiers: updatedQualifiers,
            hasAnyMatchPlayed: true,
          };

          set({ teams: updatedTeams });
          updateTournamentInState(set, get, updatedTournament);
        } else {
          if (state.currentTournament.worldCup) {
            const updatedGroups = state.currentTournament.worldCup.groups.map((g) =>
              g.id === groupId ? updatedGroup : g
            );

            const updatedTournament = {
              ...state.currentTournament,
              worldCup: {
                ...state.currentTournament.worldCup,
                groups: updatedGroups,
              },
              hasAnyMatchPlayed: true,
            };

            set({ teams: updatedTeams });
            updateTournamentInState(set, get, updatedTournament);
          }
        }
      },

      simulateAllGroupMatches: (groupId: string, stage: 'qualifier' | 'world-cup') => {
        const state = get();
        if (!state.currentTournament) return;

        // Find the group
        let targetGroup: Group | undefined;

        if (stage === 'qualifier') {
          for (const region in state.currentTournament.qualifiers) {
            const groups = state.currentTournament.qualifiers[region as Region];
            targetGroup = groups.find((g) => g.id === groupId);
            if (targetGroup) break;
          }
        } else if (stage === 'world-cup' && state.currentTournament.worldCup) {
          targetGroup = state.currentTournament.worldCup.groups.find(
            (g) => g.id === groupId
          ) as Group | undefined;
        }

        if (!targetGroup) return;

        // Simulate all unplayed matches
        targetGroup.matches.forEach((match) => {
          if (!match.isPlayed) {
            get().simulateMatch(match.id, groupId, stage);
          }
        });
      },

      advanceToWorldCup: () => {
        const state = get();
        if (!state.currentTournament) return;

        // Check if all qualifier matches are complete
        let allMatchesPlayed = true;
        for (const region in state.currentTournament.qualifiers) {
          const groups = state.currentTournament.qualifiers[region as Region];
          groups.forEach((group) => {
            if (group.matches.some((m) => !m.isPlayed)) {
              allMatchesPlayed = false;
            }
          });
        }

        if (!allMatchesPlayed) {
          alert('Please complete all qualifier matches before advancing to the World Cup!');
          return;
        }

        // Get top 2 teams from each group
        const qualifiedTeamIds: string[] = [];
        const qualifierSummary: Record<Region, string[]> = {
          Europe: [],
          America: [],
          Africa: [],
          Asia: [],
          Oceania: [],
        };

        for (const region in state.currentTournament.qualifiers) {
          const groups = state.currentTournament.qualifiers[region as Region];
          groups.forEach((group) => {
            const sorted = sortStandings(group.standings);
            const topTwo = sorted.slice(0, 2).map((s) => s.teamId);
            qualifiedTeamIds.push(...topTwo);
            qualifierSummary[region as Region].push(...topTwo);
          });
        }

        // Get qualified Team objects (with skills) for smart seeding
        const qualifiedTeams = state.teams.filter((team) =>
          qualifiedTeamIds.includes(team.id)
        );

        // Use smart seeding to create balanced World Cup groups
        const worldCupGroups = createSmartWorldCupDraw(qualifiedTeams);

        const updatedTournament = {
          ...state.currentTournament,
          worldCup: {
            groups: worldCupGroups,
            knockout: initializeKnockoutBracket(),
            qualifiedTeamIds,
          },
          isQualifiersComplete: true,
        };

        updateTournamentInState(set, get, updatedTournament);
      },

      advanceToKnockout: () => {
        const state = get();
        if (!state.currentTournament?.worldCup) return;

        // Check if all group matches are complete
        if (!areGroupsComplete(state.currentTournament.worldCup.groups)) {
          alert('Please complete all World Cup group matches first!');
          return;
        }

        // Generate Round of 32 (for 64 teams from 16 groups)
        const roundOf32 = generateRoundOf32(state.currentTournament.worldCup.groups, state.teams);

        const updatedTournament = {
          ...state.currentTournament,
          worldCup: {
            ...state.currentTournament.worldCup,
            knockout: {
              ...state.currentTournament.worldCup.knockout,
              roundOf32,
            },
          },
        };

        updateTournamentInState(set, get, updatedTournament);
      },

      generateDrawAndFixtures: () => {
        console.log('🎲 generateDrawAndFixtures called');
        const state = get();

        if (!state.currentTournament) {
          console.error('❌ No current tournament');
          return;
        }

        console.log('✅ Current tournament:', state.currentTournament.id, state.currentTournament.name);

        // Check if any match has been played
        if (state.currentTournament.hasAnyMatchPlayed) {
          console.warn('⚠️ Cannot regenerate - matches already played');
          alert('Cannot regenerate draw after matches have been played!');
          return;
        }

        console.log('📊 Restoring team skills...');
        // Restore original skills if available
        let restoredTeams = state.teams;
        if (state.currentTournament.originalSkills) {
          restoredTeams = state.teams.map((team) => ({
            ...team,
            skill: state.currentTournament!.originalSkills![team.id] ?? team.skill,
          }));
          console.log(`✅ Restored ${restoredTeams.length} team skills`);
        }

        const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia', 'Oceania'];
        let updatedQualifiers: Record<Region, Group[]> = state.currentTournament.qualifiers;

        console.log('🌍 Processing regions:', regions);

        // Check if qualifiers are empty (tournament created but groups not saved to DB)
        const totalGroups = regions.reduce((sum, region) => sum + (updatedQualifiers[region]?.length || 0), 0);
        if (totalGroups === 0) {
          console.warn('⚠️ No qualifier groups found, regenerating empty groups...');
          updatedQualifiers = {
            Europe: createQualifierGroups(restoredTeams, 'Europe'),
            America: createQualifierGroups(restoredTeams, 'America'),
            Africa: createQualifierGroups(restoredTeams, 'Africa'),
            Asia: createQualifierGroups(restoredTeams, 'Asia'),
            Oceania: createQualifierGroups(restoredTeams, 'Oceania'),
          };
          console.log(`✅ Generated ${regions.reduce((sum, region) => sum + updatedQualifiers[region].length, 0)} empty groups`);
        }

        // Process each region
        regions.forEach((region) => {
          const groups = updatedQualifiers[region];
          const regionTeams = restoredTeams.filter((t) => t.region === region);

          console.log(`  📍 ${region}: ${groups.length} groups, ${regionTeams.length} teams`);

          // Perform draw for this region
          const drawnGroups = performDraw(groups, regionTeams);
          console.log(`  ✅ ${region}: Draw performed`);

          // Generate matches for each group
          const groupsWithMatches = drawnGroups.map((group) => {
            if (!group.letterAssignments) return group;

            const matches = generateGroupMatches(group.id, group.letterAssignments);
            const standings = initializeStandings(group.teamIds);

            return {
              ...group,
              matches,
              standings,
            };
          });

          console.log(`  ✅ ${region}: Generated matches for ${groupsWithMatches.length} groups`);
          updatedQualifiers[region] = groupsWithMatches;
        });

        console.log('💾 Creating updated tournament object...');
        // Update tournament
        const updatedTournament = {
          ...state.currentTournament,
          qualifiers: updatedQualifiers,
          hasAnyMatchPlayed: false,
        };

        console.log('✅ Updated tournament created');
        console.log('  Total groups:', Object.values(updatedQualifiers).flat().length);

        set({ teams: restoredTeams });
        console.log('✅ Teams set in state');

        // Save restored teams to database
        if (state.currentTournament.originalSkills && isSupabaseConfigured()) {
          console.log('💾 Saving restored team skills to database...');
          Promise.all(
            restoredTeams.map(async (team) => {
              try {
                await teamsService.updateTeam(team.id, { skill: team.skill });
              } catch (error) {
                console.error(`Error restoring skill for team ${team.id}:`, error);
              }
            })
          ).catch((error) => console.error('Error saving team skills:', error));
        }

        // Save groups and matches to normalized schema
        console.log('💾 Checking if Supabase is configured...');
        console.log('  isSupabaseConfigured():', isSupabaseConfigured());

        if (isSupabaseConfigured()) {
          console.log('✅ Supabase is configured, saving to normalized schema...');
          console.log(`  Regions to save: ${regions.length}`);

          Promise.all(
            regions.map(async (region) => {
              console.log(`  💾 Saving ${region}...`);
              console.log(`    Tournament ID: ${state.currentTournament!.id}`);
              console.log(`    Groups count: ${updatedQualifiers[region].length}`);

              try {
                await normalizedQualifiersService.createQualifierGroups(
                  state.currentTournament!.id,
                  region,
                  updatedQualifiers[region]
                );
                console.log(`  ✅ Saved ${region} qualifier groups to database`);
              } catch (error) {
                console.error(`  ❌ Error saving ${region} qualifier groups:`, error);
                throw error; // Re-throw to be caught by Promise.all
              }
            })
          )
            .then(() => {
              console.log('✅ All regions saved successfully');
            })
            .catch((error) => {
              console.error('❌ Error saving qualifier groups:', error);
            });
        } else {
          console.warn('⚠️ Supabase not configured - data will not be persisted');
        }

        console.log('💾 Calling updateTournamentInState...');
        updateTournamentInState(set, get, updatedTournament);
        console.log('✅ generateDrawAndFixtures completed');
      },

      simulateKnockoutMatch: (matchId: string) => {
        const state = get();
        if (!state.currentTournament?.worldCup) return;

        const knockout = state.currentTournament.worldCup.knockout;

        // Find match in any round
        let targetMatch: KnockoutMatch | undefined;
        let roundName: 'roundOf32' | 'roundOf16' | 'quarterFinals' | 'semiFinals' | 'thirdPlace' | 'final' | undefined;

        // Check each round
        if (knockout.roundOf32.some((m) => m.id === matchId)) {
          targetMatch = knockout.roundOf32.find((m) => m.id === matchId);
          roundName = 'roundOf32';
        } else if (knockout.roundOf16.some((m) => m.id === matchId)) {
          targetMatch = knockout.roundOf16.find((m) => m.id === matchId);
          roundName = 'roundOf16';
        } else if (knockout.quarterFinals.some((m) => m.id === matchId)) {
          targetMatch = knockout.quarterFinals.find((m) => m.id === matchId);
          roundName = 'quarterFinals';
        } else if (knockout.semiFinals.some((m) => m.id === matchId)) {
          targetMatch = knockout.semiFinals.find((m) => m.id === matchId);
          roundName = 'semiFinals';
        } else if (knockout.thirdPlace?.id === matchId) {
          targetMatch = knockout.thirdPlace;
          roundName = 'thirdPlace';
        } else if (knockout.final?.id === matchId) {
          targetMatch = knockout.final;
          roundName = 'final';
        }

        if (!targetMatch || !roundName || targetMatch.isPlayed) return;

        // Get teams
        const homeTeam = state.teams.find((t) => t.id === targetMatch.homeTeamId);
        const awayTeam = state.teams.find((t) => t.id === targetMatch.awayTeamId);

        if (!homeTeam || !awayTeam) return;

        // Simulate with penalties
        const result = simulateMatchWithPenalties(homeTeam.skill, awayTeam.skill);

        // Determine winner
        let winnerId: string;
        let loserId: string;

        if (result.homeScore > result.awayScore) {
          winnerId = homeTeam.id;
          loserId = awayTeam.id;
        } else if (result.awayScore > result.homeScore) {
          winnerId = awayTeam.id;
          loserId = homeTeam.id;
        } else if (result.penalties) {
          if (result.penalties.homeScore > result.penalties.awayScore) {
            winnerId = homeTeam.id;
            loserId = awayTeam.id;
          } else {
            winnerId = awayTeam.id;
            loserId = homeTeam.id;
          }
        } else {
          return; // Should not happen
        }

        // Update match
        const updatedMatch: KnockoutMatch = {
          ...targetMatch,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isPlayed: true,
          winnerId,
          loserId,
          penalties: result.penalties,
        };

        // Calculate new skills
        const newHomeSkill = updateTeamSkill(homeTeam.skill, result.homeSkillChange);
        const newAwaySkill = updateTeamSkill(awayTeam.skill, result.awaySkillChange);

        // Log to Supabase
        if (isSupabaseConfigured()) {
          matchHistoryService
            .createMatch({
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              stage: 'world-cup-knockout',
              groupName: targetMatch.round,
              region: undefined,
              tournamentId: state.currentTournament.id,
              homeSkillBefore: homeTeam.skill,
              awaySkillBefore: awayTeam.skill,
              homeSkillAfter: newHomeSkill,
              awaySkillAfter: newAwaySkill,
              homeSkillChange: result.homeSkillChange,
              awaySkillChange: result.awaySkillChange,
              metadata: result.penalties ? { penalties: result.penalties } : undefined,
            })
            .catch((error) => console.error('Error logging knockout match:', error));

          teamsService
            .batchUpdateTeams([
              { id: homeTeam.id, skill: newHomeSkill },
              { id: awayTeam.id, skill: newAwaySkill },
            ])
            .catch((error) => console.error('Error updating team skills:', error));
        }

        // Update teams
        const updatedTeams = state.teams.map((team) => {
          if (team.id === homeTeam.id) return { ...team, skill: newHomeSkill };
          if (team.id === awayTeam.id) return { ...team, skill: newAwaySkill };
          return team;
        });

        // Update knockout bracket
        const updatedKnockout = { ...knockout };

        if (roundName === 'roundOf32') {
          updatedKnockout.roundOf32 = knockout.roundOf32.map((m) =>
            m.id === matchId ? updatedMatch : m
          );
        } else if (roundName === 'roundOf16') {
          updatedKnockout.roundOf16 = knockout.roundOf16.map((m) =>
            m.id === matchId ? updatedMatch : m
          );
        } else if (roundName === 'quarterFinals') {
          updatedKnockout.quarterFinals = knockout.quarterFinals.map((m) =>
            m.id === matchId ? updatedMatch : m
          );
        } else if (roundName === 'semiFinals') {
          updatedKnockout.semiFinals = knockout.semiFinals.map((m) =>
            m.id === matchId ? updatedMatch : m
          );
        } else if (roundName === 'thirdPlace') {
          updatedKnockout.thirdPlace = updatedMatch;
        } else if (roundName === 'final') {
          updatedKnockout.final = updatedMatch;
        }

        // Check if we need to generate next round
        if (roundName === 'roundOf32' && isRoundComplete(updatedKnockout.roundOf32)) {
          updatedKnockout.roundOf16 = generateRoundOf16(updatedKnockout.roundOf32, state.teams);
        } else if (roundName === 'roundOf16' && isRoundComplete(updatedKnockout.roundOf16)) {
          updatedKnockout.quarterFinals = generateQuarterFinals(updatedKnockout.roundOf16);
        } else if (roundName === 'quarterFinals' && isRoundComplete(updatedKnockout.quarterFinals)) {
          updatedKnockout.semiFinals = generateSemiFinals(updatedKnockout.quarterFinals);
        } else if (roundName === 'semiFinals' && isRoundComplete(updatedKnockout.semiFinals)) {
          updatedKnockout.thirdPlace = generateThirdPlaceMatch(updatedKnockout.semiFinals);
          updatedKnockout.final = generateFinal(updatedKnockout.semiFinals);
        } else if (roundName === 'final' && updatedKnockout.final?.winnerId) {
          // Tournament complete! Set champion
          const thirdPlaceWinner = updatedKnockout.thirdPlace?.winnerId;
          const fourthPlace = updatedKnockout.thirdPlace?.loserId;

          const updatedTournament = {
            ...state.currentTournament,
            worldCup: {
              ...state.currentTournament.worldCup,
              knockout: updatedKnockout,
              champion: updatedKnockout.final.winnerId,
              runnerUp: updatedKnockout.final.loserId,
              thirdPlace: thirdPlaceWinner,
              fourthPlace,
            },
          };

          set({ teams: updatedTeams });
          updateTournamentInState(set, get, updatedTournament);
          return;
        }

        const updatedTournament = {
          ...state.currentTournament,
          worldCup: {
            ...state.currentTournament.worldCup,
            knockout: updatedKnockout,
          },
        };

        set({ teams: updatedTeams });
        updateTournamentInState(set, get, updatedTournament);
      },
      };
    },
    {
      name: 'football-tournament-storage',
      version: 7, // Incremented: Multi-tournament support
      partialize: (state) => ({
        // Persist tournament list and selected ID in localStorage
        // Full tournament state also saved to Supabase for real persistence
        // Teams will always be loaded fresh from database
        tournaments: state.tournaments,
        currentTournamentId: state.currentTournamentId,
      }),
    }
  )
);
