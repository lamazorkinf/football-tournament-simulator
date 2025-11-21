import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { ClickableTeamName } from '../ui/ClickableTeamName';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { Trophy, Medal, Award, Loader } from 'lucide-react';
import { db } from '../../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { Team } from '../../types';

interface ChampionData {
  year: number;
  tournamentId: string;
  champion: Team | null;
  runnerUp: Team | null;
  thirdPlace: Team | null;
  fourthPlace: Team | null;
}

export function ChampionsHistory() {
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [loading, setLoading] = useState(true);
  const { openTeamProfile } = useTeamProfile();

  useEffect(() => {
    loadChampionsHistory();
  }, []);

  const loadChampionsHistory = async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      // Query tournaments with champion data
      const { data: tournaments, error: tournamentsError } = await db
        .tournaments_new()
        .select('*')
        .eq('status', 'completed')
        .order('year', { ascending: false });

      if (tournamentsError) throw tournamentsError;

      if (!tournaments || tournaments.length === 0) {
        setChampions([]);
        setLoading(false);
        return;
      }

      // Get all unique team IDs
      const teamIds = new Set<string>();
      tournaments.forEach((t: any) => {
        if (t.champion_team_id) teamIds.add(t.champion_team_id);
        if (t.runner_up_team_id) teamIds.add(t.runner_up_team_id);
        if (t.third_place_team_id) teamIds.add(t.third_place_team_id);
        if (t.fourth_place_team_id) teamIds.add(t.fourth_place_team_id);
      });

      // Fetch all teams
      const { data: teams, error: teamsError } = await db
        .teams()
        .select('*')
        .in('id', Array.from(teamIds));

      if (teamsError) throw teamsError;

      // Map team IDs to team objects
      const teamsMap = new Map<string, Team>();
      teams?.forEach((team: any) => {
        teamsMap.set(team.id, {
          id: team.id,
          name: team.name,
          flag: team.flag,
          region: team.region,
          skill: team.skill,
        });
      });

      // Build champions data
      const championsData: ChampionData[] = tournaments.map((t: any) => ({
        year: t.year,
        tournamentId: t.id,
        champion: t.champion_team_id ? teamsMap.get(t.champion_team_id) || null : null,
        runnerUp: t.runner_up_team_id ? teamsMap.get(t.runner_up_team_id) || null : null,
        thirdPlace: t.third_place_team_id ? teamsMap.get(t.third_place_team_id) || null : null,
        fourthPlace: t.fourth_place_team_id ? teamsMap.get(t.fourth_place_team_id) || null : null,
      }));

      setChampions(championsData);
    } catch (error) {
      console.error('Error loading champions history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (champions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Historial de Campeones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No hay torneos completados</p>
            <p className="text-sm mt-2">Los campeones aparecerán aquí cuando completes un torneo</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Historial de Campeones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Todos los campeones de los mundiales completados ({champions.length} {champions.length === 1 ? 'torneo' : 'torneos'})
          </p>
        </CardContent>
      </Card>

      {/* Champions Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-3 px-4 font-bold text-gray-700">Año</th>
                  <th className="text-left py-3 px-4 font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      <span>Campeón</span>
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      <Medal className="w-4 h-4 text-gray-400" />
                      <span>Subcampeón</span>
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-600" />
                      <span>3° Lugar</span>
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-bold text-gray-700">4° Lugar</th>
                </tr>
              </thead>
              <tbody>
                {champions.map((champion) => (
                  <tr
                    key={champion.tournamentId}
                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <span className="font-bold text-lg text-gray-900">{champion.year}</span>
                    </td>
                    <td className="py-4 px-4">
                      {champion.champion ? (
                        <div className="flex items-center gap-3">
                          <TeamFlag
                            teamId={champion.champion.id}
                            teamName={champion.champion.name}
                            flagUrl={champion.champion.flag}
                            size={32}
                            onClick={() => openTeamProfile(champion.champion!)}
                            clickable
                          />
                          <ClickableTeamName team={champion.champion}>
                            <span className="font-semibold text-gray-900">{champion.champion.name}</span>
                          </ClickableTeamName>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {champion.runnerUp ? (
                        <div className="flex items-center gap-3">
                          <TeamFlag
                            teamId={champion.runnerUp.id}
                            teamName={champion.runnerUp.name}
                            flagUrl={champion.runnerUp.flag}
                            size={24}
                            onClick={() => openTeamProfile(champion.runnerUp!)}
                            clickable
                          />
                          <ClickableTeamName team={champion.runnerUp}>
                            <span className="text-gray-800">{champion.runnerUp.name}</span>
                          </ClickableTeamName>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {champion.thirdPlace ? (
                        <div className="flex items-center gap-3">
                          <TeamFlag
                            teamId={champion.thirdPlace.id}
                            teamName={champion.thirdPlace.name}
                            flagUrl={champion.thirdPlace.flag}
                            size={24}
                            onClick={() => openTeamProfile(champion.thirdPlace!)}
                            clickable
                          />
                          <ClickableTeamName team={champion.thirdPlace}>
                            <span className="text-gray-700">{champion.thirdPlace.name}</span>
                          </ClickableTeamName>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {champion.fourthPlace ? (
                        <div className="flex items-center gap-3">
                          <TeamFlag
                            teamId={champion.fourthPlace.id}
                            teamName={champion.fourthPlace.name}
                            flagUrl={champion.fourthPlace.flag}
                            size={24}
                            onClick={() => openTeamProfile(champion.fourthPlace!)}
                            clickable
                          />
                          <ClickableTeamName team={champion.fourthPlace}>
                            <span className="text-gray-600">{champion.fourthPlace.name}</span>
                          </ClickableTeamName>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
