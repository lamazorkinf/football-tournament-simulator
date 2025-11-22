import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TournamentState, Team, Region, Tournament, Group, Match, KnockoutMatch, WorldCupGroup } from '../types';
import teamsData from '../data/teams.json';
import { nanoid } from 'nanoid';
import {
  createQualifierGroups,
  updateStandings,
  sortStandings,
  getBestRunnersUp,
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
import { teamTournamentPerformanceService } from '../services/teamTournamentPerformanceService';
import { isSupabaseConfigured } from '../lib/supabase';
import { performDraw, generateGroupMatches, initializeStandings } from '../utils/drawSystem';
import { useProgressStore } from './useProgressStore';

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
        isSavingMatch: false,

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
        const progress = useProgressStore.getState();
        progress.startProgress(`Creando Mundial ${year}`, 6);

        try {
          progress.updateProgress('Actualizando rankings de equipos...', 1);
          const teamsWithTiers = updateTeamsTiers(get().teams);

          // Capture original skills at tournament start
          const originalSkills: Record<string, number> = {};
          teamsWithTiers.forEach((team) => {
            originalSkills[team.id] = team.skill;
          });

          progress.updateProgress('Creando grupos de clasificatorios...', 2);
          const qualifiers: Record<Region, Group[]> = {
            Europe: createQualifierGroups(teamsWithTiers, 'Europe'),
            America: createQualifierGroups(teamsWithTiers, 'America'),
            Africa: createQualifierGroups(teamsWithTiers, 'Africa'),
            Asia: createQualifierGroups(teamsWithTiers, 'Asia'),
          };

          progress.updateProgress('Inicializando torneo...', 3);
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
              progress.updateProgress('Guardando torneo en base de datos...', 4);
              await adaptiveTournamentService.saveTournament(tournament);
              console.log(`Tournament ${year} created and saved to database`);

              // Save empty qualifier groups to database
              progress.updateProgress('Guardando grupos de clasificatorios...', 5);
              const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
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
              progress.resetProgress();
              throw error;
            }
          }

          progress.updateProgress('Finalizando...', 6);
          progress.completeProgress();

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
        } catch (error) {
          progress.resetProgress();
          throw error;
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
        const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
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

      simulateMatch: async (matchId: string, groupId: string, stage: 'qualifier' | 'world-cup') => {
        const state = get();
        if (!state.currentTournament) return;

        // Prevent simultaneous match simulations
        if (state.isSavingMatch) {
          console.warn('⚠️ Another match is being saved. Please wait...');
          return;
        }

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

        // Set saving state
        set({ isSavingMatch: true });

        // Get team skills
        const homeTeam = state.teams.find((t) => t.id === match.homeTeamId);
        const awayTeam = state.teams.find((t) => t.id === match.awayTeamId);

        if (!homeTeam || !awayTeam) return;

        // Simulate the match (disable home advantage for World Cup)
        const disableHomeAdvantage = stage === 'world-cup';
        const result = simulateGroupMatch(homeTeam.skill, awayTeam.skill, disableHomeAdvantage);

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

        // Save to database and WAIT for completion
        try {
          if (isSupabaseConfigured()) {
            // Update match result in normalized schema
            if (stage === 'qualifier') {
              await normalizedQualifiersService.updateMatchResult(matchId, result.homeScore, result.awayScore);
            } else {
              await normalizedWorldCupService.updateGroupMatchResult(matchId, result.homeScore, result.awayScore);
            }

            // Save in parallel: match history and team skills
            await Promise.all([
              matchHistoryService.createMatch({
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
              }),
              teamsService.batchUpdateTeams([
                { id: homeTeam.id, skill: newHomeSkill },
                { id: awayTeam.id, skill: newAwaySkill },
              ])
            ]);

            console.log('✅ Match data saved successfully');
          }
        } catch (error) {
          console.error('❌ Error saving match data:', error);
          // Even if save fails, continue with state update
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
        const updatedGroup = {
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
          ].map((g) => (g.id === groupId ? updatedGroup as Group : g));

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
              g.id === groupId ? updatedGroup as WorldCupGroup : g
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

        // Reset saving state after everything is done
        set({ isSavingMatch: false });
      },

      simulateAllGroupMatches: async (groupId: string, stage: 'qualifier' | 'world-cup') => {
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

        // Simulate all unplayed matches sequentially to ensure proper saving
        for (const match of targetGroup.matches) {
          if (!match.isPlayed) {
            await get().simulateMatch(match.id, groupId, stage);
          }
        }
      },

      advanceToWorldCupWithManualDraw: (worldCupGroups: WorldCupGroup[]) => {
        const state = get();
        if (!state.currentTournament) {
          console.error('❌ No current tournament found');
          return;
        }

        console.log('🌍 Starting advanceToWorldCupWithManualDraw...');

        // Get qualified team IDs from the groups
        const qualifiedTeamIds: string[] = [];
        worldCupGroups.forEach((group) => {
          qualifiedTeamIds.push(...group.teamIds);
        });

        console.log(`✅ Total qualified teams: ${qualifiedTeamIds.length}`);

        if (qualifiedTeamIds.length !== 64) {
          console.error(`❌ Expected 64 qualified teams, got ${qualifiedTeamIds.length}`);
          alert(`Error: Only ${qualifiedTeamIds.length} teams qualified instead of 64.`);
          return;
        }

        const updatedTournament = {
          ...state.currentTournament,
          worldCup: {
            groups: worldCupGroups,
            knockout: initializeKnockoutBracket(),
            qualifiedTeamIds,
          },
          isQualifiersComplete: true,
        };

        // Save World Cup groups and matches to database
        if (isSupabaseConfigured()) {
          normalizedWorldCupService
            .createWorldCupGroups(state.currentTournament.id, worldCupGroups)
            .then(() => {
              console.log('✅ World Cup groups and matches saved to database');
            })
            .catch((error: unknown) => {
              console.error('❌ Error saving World Cup groups to database:', error);
            });
        }

        updateTournamentInState(set, get, updatedTournament);
      },

      advanceToWorldCup: async () => {
        const state = get();
        const progress = useProgressStore.getState();

        if (!state.currentTournament) {
          console.error('❌ No current tournament found');
          return;
        }

        console.log('🌍 Starting advanceToWorldCup...');

        try {
          progress.startProgress('Avanzando al Mundial', 5);

          progress.updateProgress('Verificando partidos de clasificatorios...', 1);
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
            console.error('❌ Not all qualifier matches are complete');
            progress.resetProgress();
            alert('Please complete all qualifier matches before advancing to the World Cup!');
            return;
          }

            console.log('✅ All qualifier matches complete');

          progress.updateProgress('Recolectando equipos clasificados...', 2);
          // Get all first-place teams + 22 best second-place teams
          const qualifiedTeamIds: string[] = [];
          const qualifierSummary: Record<Region, string[]> = {
            Europe: [],
            America: [],
            Africa: [],
            Asia: [],
          };

          // Collect all groups from all regions
          const allGroups: Group[] = [];
          for (const region in state.currentTournament.qualifiers) {
            const groups = state.currentTournament.qualifiers[region as Region];
            allGroups.push(...groups);
          }

          console.log(`📊 Total groups in qualifiers: ${allGroups.length}`);

          // Get all first-place teams (42 teams from 42 groups)
          for (const region in state.currentTournament.qualifiers) {
            const groups = state.currentTournament.qualifiers[region as Region];
            groups.forEach((group) => {
              const sorted = sortStandings(group.standings, state.teams);
              if (sorted.length === 0) {
                console.error(`❌ Group ${group.name} has no standings!`);
                return;
              }
              const firstPlace = sorted[0].teamId;
              qualifiedTeamIds.push(firstPlace);
              qualifierSummary[region as Region].push(firstPlace);
            });
          }

          console.log(`✅ First place teams: ${qualifiedTeamIds.length}`);

          // Get the 22 best second-place teams across all regions (42 + 22 = 64 total)
          const bestRunnersUp = getBestRunnersUp(allGroups, 22, state.teams);
          qualifiedTeamIds.push(...bestRunnersUp);

          console.log(`✅ Best runners-up: ${bestRunnersUp.length}`);

          // Add best runners-up to their respective regions in the summary
          for (const runnerId of bestRunnersUp) {
            const team = state.teams.find(t => t.id === runnerId);
            if (team?.region) {
              qualifierSummary[team.region].push(runnerId);
            }
          }

          // Get qualified Team objects (with skills) for smart seeding
          const qualifiedTeams = state.teams.filter((team) =>
            qualifiedTeamIds.includes(team.id)
          );

          console.log(`✅ Total qualified teams: ${qualifiedTeamIds.length} (42 winners + 22 best runners-up)`);

          if (qualifiedTeams.length !== 64) {
            console.error(`❌ Expected 64 qualified teams, got ${qualifiedTeams.length}`);
            progress.resetProgress();
            alert(`Error: Only ${qualifiedTeams.length} teams qualified instead of 64. Please check the qualifier results.`);
            return;
          }

          progress.updateProgress('Creando sorteo del Mundial...', 3);
          // Use smart seeding to create balanced World Cup groups
          console.log('🎲 Creating World Cup draw...');
          const worldCupGroups = createSmartWorldCupDraw(qualifiedTeams);
          console.log(`✅ Created ${worldCupGroups.length} World Cup groups`);

          const updatedTournament = {
            ...state.currentTournament,
            worldCup: {
              groups: worldCupGroups,
              knockout: initializeKnockoutBracket(),
              qualifiedTeamIds,
            },
            isQualifiersComplete: true,
          };

          progress.updateProgress('Guardando grupos en base de datos...', 4);
          // Save World Cup groups and matches to database
          if (isSupabaseConfigured()) {
            await normalizedWorldCupService.createWorldCupGroups(state.currentTournament.id, worldCupGroups);
            console.log('✅ World Cup groups and matches saved to database');
          }

          progress.updateProgress('Finalizando...', 5);
          updateTournamentInState(set, get, updatedTournament);

          console.log('✅ Advanced to World Cup successfully');
          console.log(`📊 Qualified teams by region:`, qualifierSummary);

          progress.completeProgress();
        } catch (error) {
          progress.resetProgress();
          console.error('❌ Error in advanceToWorldCup:', error);
          throw error;
        }
      },

      advanceToKnockout: async () => {
        const state = get();
        const progress = useProgressStore.getState();

        if (!state.currentTournament?.worldCup) return;

        try {
          progress.startProgress('Generando fase eliminatoria', 4);

          progress.updateProgress('Verificando fase de grupos...', 1);
          // Check if all group matches are complete
          if (!areGroupsComplete(state.currentTournament.worldCup.groups)) {
            progress.resetProgress();
            alert('Please complete all World Cup group matches first!');
            return;
          }

          console.log('🏆 Advancing to knockout stage...');

          progress.updateProgress('Generando bracket de Round of 32...', 2);
          // Generate Round of 32 (for 64 teams from 16 groups)
          const roundOf32 = generateRoundOf32(state.currentTournament.worldCup.groups, state.teams);

          console.log(`✅ Generated ${roundOf32.length} Round of 32 matches`);

          progress.updateProgress('Guardando partidos en base de datos...', 3);
          // Save knockout matches to database
          if (isSupabaseConfigured()) {
            try {
              console.log('💾 Saving knockout matches to database...');
              await Promise.all(
                roundOf32.map(match =>
                  normalizedWorldCupService.createKnockoutMatch(state.currentTournament!.id, match)
                )
              );
              console.log('✅ Knockout matches saved to database');
            } catch (error) {
              console.error('❌ Error saving knockout matches:', error);
              progress.resetProgress();
              alert('Error al guardar los partidos de playoffs. Por favor intenta de nuevo.');
              return;
            }
          }

          progress.updateProgress('Finalizando...', 4);
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
          console.log('✅ Advanced to knockout stage successfully');

          progress.completeProgress();
        } catch (error) {
          progress.resetProgress();
          console.error('❌ Error in advanceToKnockout:', error);
          throw error;
        }
      },

      regenerateWorldCupDrawAndFixtures: async () => {
        console.log('🏆 regenerateWorldCupDrawAndFixtures called');
        const state = get();

        if (!state.currentTournament?.worldCup) {
          console.error('❌ No World Cup found');
          alert('No World Cup found to regenerate!');
          return;
        }

        console.log('✅ Current tournament:', state.currentTournament.id, state.currentTournament.name);

        // Check if any World Cup match has been played
        const hasWorldCupMatchPlayed = state.currentTournament.worldCup.groups.some(group =>
          group.matches.some(m => m.isPlayed)
        );

        const hasKnockoutMatchPlayed =
          state.currentTournament.worldCup.knockout.roundOf32.some(m => m.isPlayed) ||
          state.currentTournament.worldCup.knockout.roundOf16.some(m => m.isPlayed) ||
          state.currentTournament.worldCup.knockout.quarterFinals.some(m => m.isPlayed) ||
          state.currentTournament.worldCup.knockout.semiFinals.some(m => m.isPlayed) ||
          (state.currentTournament.worldCup.knockout.thirdPlace?.isPlayed || false) ||
          (state.currentTournament.worldCup.knockout.final?.isPlayed || false);

        if (hasWorldCupMatchPlayed || hasKnockoutMatchPlayed) {
          console.warn('⚠️ Cannot regenerate - World Cup matches already played');
          alert('Cannot regenerate World Cup draw after matches have been played!');
          return;
        }

        console.log('🗑️ Deleting existing World Cup data from database...');
        // Delete existing World Cup data from database (WAIT for completion)
        if (isSupabaseConfigured()) {
          try {
            await Promise.all([
              normalizedWorldCupService.deleteWorldCupData(state.currentTournament.id),
              normalizedWorldCupService.deleteWorldCupMatchHistory(state.currentTournament.id)
            ]);
            console.log('✅ World Cup data deleted from database');
          } catch (error: unknown) {
            console.error('❌ Error deleting World Cup data:', error);
            alert('Error al eliminar datos del Mundial. Por favor, intenta de nuevo.');
            return;
          }
        }

        console.log('🎲 Regenerating World Cup draw...');

        // Recalculate qualified teams from qualifier results
        // This is more reliable than reading from worldCup.qualifiedTeamIds
        console.log('📊 Recalculating qualified teams from qualifier results...');

        const qualifiedTeamIds: string[] = [];
        const allGroups: Group[] = [];

        // Collect all qualifier groups
        for (const region in state.currentTournament.qualifiers) {
          const groups = state.currentTournament.qualifiers[region as Region];
          allGroups.push(...groups);
        }

        console.log(`📊 Total qualifier groups: ${allGroups.length}`);

        // Get all first-place teams (42 teams from 42 groups)
        for (const region in state.currentTournament.qualifiers) {
          const groups = state.currentTournament.qualifiers[region as Region];
          groups.forEach((group) => {
            const sorted = sortStandings(group.standings, state.teams);
            if (sorted.length === 0) {
              console.error(`❌ Group ${group.name} has no standings!`);
              return;
            }
            const firstPlace = sorted[0].teamId;
            qualifiedTeamIds.push(firstPlace);
          });
        }

        console.log(`✅ First place teams: ${qualifiedTeamIds.length}`);

        // Get the 22 best second-place teams
        const bestRunnersUp = getBestRunnersUp(allGroups, 22, state.teams);
        qualifiedTeamIds.push(...bestRunnersUp);

        console.log(`✅ Best runners-up: ${bestRunnersUp.length}`);
        console.log(`✅ Total qualified teams: ${qualifiedTeamIds.length} (42 first + 22 best second)`);

        // Validate we have exactly 64 teams
        if (qualifiedTeamIds.length !== 64) {
          console.error(`❌ Expected 64 qualified teams, found ${qualifiedTeamIds.length}`);
          alert(`Error: Se esperaban 64 equipos clasificados pero se encontraron ${qualifiedTeamIds.length}.`);
          return;
        }

        const qualifiedTeams = state.teams.filter((team) =>
          qualifiedTeamIds.includes(team.id)
        );

        // Create new World Cup groups
        const worldCupGroups = createSmartWorldCupDraw(qualifiedTeams);
        console.log(`✅ Created ${worldCupGroups.length} new World Cup groups`);

        // Save new World Cup groups to database BEFORE updating state
        if (isSupabaseConfigured()) {
          try {
            await normalizedWorldCupService.createWorldCupGroups(state.currentTournament.id, worldCupGroups);
            console.log('✅ New World Cup groups and matches saved to database');
          } catch (error: unknown) {
            console.error('❌ Error saving new World Cup groups:', error);
            alert('Error al guardar los nuevos grupos del Mundial. Por favor, intenta de nuevo.');
            return;
          }
        }

        // Update tournament with new groups, recalculated qualifiedTeamIds, and reset knockout
        const updatedTournament = {
          ...state.currentTournament,
          worldCup: {
            ...state.currentTournament.worldCup,
            groups: worldCupGroups,
            knockout: initializeKnockoutBracket(), // Reset knockout bracket
            qualifiedTeamIds, // Use the recalculated qualified teams
            champion: undefined,
            runnerUp: undefined,
            thirdPlace: undefined,
            fourthPlace: undefined,
          },
        };

        console.log('💾 Updating tournament state...');
        updateTournamentInState(set, get, updatedTournament);
        console.log('✅ regenerateWorldCupDrawAndFixtures completed');
      },

      generateDrawAndFixtures: async () => {
        console.log('🎲 generateDrawAndFixtures called');
        const state = get();
        const progress = useProgressStore.getState();

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

        const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
        const totalSteps = 3 + regions.length + 1;
        let currentStep = 0;

        try {
          progress.startProgress('Generando sorteo y fixtures', totalSteps);

          progress.updateProgress('Restaurando habilidades de equipos...', ++currentStep);
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

          progress.updateProgress('Verificando grupos...', ++currentStep);
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
              };
            console.log(`✅ Generated ${regions.reduce((sum, region) => sum + updatedQualifiers[region].length, 0)} empty groups`);
          }

          // Process each region
          for (const region of regions) {
          progress.updateProgress(`Generando fixtures para ${region}...`, ++currentStep);
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
        }

          progress.updateProgress('Guardando datos en la base de datos...', ++currentStep);
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
            await Promise.all(
              restoredTeams.map(async (team) => {
                try {
                  await teamsService.updateTeam(team.id, { skill: team.skill });
                } catch (error) {
                  console.error(`Error restoring skill for team ${team.id}:`, error);
                }
              })
            );
          }

          // Save groups and matches to normalized schema
          console.log('💾 Checking if Supabase is configured...');
          console.log('  isSupabaseConfigured():', isSupabaseConfigured());

          if (isSupabaseConfigured()) {
            console.log('✅ Supabase is configured, saving to normalized schema...');
            console.log(`  Regions to save: ${regions.length}`);

            await Promise.all(
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
                  throw error;
                }
              })
            );
            console.log('✅ All regions saved successfully');
          } else {
            console.warn('⚠️ Supabase not configured - data will not be persisted');
          }

          progress.updateProgress('Finalizando...', ++currentStep);
          console.log('💾 Calling updateTournamentInState...');
          updateTournamentInState(set, get, updatedTournament);
          console.log('✅ generateDrawAndFixtures completed');

          progress.completeProgress();
        } catch (error) {
          progress.resetProgress();
          console.error('❌ Error in generateDrawAndFixtures:', error);
          throw error;
        }
      },

      regenerateKnockoutStage: async () => {
        const state = get();
        const progress = useProgressStore.getState();

        if (!state.currentTournament?.worldCup) {
          console.error('❌ No World Cup found');
          alert('Error: No hay Mundial para regenerar.');
          return;
        }

        try {
          progress.startProgress('Regenerando fase eliminatoria', 5);

          progress.updateProgress('Verificando partidos...', 1);
          // Check if any knockout match has been played
          const hasKnockoutMatchPlayed =
            state.currentTournament.worldCup.knockout.roundOf32.some(m => m.isPlayed) ||
            state.currentTournament.worldCup.knockout.roundOf16.some(m => m.isPlayed) ||
            state.currentTournament.worldCup.knockout.quarterFinals.some(m => m.isPlayed) ||
            state.currentTournament.worldCup.knockout.semiFinals.some(m => m.isPlayed) ||
            (state.currentTournament.worldCup.knockout.thirdPlace?.isPlayed || false) ||
            (state.currentTournament.worldCup.knockout.final?.isPlayed || false);

          if (hasKnockoutMatchPlayed) {
            console.error('❌ Cannot regenerate - knockout matches already played');
            progress.resetProgress();
            alert('Error: No se puede regenerar porque ya se han jugado partidos de playoffs.');
            return;
          }

          // Check if all group matches are complete
          if (!areGroupsComplete(state.currentTournament.worldCup.groups)) {
            progress.resetProgress();
            alert('Error: Debes completar todos los partidos de la fase de grupos primero.');
            return;
          }

          console.log('🔄 Regenerating knockout stage...');

          progress.updateProgress('Eliminando datos anteriores...', 2);
          // Delete existing knockout data from database
          if (isSupabaseConfigured()) {
            try {
              console.log('🗑️ Deleting existing knockout data...');
              await normalizedWorldCupService.deleteKnockoutData(state.currentTournament.id);
              console.log('✅ Knockout data deleted');
            } catch (error) {
              console.error('❌ Error deleting knockout data:', error);
              progress.resetProgress();
              alert('Error al eliminar datos de playoffs. Por favor intenta de nuevo.');
              return;
            }
          }

          progress.updateProgress('Generando nuevo bracket...', 3);
          // Generate new Round of 32 based on current group standings
          console.log('🎲 Generating new Round of 32...');
          const roundOf32 = generateRoundOf32(state.currentTournament.worldCup.groups, state.teams);
          console.log(`✅ Generated ${roundOf32.length} Round of 32 matches`);

          progress.updateProgress('Guardando partidos en base de datos...', 4);
          // Save new knockout matches to database
          if (isSupabaseConfigured()) {
            try {
              console.log('💾 Saving knockout matches to database...');
              await Promise.all(
                roundOf32.map(match =>
                  normalizedWorldCupService.createKnockoutMatch(state.currentTournament!.id, match)
                )
              );
              console.log('✅ Knockout matches saved to database');
            } catch (error) {
              console.error('❌ Error saving knockout matches:', error);
              progress.resetProgress();
              alert('Error al guardar los partidos de playoffs. Por favor intenta de nuevo.');
              return;
            }
          }

          progress.updateProgress('Finalizando...', 5);
          // Update state with new knockout bracket
          const updatedTournament = {
            ...state.currentTournament,
            worldCup: {
              ...state.currentTournament.worldCup,
              knockout: {
                roundOf32,
                roundOf16: [],
                quarterFinals: [],
                semiFinals: [],
                thirdPlace: null,
                final: null,
              },
              champion: undefined,
              runnerUp: undefined,
              thirdPlace: undefined,
              fourthPlace: undefined,
            },
          };

          updateTournamentInState(set, get, updatedTournament);
          console.log('✅ Knockout stage regenerated successfully');

          progress.completeProgress();
        } catch (error) {
          progress.resetProgress();
          console.error('❌ Error in regenerateKnockoutStage:', error);
          throw error;
        }
      },

      simulateKnockoutMatch: async (matchId: string) => {
        const state = get();
        if (!state.currentTournament?.worldCup) return;

        // Prevent simultaneous match simulations
        if (state.isSavingMatch) {
          console.warn('⚠️ Another match is being saved. Please wait...');
          return;
        }

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

        // Set saving state
        set({ isSavingMatch: true });

        // Get teams
        const homeTeam = state.teams.find((t) => t.id === targetMatch.homeTeamId);
        const awayTeam = state.teams.find((t) => t.id === targetMatch.awayTeamId);

        if (!homeTeam || !awayTeam) {
          set({ isSavingMatch: false });
          return;
        }

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

        // Update match result and log to Supabase
        if (isSupabaseConfigured()) {
          try {
            // Update the match result in matches_new table (AWAIT)
            await normalizedWorldCupService.updateKnockoutMatchResult(
              matchId,
              result.homeScore,
              result.awayScore,
              result.penalties,
              winnerId
            );
            console.log('✅ Knockout match result updated in matches_new');

            // Log to match history (parallel operations)
            await Promise.all([
              matchHistoryService.createMatch({
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
              }),
              teamsService.batchUpdateTeams([
                { id: homeTeam.id, skill: newHomeSkill },
                { id: awayTeam.id, skill: newAwaySkill },
              ])
            ]);
            console.log('✅ Match history and team skills updated');
          } catch (error) {
            console.error('❌ Error saving knockout match data:', error);
          }
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

        // Check if we need to generate next round and save to database
        if (roundName === 'roundOf32' && isRoundComplete(updatedKnockout.roundOf32)) {
          updatedKnockout.roundOf16 = generateRoundOf16(updatedKnockout.roundOf32, state.teams);

          // Save R16 matches to database
          if (isSupabaseConfigured() && state.currentTournament) {
            try {
              await Promise.all(
                updatedKnockout.roundOf16.map(match =>
                  normalizedWorldCupService.createKnockoutMatch(state.currentTournament!.id, match)
                )
              );
              console.log('✅ R16 matches saved to database');
            } catch (error) {
              console.error('❌ Error saving R16 matches:', error);
            }
          }
        } else if (roundName === 'roundOf16' && isRoundComplete(updatedKnockout.roundOf16)) {
          updatedKnockout.quarterFinals = generateQuarterFinals(updatedKnockout.roundOf16);

          // Save QF matches to database
          if (isSupabaseConfigured() && state.currentTournament) {
            try {
              await Promise.all(
                updatedKnockout.quarterFinals.map(match =>
                  normalizedWorldCupService.createKnockoutMatch(state.currentTournament!.id, match)
                )
              );
              console.log('✅ QF matches saved to database');
            } catch (error) {
              console.error('❌ Error saving QF matches:', error);
            }
          }
        } else if (roundName === 'quarterFinals' && isRoundComplete(updatedKnockout.quarterFinals)) {
          updatedKnockout.semiFinals = generateSemiFinals(updatedKnockout.quarterFinals);

          // Save SF matches to database
          if (isSupabaseConfigured() && state.currentTournament) {
            try {
              await Promise.all(
                updatedKnockout.semiFinals.map(match =>
                  normalizedWorldCupService.createKnockoutMatch(state.currentTournament!.id, match)
                )
              );
              console.log('✅ SF matches saved to database');
            } catch (error) {
              console.error('❌ Error saving SF matches:', error);
            }
          }
        } else if (roundName === 'semiFinals' && isRoundComplete(updatedKnockout.semiFinals)) {
          updatedKnockout.thirdPlace = generateThirdPlaceMatch(updatedKnockout.semiFinals);
          updatedKnockout.final = generateFinal(updatedKnockout.semiFinals);

          // Save third place and final matches to database
          if (isSupabaseConfigured() && state.currentTournament) {
            try {
              const matchesToSave = [];
              if (updatedKnockout.thirdPlace) {
                matchesToSave.push(
                  normalizedWorldCupService.createKnockoutMatch(state.currentTournament.id, updatedKnockout.thirdPlace)
                );
              }
              if (updatedKnockout.final) {
                matchesToSave.push(
                  normalizedWorldCupService.createKnockoutMatch(state.currentTournament.id, updatedKnockout.final)
                );
              }
              await Promise.all(matchesToSave);
              console.log('✅ Third place and final matches saved to database');
            } catch (error) {
              console.error('❌ Error saving third place/final matches:', error);
            }
          }
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

          // Calculate performance for all teams now that tournament is complete
          if (isSupabaseConfigured() && state.currentTournament) {
            console.log('🏆 Tournament completed! Calculating all team performances...');
            teamTournamentPerformanceService
              .calculateAllPerformancesForTournament(state.currentTournament.id)
              .then(() => console.log('✅ All team performances calculated'))
              .catch((error) => console.error('❌ Error calculating performances:', error));
          }

          // Reset saving state
          set({ isSavingMatch: false });
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

        // Reset saving state
        set({ isSavingMatch: false });
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
