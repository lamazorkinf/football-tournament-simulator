import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TournamentState, Team, Region, Tournament, Cycle, Group, Match, KnockoutMatch, WorldCupGroup } from '../types';
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
import { simulateMatch as simulateGroupMatch, simulateMatchWithPenalties, updateTeamSkill, getStageImportance } from '../core/engine';
import {
  toCycle,
  ensureCycleFields,
  reconstructCycle,
  drawContinentalStage,
  recordContinentalMatch,
  drawConfederationsStage,
  recordConfedGroupMatch,
  recordConfedKnockoutMatch,
  type KnockoutResult,
  type GroupResult,
} from '../core/cycle';
import { isMatchPlayable } from '../core/calendar';
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
import { cycleStateService } from '../services/cycleStateService';
import { normalizedQualifiersService } from '../services/normalizedQualifiersService';
import { normalizedWorldCupService } from '../services/normalizedWorldCupService';
import { isSupabaseConfigured } from '../lib/supabase';
import { performDraw, generateGroupMatches, initializeStandings } from '../utils/drawSystem';
import { useProgressStore } from './useProgressStore';
import { useToastStore } from './useToastStore';
import { supabase } from '../lib/supabase';
import { getEngineConfig } from './useConfigStore';

// Regresión hacia el skill base entre temporadas: evita que la caminata
// aleatoria del Elo disperse los ratings indefinidamente tras muchas
// temporadas, sin impedir ascensos/descensos graduales
const SEASON_REGRESSION = 0.03;
const BASE_SKILLS: Record<string, number> = Object.fromEntries(
  (teamsData as Team[]).map((team) => [team.id, team.skill])
);

/**
 * Fusiona un torneo cargado con la lista ya existente en vez de reemplazarla:
 * la lista puede venir rehidratada desde localStorage con otros torneos.
 */
const mergeTournament = (existing: Cycle[], incoming: Cycle): Cycle[] => {
  const index = existing.findIndex((t) => t.id === incoming.id);
  if (index === -1) return [incoming, ...existing];
  const next = [...existing];
  next[index] = incoming;
  return next;
};

/**
 * initializeTournament se dispara desde un efecto que depende de
 * currentTournament, que sigue siendo null durante todo el await. Sin este
 * candado, un re-render intermedio lanzaba una segunda inicialización y se
 * creaban dos torneos distintos (dos nanoid, dos INSERT en Supabase).
 */
let initializationInFlight: Promise<void> | null = null;

const applySeasonRegression = (teams: Team[]): Team[] =>
  teams.map((team) => {
    const base = BASE_SKILLS[team.id];
    if (base === undefined) return team; // equipos creados por el usuario, sin baseline
    const skill = Math.round((team.skill + SEASON_REGRESSION * (base - team.skill)) * 100) / 100;
    return { ...team, skill };
  });

// Helper function to update tournament in state and database
const updateTournamentInState = (set: any, get: any, updatedTournament: Tournament, skipDbSave = false) => {
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

  // Save to database (skip if in batch mode or explicitly disabled)
  const state = get();
  if (isSupabaseConfigured() && !skipDbSave && !state.isBatchProcessing) {
    adaptiveTournamentService
      .saveTournament(updatedTournament)
      .catch((error) => console.error('Error auto-saving tournament:', error));
    cycleStateService
      .saveCycleState(ensureCycleFields(updatedTournament))
      .catch((error) => console.error('Error auto-saving cycle state:', error));
  }
};

/**
 * Peso Elo del partido según su etapa/ronda, leyendo la config actual del
 * engine. `round` solo aplica a partidos de knockout (los de grupo lo dejan
 * en undefined → getStageImportance usa el peso de la etapa sin ronda).
 */
function importanceFor(stage: string | undefined, round: KnockoutMatch['round'] | undefined): number {
  return getStageImportance(stage, round, getEngineConfig());
}

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => {
      return {
        teams: teamsData as Team[],
        tournaments: [],
        currentTournamentId: null,
        currentTournament: null,
        isSavingMatch: false,
        isBatchProcessing: false,

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
        if (initializationInFlight) return initializationInFlight;

        initializationInFlight = (async () => {
        // Si la rehidratación ya dejó un torneo activo, no hay nada que inicializar.
        if (get().currentTournament) return;

        // Try to load only the latest tournament from database (fast load)
        if (isSupabaseConfigured()) {
          try {
            // Load only the most recent tournament (optimized - single tournament load)
            const latestTournament = await adaptiveTournamentService.getLatestTournament();
            if (latestTournament) {
              console.log(`Loaded latest tournament: ${latestTournament.name}`);
              // Cargar el estado del ciclo persistido; si no hay row, es un torneo
              // legacy (previo al ciclo) → reconstructCycle deriva un calendario
              // de fase Mundial en vez de ofrecer "Sortear Continental".
              const cycleState = await cycleStateService.loadCycleState(latestTournament.id);
              const latestCycle = reconstructCycle(latestTournament, cycleState);
              set((state) => ({
                // Fusionar, no reemplazar: descartar la lista rehidratada borraba
                // el historial local de torneos y lo volvía a persistir truncado.
                tournaments: mergeTournament(state.tournaments, latestCycle),
                currentTournamentId: latestCycle.id,
                currentTournament: latestCycle,
              }));
              return;
            }
          } catch (error) {
            console.error('Error loading tournament from database:', error);
          }
        }

        // La base no tiene torneos, pero puede haberlos rehidratados localmente.
        const rehydrated = get().tournaments;
        if (rehydrated.length > 0) {
          const selected =
            rehydrated.find((t) => t.id === get().currentTournamentId) ?? rehydrated[0];
          console.log(`Restaurado torneo local: ${selected.name}`);
          set({ currentTournamentId: selected.id, currentTournament: selected });
          return;
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

        const tournament: Cycle = toCycle({
          id: nanoid(),
          name: 'World Cup 2026',
          year: 2026,
          qualifiers,
          worldCup: null,
          isQualifiersComplete: false,
          hasAnyMatchPlayed: false,
          originalSkills,
        });

        set((state) => ({
          teams: teamsWithTiers,
          tournaments: mergeTournament(state.tournaments, tournament),
          currentTournamentId: tournament.id,
          currentTournament: tournament
        }));

        // Save new tournament to database
        if (isSupabaseConfigured()) {
          adaptiveTournamentService
            .saveTournament(tournament)
            .catch((error) => console.error('Error saving new tournament:', error));
          cycleStateService
            .saveCycleState(tournament)
            .catch((error) => console.error('Error saving new cycle state:', error));
        }
        })();

        try {
          await initializationInFlight;
        } finally {
          initializationInFlight = null;
        }
      },

      createNewTournament: async (year: number) => {
        const progress = useProgressStore.getState();
        progress.startProgress(`Creando Mundial ${year}`, 6);

        try {
          progress.updateProgress('Actualizando rankings de equipos...', 1);
          // Nueva temporada: los skills regresan un 3% hacia su valor base
          const regressedTeams = applySeasonRegression(get().teams);
          const teamsWithTiers = updateTeamsTiers(regressedTeams);

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
          const tournament: Cycle = toCycle({
            id: nanoid(),
            name: `World Cup ${year}`,
            year,
            qualifiers,
            worldCup: null,
            isQualifiersComplete: false,
            hasAnyMatchPlayed: false,
            originalSkills,
          });

          // Se añade el torneo a la lista, pero los skills regresados NO se
          // aplican todavía al pool global: si el usuario decide no cambiarse,
          // alterarían las simulaciones del torneo que está jugando ahora.
          // El torneo nuevo conserva su snapshot en originalSkills, que
          // generateDrawAndFixtures restaura cuando se genera su sorteo.
          set((state) => ({
            tournaments: [tournament, ...state.tournaments],
          }));

          // Save new tournament to database
          if (isSupabaseConfigured()) {
            try {
              progress.updateProgress('Guardando torneo en base de datos...', 4);
              await adaptiveTournamentService.saveTournament(tournament);
              await cycleStateService.saveCycleState(tournament);
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
            // Recién ahora se aplica la regresión de skills al pool global.
            set({
              teams: teamsWithTiers,
              currentTournamentId: tournament.id,
              currentTournament: tournament
            });

            if (isSupabaseConfigured()) {
              teamsService
                .batchUpdateTeams(teamsWithTiers.map((t) => ({ id: t.id, skill: t.skill })))
                .catch((error) => console.error('Error saving regressed skills:', error));
            }
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

      recalculateTournamentPerformances: async (tournamentId: string) => {
        if (!isSupabaseConfigured()) {
          useToastStore.getState().error('Supabase no está configurado');
          return;
        }

        const tournament = get().tournaments.find(t => t.id === tournamentId);
        if (!tournament) {
          useToastStore.getState().error('Torneo no encontrado');
          return;
        }

        if (!tournament.worldCup?.champion) {
          useToastStore.getState().warning('Solo se pueden recalcular los rendimientos de torneos completados');
          return;
        }

        if (!confirm(`¿Recalcular rendimientos para el torneo "${tournament.name}"?\n\nEsto eliminará y recreará todos los registros de rendimiento de los equipos para este torneo.`)) {
          return;
        }

        const toast = useToastStore.getState();

        // El toast de progreso no expira solo: hay que cerrarlo explícitamente
        // al terminar, o se acumulan uno por torneo completado.
        let pendingToastId: string | null = null;

        try {
          console.log(`🔄 Recalculando rendimientos para torneo ${tournamentId}...`);

          pendingToastId = toast.info('Calculando rendimientos en segundo plano...', 0);

          // Call the Edge Function
          const { data, error } = await supabase.functions.invoke('calculate-tournament-performances', {
            body: { tournamentId }
          });

          if (error) {
            console.error('❌ Error en Edge Function:', error);
            toast.error('Error al recalcular rendimientos');
            return;
          }

          console.log('✅ Edge Function ejecutada:', data);
          toast.success(`Rendimientos recalculados: ${data.teamsProcessed} equipos procesados`);
        } catch (error) {
          console.error('❌ Error recalculando rendimientos:', error);
          toast.error('Error al recalcular rendimientos');
        } finally {
          if (pendingToastId) toast.removeToast(pendingToastId);
        }
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

        // Restaurar los skills iniciales del torneo. Sin esto, el "reinicio"
        // arrancaba con el Elo acumulado por los partidos que se acaban de
        // borrar, así que las simulaciones nuevas quedaban sesgadas.
        const originalSkills = state.currentTournament.originalSkills;
        if (originalSkills) {
          const restoredTeams = state.teams.map((team) =>
            originalSkills[team.id] !== undefined
              ? { ...team, skill: originalSkills[team.id] }
              : team
          );

          set({ teams: updateTeamsTiers(restoredTeams) });

          if (isSupabaseConfigured()) {
            try {
              await teamsService.batchUpdateTeams(
                restoredTeams.map((team) => ({ id: team.id, skill: team.skill }))
              );
              console.log('✅ Skills restaurados a los valores de inicio del torneo');
            } catch (error) {
              console.error('❌ Error restaurando skills:', error);
            }
          }
        }

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

            const updatedTournament = {
              ...state.currentTournament,
              qualifiers,
              isQualifiersComplete: false,
            };

            return {
              teams: updatedTeams,
              currentTournament: updatedTournament,
              // También hay que actualizar la entrada en `tournaments`: es la
              // que se persiste y la que lee selectTournament. Si no, cambiar
              // de torneo y volver revertía los grupos regenerados.
              tournaments: state.tournaments.map((t) =>
                t.id === updatedTournament.id ? updatedTournament : t
              ),
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

        if (!homeTeam || !awayTeam) {
          // Salir sin resetear el flag dejaba isSavingMatch en true para
          // siempre, deshabilitando todos los botones de simular.
          console.warn(`⚠️ Equipos no encontrados para el partido ${matchId}`);
          set({ isSavingMatch: false });
          return;
        }

        // Simulate the match (disable home advantage for World Cup)
        const disableHomeAdvantage = stage === 'world-cup';
        const stageKey = stage === 'qualifier' ? 'qualifier' : 'world-cup-group';
        const importance = importanceFor(stageKey, undefined);
        const result = simulateGroupMatch(homeTeam.skill, awayTeam.skill, disableHomeAdvantage, importance);

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
        const updatedGroupMatches = targetGroup.matches.map((m, i) =>
          i === matchIndex ? updatedMatch : m
        );
        const updatedStandings = updateStandings(targetGroup.standings, updatedMatch);
        const sortedStandings = sortStandings(updatedStandings, updatedTeams, updatedGroupMatches);

        // Update the group
        const updatedGroup = {
          ...targetGroup,
          matches: updatedGroupMatches,
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

      simulateMatchdayBatch: async (matches) => {
        const state = get();
        if (!state.currentTournament) return;

        // Prevent simultaneous batch processing
        if (state.isBatchProcessing || state.isSavingMatch) {
          console.warn('⚠️ Batch processing or saving already in progress. Please wait...');
          return;
        }

        console.log(`🚀 Starting batch simulation for ${matches.length} matches...`);

        // Set batch processing flag
        set({ isBatchProcessing: true });

        try {
          // Track all changes
          const matchHistoryEntries: any[] = [];
          // Resultados a persistir, cada uno atado a SU matchId. No puede
          // derivarse por índice de `matches`: el bucle saltea partidos y los
          // índices se desalinearían (ver comentario en el guardado).
          const matchResultUpdates: Array<{
            matchId: string;
            stage: 'qualifier' | 'world-cup';
            homeScore: number;
            awayScore: number;
          }> = [];
          const teamSkillUpdates: Map<string, number> = new Map();
          const updatedMatchesByGroup: Map<string, { groupId: string; stage: 'qualifier' | 'world-cup'; region?: Region; matches: Match[] }> = new Map();

          // Get progress store for UI updates
          const progress = useProgressStore.getState();
          progress.startProgress('Simulando jornada completa', matches.length);

          // Process each match in memory
          for (let i = 0; i < matches.length; i++) {
            const { matchId, groupId, stage, groupName, region } = matches[i];

            // Update progress
            progress.updateProgress(`Simulando partido ${i + 1}/${matches.length}`, i + 1);

            // Find the group and match
            let targetGroup: Group | undefined;

            if (stage === 'qualifier') {
              // Search in qualifiers
              for (const reg in state.currentTournament.qualifiers) {
                const groups = state.currentTournament.qualifiers[reg as Region];
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

            if (!targetGroup) {
              console.warn(`⚠️ Group ${groupId} not found for match ${matchId}`);
              continue;
            }

            const matchIndex = targetGroup.matches.findIndex((m) => m.id === matchId);
            if (matchIndex === -1) {
              console.warn(`⚠️ Match ${matchId} not found in group ${groupId}`);
              continue;
            }

            const match = targetGroup.matches[matchIndex];
            if (match.isPlayed) {
              console.warn(`⚠️ Match ${matchId} already played, skipping`);
              continue;
            }

            // Get current team skills (considering previous updates in this batch)
            const homeTeam = state.teams.find((t) => t.id === match.homeTeamId);
            const awayTeam = state.teams.find((t) => t.id === match.awayTeamId);

            if (!homeTeam || !awayTeam) continue;

            const homeSkill = teamSkillUpdates.get(homeTeam.id) ?? homeTeam.skill;
            const awaySkill = teamSkillUpdates.get(awayTeam.id) ?? awayTeam.skill;

            // Simulate the match
            const disableHomeAdvantage = stage === 'world-cup';
            const batchImportance = importanceFor(stage === 'qualifier' ? 'qualifier' : 'world-cup-group', undefined);
            const result = simulateGroupMatch(homeSkill, awaySkill, disableHomeAdvantage, batchImportance);

            // Update match
            const updatedMatch: Match = {
              ...match,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              isPlayed: true,
            };

            // Calculate new skills
            const newHomeSkill = updateTeamSkill(homeSkill, result.homeSkillChange);
            const newAwaySkill = updateTeamSkill(awaySkill, result.awaySkillChange);

            // Track skill updates
            teamSkillUpdates.set(homeTeam.id, newHomeSkill);
            teamSkillUpdates.set(awayTeam.id, newAwaySkill);

            // Store match history data
            matchHistoryEntries.push({
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              stage: stage === 'qualifier' ? 'qualifier' : 'world-cup-group',
              groupName: groupName,
              region: region,
              tournamentId: state.currentTournament.id,
              homeSkillBefore: homeSkill,
              awaySkillBefore: awaySkill,
              homeSkillAfter: newHomeSkill,
              awaySkillAfter: newAwaySkill,
              homeSkillChange: result.homeSkillChange,
              awaySkillChange: result.awaySkillChange,
            });

            matchResultUpdates.push({
              matchId,
              stage,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
            });

            // Store updated match by group
            const groupKey = `${stage}-${groupId}`;
            if (!updatedMatchesByGroup.has(groupKey)) {
              updatedMatchesByGroup.set(groupKey, {
                groupId,
                stage,
                region,
                matches: [...targetGroup.matches],
              });
            }
            const groupData = updatedMatchesByGroup.get(groupKey)!;
            groupData.matches[matchIndex] = updatedMatch;
          }

          console.log(`✅ Simulated ${matches.length} matches in memory`);

          // Now save everything to database in batch
          if (isSupabaseConfigured()) {
            console.log('💾 Saving batch to database...');

            // Prepare all database operations
            const dbOperations: Promise<any>[] = [];

            // 1. Batch insert match history
            if (matchHistoryEntries.length > 0) {
              dbOperations.push(
                matchHistoryService.createMatchesBatch(matchHistoryEntries)
                  .then(() => console.log(`✅ Saved ${matchHistoryEntries.length} match history entries`))
              );
            }

            // 2. Batch update team skills
            if (teamSkillUpdates.size > 0) {
              const teamUpdates = Array.from(teamSkillUpdates.entries()).map(([id, skill]) => ({
                id,
                skill,
              }));
              dbOperations.push(
                teamsService.batchUpdateTeams(teamUpdates)
                  .then(() => console.log(`✅ Updated ${teamUpdates.length} team skills`))
              );
            }

            // 3. Update match results in normalized schema.
            //
            // Se recorre matchResultUpdates, donde cada resultado lleva su
            // propio matchId. Antes se recorría `matches` y se leía
            // matchHistoryEntries[index] asumiendo que ambos arrays estaban
            // alineados, pero el bucle de simulación hace `continue` (grupo o
            // partido no encontrado, partido ya jugado, equipo inexistente)
            // sin registrar entrada: a partir del primer salto, cada partido
            // se guardaba con el marcador del siguiente.
            const matchUpdatePromises = matchResultUpdates.map(
              ({ matchId, stage, homeScore, awayScore }) => {
                if (stage === 'qualifier') {
                  return normalizedQualifiersService.updateMatchResult(matchId, homeScore, awayScore);
                }
                return normalizedWorldCupService.updateGroupMatchResult(matchId, homeScore, awayScore);
              }
            );
            dbOperations.push(...matchUpdatePromises);

            // Execute all database operations in parallel
            await Promise.allSettled(dbOperations);
            console.log('✅ All database operations completed');
          }

          // Update local state with all changes at once
          const updatedTeams = state.teams.map((team) => {
            const newSkill = teamSkillUpdates.get(team.id);
            return newSkill !== undefined ? { ...team, skill: newSkill } : team;
          });

          // Build updated tournament
          let updatedTournament = { ...state.currentTournament };

          // Update all affected groups
          updatedMatchesByGroup.forEach((groupData) => {
            const { groupId, stage, region, matches: updatedMatches } = groupData;

            // Find the target group
            let targetGroup: Group | undefined;
            if (stage === 'qualifier' && region) {
              targetGroup = updatedTournament.qualifiers[region]?.find(g => g.id === groupId);
            } else if (stage === 'world-cup') {
              targetGroup = updatedTournament.worldCup?.groups.find(g => g.id === groupId) as Group | undefined;
            }

            if (!targetGroup) return;

            // Reset standings to initial state (all zeros) then recalculate from ALL played matches
            const resetStandings = targetGroup.standings.map(s => ({
              ...s,
              played: 0,
              won: 0,
              drawn: 0,
              lost: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              goalDifference: 0,
              points: 0,
            }));

            // Recalculate standings from ALL played matches
            const updatedStandings = updatedMatches
              .filter(m => m.isPlayed)
              .reduce((standings, match) => updateStandings(standings, match), resetStandings);
            const sortedStandings = sortStandings(updatedStandings, updatedTeams, updatedMatches);

            const updatedGroup = {
              ...targetGroup,
              matches: updatedMatches,
              standings: sortedStandings,
            };

            // Update in tournament
            if (stage === 'qualifier' && region) {
              updatedTournament = {
                ...updatedTournament,
                qualifiers: {
                  ...updatedTournament.qualifiers,
                  [region]: updatedTournament.qualifiers[region].map((g) =>
                    g.id === groupId ? updatedGroup as Group : g
                  ),
                },
              };
            } else if (stage === 'world-cup' && updatedTournament.worldCup) {
              updatedTournament = {
                ...updatedTournament,
                worldCup: {
                  ...updatedTournament.worldCup,
                  groups: updatedTournament.worldCup.groups.map((g) =>
                    g.id === groupId ? updatedGroup as WorldCupGroup : g
                  ),
                },
              };
            }
          });

          updatedTournament.hasAnyMatchPlayed = true;

          // Single state update with all changes
          set({ teams: updatedTeams });

          // Save tournament to database (will execute now that isBatchProcessing is about to be false)
          set({ isBatchProcessing: false });
          updateTournamentInState(set, get, updatedTournament);

          console.log(`✅ Batch simulation completed successfully for ${matches.length} matches`);
          progress.completeProgress();

        } catch (error) {
          console.error('❌ Error in batch simulation:', error);
          set({ isBatchProcessing: false });
          // Sin esto el modal de progreso queda abierto para siempre: es un
          // overlay a pantalla completa sin forma de cerrarlo desde la UI.
          useProgressStore.getState().resetProgress();
          throw error;
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
              const sorted = sortStandings(group.standings, state.teams, group.matches);
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
            calendar: { phase: 'wc-groups' as const, matchday: 1 },
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
            calendar: { phase: 'wc-knockout' as const, matchday: 1 },
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
            const sorted = sortStandings(group.standings, state.teams, group.matches);
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
          // Copia: asignar sobre state.currentTournament.qualifiers mutaba el
          // objeto vivo del store, corrompiendo retroactivamente el snapshot
          // guardado en `tournaments` y dejando la misma referencia en el
          // torneo "nuevo" (los memos por identidad no se invalidaban).
          let updatedQualifiers: Record<Region, Group[]> = {
            ...state.currentTournament.qualifiers,
          };

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

        // Actualizar el estado local (con el sorteo) ANTES de persistir. El
        // sorteo ya está calculado en memoria y no debe perderse si la base
        // falla: antes updateTournamentInState corría al final, después del
        // guardado de grupos que hacía throw, así que un fallo de persistencia
        // descartaba todo el sorteo y la UI se quedaba en 0/42. skipDbSave=true
        // porque la persistencia se maneja explícitamente abajo.
        set({ teams: restoredTeams });
        updateTournamentInState(set, get, updatedTournament, true);
        console.log('✅ Estado local actualizado con el sorteo');

          // Persistencia best-effort: un fallo aquí ya no descarta el sorteo.
          if (isSupabaseConfigured()) {
            try {
              // Save restored teams to database
              if (state.currentTournament.originalSkills) {
                await Promise.all(
                  restoredTeams.map((team) =>
                    teamsService
                      .updateTeam(team.id, { skill: team.skill })
                      .catch((e) => console.error(`Error restoring skill ${team.id}:`, e))
                  )
                );
              }

              // Asegurar que el torneo existe en la base ANTES de los grupos:
              // si el torneo viene del localStorage (p.ej. tras cambiar de
              // proyecto Supabase) su id no está en tournaments_new y el insert
              // de grupos violaba la FK (23503). saveTournament hace upsert.
              await adaptiveTournamentService.saveTournament(updatedTournament);

              await Promise.all(
                regions.map(async (region) => {
                  await normalizedQualifiersService.createQualifierGroups(
                    updatedTournament.id,
                    region,
                    updatedQualifiers[region]
                  );
                  console.log(`  ✅ Saved ${region} qualifier groups to database`);
                })
              );
              console.log('✅ All regions saved successfully');
            } catch (error) {
              // No relanzar: el sorteo ya está en el estado local. Solo se avisa
              // de que la persistencia falló.
              console.error('⚠️ Error persistiendo el sorteo (queda en memoria):', error);
              useToastStore
                .getState()
                .warning('El sorteo se generó pero no se pudo guardar en la base de datos.');
            }
          } else {
            console.warn('⚠️ Supabase not configured - data will not be persisted');
          }

          progress.updateProgress('Finalizando...', ++currentStep);
          console.log('✅ generateDrawAndFixtures completed');
          progress.completeProgress();
        } catch (error) {
          progress.resetProgress();
          console.error('❌ Error in generateDrawAndFixtures:', error);
          // No relanzar: handleGenerateDraw no captura, y propagar aquí
          // generaba un "Uncaught (in promise)".
          useToastStore.getState().error('No se pudo generar el sorteo.');
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

        // Simulate with penalties (sede neutral: eliminatorias del Mundial sin ventaja local)
        const koImportance = importanceFor('world-cup-knockout', targetMatch.round);
        const result = simulateMatchWithPenalties(homeTeam.skill, awayTeam.skill, true, koImportance);

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
          // Empate sin penales: no debería ocurrir, pero salir sin resetear el
          // flag bloquearía toda simulación posterior hasta recargar.
          console.warn(`⚠️ Partido de eliminatorias empatado sin penales: ${matchId}`);
          set({ isSavingMatch: false });
          return;
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
          updatedKnockout.roundOf16 = generateRoundOf16(updatedKnockout.roundOf32);

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

            const toast = useToastStore.getState();
            // Toast sin auto-cierre: se retira explícitamente al resolverse,
            // si no se acumula uno por cada Mundial completado en la sesión.
            const pendingToastId = toast.info(
              'Calculando rendimientos del torneo en segundo plano...',
              0
            );

            // Call the Edge Function
            supabase.functions
              .invoke('calculate-tournament-performances', {
                body: { tournamentId: state.currentTournament.id }
              })
              .then(({ data, error }) => {
                if (error) {
                  console.error('❌ Error en Edge Function:', error);
                  toast.error('Error al calcular rendimientos');
                } else {
                  console.log('✅ Edge Function ejecutada:', data);
                  toast.success(`Rendimientos calculados: ${data.teamsProcessed} equipos procesados`);
                }
              })
              .catch((error) => {
                console.error('❌ Error calling Edge Function:', error);
                toast.error('Error al calcular rendimientos');
              })
              .finally(() => toast.removeToast(pendingToastId));
          }

          // Reset saving state
          set({ isSavingMatch: false });
          return;
        } else if (roundName === 'thirdPlace' && updatedKnockout.thirdPlace?.winnerId) {
          // El partido por el tercer puesto puede jugarse DESPUÉS de la final.
          // En ese caso la rama de la final ya corrió leyendo un thirdPlace sin
          // jugar y dejó el podio a medias; sin esta rama, thirdPlace y
          // fourthPlace quedaban undefined de forma permanente.
          const updatedTournament = {
            ...state.currentTournament,
            worldCup: {
              ...state.currentTournament.worldCup,
              knockout: updatedKnockout,
              thirdPlace: updatedKnockout.thirdPlace.winnerId,
              fourthPlace: updatedKnockout.thirdPlace.loserId,
            },
          };

          set({ teams: updatedTeams });
          updateTournamentInState(set, get, updatedTournament);
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

      drawContinental: () => {
        const state = get();
        const cycle = state.currentTournament;
        if (!cycle) return;
        const byRegion: Record<Region, Team[]> = { Europe: [], America: [], Africa: [], Asia: [] };
        for (const t of state.teams) byRegion[t.region].push(t);
        const updated = drawContinentalStage(cycle, byRegion);
        updateTournamentInState(set, get, updated);
      },

      simulateContinentalMatch: async (matchId: string) => {
        const state = get();
        const cycle = state.currentTournament;
        if (!cycle) return;
        if (state.isSavingMatch) return;
        if (!isMatchPlayable(cycle, matchId)) {
          console.warn(`⛔ Continental ${matchId} fuera de jornada.`);
          return;
        }
        // Localizar el match en los brackets:
        const all = Object.values(cycle.continental.brackets).flatMap((b): KnockoutMatch[] => [
          ...b.roundOf64, ...b.roundOf32, ...b.roundOf16, ...b.quarterFinals, ...b.semiFinals,
          ...(b.final ? [b.final] : []),
        ]);
        const match = all.find((m) => m.id === matchId);
        if (!match || match.isPlayed) return;
        const home = state.teams.find((t) => t.id === match.homeTeamId);
        const away = state.teams.find((t) => t.id === match.awayTeamId);
        if (!home || !away) return;

        set({ isSavingMatch: true });
        const importance = importanceFor('continental', match.round);
        const result = simulateMatchWithPenalties(home.skill, away.skill, true, importance);

        // Winner por goles; si empate, por penales.
        let winnerId = home.id, loserId = away.id;
        if (result.homeScore < result.awayScore) { winnerId = away.id; loserId = home.id; }
        else if (result.homeScore === result.awayScore && result.penalties) {
          if (result.penalties.awayScore > result.penalties.homeScore) { winnerId = away.id; loserId = home.id; }
        }
        const newHome = updateTeamSkill(home.skill, result.homeSkillChange);
        const newAway = updateTeamSkill(away.skill, result.awaySkillChange);
        const updatedTeams = state.teams.map((t) =>
          t.id === home.id ? { ...t, skill: newHome } : t.id === away.id ? { ...t, skill: newAway } : t,
        );

        // Persistencia de skills best-effort: no bloquear el estado local con
        // await de red. La persistencia normalizada de continental (bracket)
        // queda para Plan 6; hoy solo se persiste vía el `persist` local.
        if (isSupabaseConfigured()) {
          teamsService
            .batchUpdateTeams([
              { id: home.id, skill: newHome },
              { id: away.id, skill: newAway },
            ])
            .catch((error) => console.error('❌ Error actualizando skills (continental):', error));
        }

        const ko: KnockoutResult = {
          homeScore: result.homeScore, awayScore: result.awayScore, winnerId, loserId,
          penalties: result.penalties,
        };
        const updated = recordContinentalMatch(cycle, matchId, ko);
        set({ teams: updatedTeams });
        updateTournamentInState(set, get, updated);
        set({ isSavingMatch: false });
      },

      drawConfederations: () => {
        const state = get();
        const cycle = state.currentTournament;
        if (!cycle) return;
        if (!cycle.continental.isComplete) {
          console.warn('drawConfederations: la fase continental no está completa.');
          return;
        }
        const updated = drawConfederationsStage(cycle, state.teams);
        updateTournamentInState(set, get, updated);
      },

      simulateConfederationsMatch: async (matchId: string) => {
        const state = get();
        const cycle = state.currentTournament;
        if (!cycle || state.isSavingMatch) return;
        if (!isMatchPlayable(cycle, matchId)) {
          console.warn(`⛔ Confed ${matchId} fuera de jornada.`);
          return;
        }
        const conf = cycle.confederationsCup;
        const groupMatch = conf.groups.flatMap((g) => g.matches).find((m) => m.id === matchId);
        const koMatch = [
          ...conf.knockout.semiFinals,
          ...(conf.knockout.final ? [conf.knockout.final] : []),
          ...(conf.knockout.thirdPlace ? [conf.knockout.thirdPlace] : []),
        ].find((m) => m.id === matchId);
        const match = groupMatch ?? koMatch;
        if (!match || match.isPlayed) return;
        const home = state.teams.find((t) => t.id === match.homeTeamId);
        const away = state.teams.find((t) => t.id === match.awayTeamId);
        if (!home || !away) return;

        set({ isSavingMatch: true });
        const isKo = Boolean(koMatch);
        const importance = importanceFor(isKo ? 'confed-knockout' : 'confed-group', isKo ? (match as KnockoutMatch).round : undefined);
        const result = simulateMatchWithPenalties(home.skill, away.skill, true, importance);
        const newHome = updateTeamSkill(home.skill, result.homeSkillChange);
        const newAway = updateTeamSkill(away.skill, result.awaySkillChange);
        const updatedTeams = state.teams.map((t) =>
          t.id === home.id ? { ...t, skill: newHome } : t.id === away.id ? { ...t, skill: newAway } : t,
        );

        // Persistencia de skills best-effort (ver nota en simulateContinentalMatch).
        if (isSupabaseConfigured()) {
          teamsService
            .batchUpdateTeams([
              { id: home.id, skill: newHome },
              { id: away.id, skill: newAway },
            ])
            .catch((error) => console.error('❌ Error actualizando skills (confed):', error));
        }

        let updated: Cycle;
        if (isKo) {
          let winnerId = home.id, loserId = away.id;
          if (result.homeScore < result.awayScore) { winnerId = away.id; loserId = home.id; }
          else if (result.homeScore === result.awayScore && result.penalties
                   && result.penalties.awayScore > result.penalties.homeScore) { winnerId = away.id; loserId = home.id; }
          updated = recordConfedKnockoutMatch(cycle, matchId, {
            homeScore: result.homeScore, awayScore: result.awayScore, winnerId, loserId, penalties: result.penalties,
          }); // 3 args: recordConfedKnockoutMatch NO recibe teams
        } else {
          const groupResult: GroupResult = { homeScore: result.homeScore, awayScore: result.awayScore };
          updated = recordConfedGroupMatch(cycle, matchId, groupResult, updatedTeams);
        }
        set({ teams: updatedTeams });
        updateTournamentInState(set, get, updated);
        set({ isSavingMatch: false });
      },

      advanceToQualifiers: () => {
        const state = get();
        const cycle = state.currentTournament;
        if (!cycle) return;
        if (!cycle.confederationsCup.isComplete) {
          console.warn('advanceToQualifiers: la Copa Confederaciones no está completa.');
          return;
        }
        const updated: Cycle = { ...cycle, calendar: { phase: 'wc-qualifiers', matchday: 1 } };
        updateTournamentInState(set, get, updated);
      },
      };
    },
    {
      name: 'football-tournament-storage',
      version: 9, // Release del ciclo: descarta saves legacy de localStorage una vez.
      // Storage que tolera errores: setItem puede lanzar QuotaExceededError
      // (cuota de ~5MB) al acumular temporadas, o fallar en modo privado. Sin
      // este try/catch, la excepción rompía la acción que disparó el guardado.
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch (error) {
            console.warn('⚠️ No se pudo persistir el estado en localStorage:', error);
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            /* noop */
          }
        },
      })),
      partialize: (state) => ({
        // Persist tournament list and selected ID in localStorage
        // Full tournament state also saved to Supabase for real persistence
        // Teams will always be loaded fresh from database
        tournaments: state.tournaments,
        currentTournamentId: state.currentTournamentId,
      }),
      // v9: release del ciclo de 4 años. Los saves locales previos son data
      // legacy (torneos sin estado de ciclo persistido en Supabase); se
      // descartan una vez. Desde v9, migrate preserva el shape como antes.
      migrate: (persistedState, version) => {
        if (version < 9) {
          return { tournaments: [], currentTournamentId: null };
        }
        const previous = (persistedState ?? {}) as {
          tournaments?: Tournament[];
          currentTournamentId?: string | null;
        };
        return {
          tournaments: previous.tournaments ?? [],
          currentTournamentId: previous.currentTournamentId ?? null,
        };
      },
      onRehydrateStorage: () => (state) => {
        // currentTournament no se persiste (es derivado), así que hay que
        // reconstruirlo desde currentTournamentId. Sin esto la app arrancaba
        // siempre sin torneo activo y volvía a inicializar desde cero.
        if (!state) return;

        // Backfill defensivo: torneos persistidos antes del ciclo continental
        // no tienen continental/confederationsCup/calendar.
        state.tournaments = state.tournaments.map(ensureCycleFields);

        if (state.currentTournament) return;

        const found =
          state.tournaments.find((t) => t.id === state.currentTournamentId) ??
          state.tournaments[0];

        if (found) {
          const restored = ensureCycleFields(found);
          state.currentTournament = restored;
          state.currentTournamentId = restored.id;
        }
      },
    }
  )
);
