import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { TeamNameTooltip } from '../ui/TeamNameTooltip';
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
        <Loader className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (champions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-shadow-retro">
            <Trophy className="w-5 h-5 text-gold" />
            HIGH SCORES
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-grass-soft" />
            <p className="font-arcade text-xs text-white text-shadow-retro uppercase mb-2">
              No hay torneos completados
            </p>
            <p className="text-sm text-grass-soft mt-2">
              Los campeones aparecerán aquí cuando completes un torneo
            </p>
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
          <CardTitle className="flex items-center gap-2 text-shadow-retro">
            <Trophy className="w-5 h-5 text-gold" />
            HIGH SCORES
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-grass-soft">
            Todos los campeones de los mundiales completados ({champions.length} {champions.length === 1 ? 'torneo' : 'torneos'})
          </p>
        </CardContent>
      </Card>

      {/* Champions Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-grass-dark">
                <tr className="border-b-2 border-grass">
                  <th className="text-left py-3 px-2 sm:px-4 font-arcade text-[10px] text-gold uppercase">
                    Pos
                  </th>
                  <th className="text-left py-3 px-2 sm:px-4 font-arcade text-[10px] text-gold uppercase">
                    Año
                  </th>
                  <th className="text-left py-3 px-4 font-arcade text-[10px] text-gold uppercase">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-gold" />
                      <span>Campeón</span>
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-arcade text-[10px] text-gold uppercase">
                    <div className="flex items-center gap-2">
                      <Medal className="w-4 h-4 text-grass-soft" />
                      <span>Subcampeón</span>
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-arcade text-[10px] text-gold uppercase">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-grass-soft" />
                      <span>3° Lugar</span>
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-arcade text-[10px] text-gold uppercase">
                    4° Lugar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-grass">
                {champions.map((champion, index) => {
                  const isMostRecent = index === 0;
                  return (
                    <tr key={champion.tournamentId} className="hover:bg-grass/40 transition-colors">
                      <td className="py-4 px-2 sm:px-4">
                        <span className="font-terminal text-white tabular-nums">{index + 1}</span>
                      </td>
                      <td className="py-4 px-2 sm:px-4">
                        <span className="font-terminal text-led tabular-nums text-lg">{champion.year}</span>
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell
                          team={champion.champion}
                          size={32}
                          onOpen={openTeamProfile}
                          blink={isMostRecent}
                        />
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell team={champion.runnerUp} size={24} onOpen={openTeamProfile} />
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell team={champion.thirdPlace} size={24} onOpen={openTeamProfile} />
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell team={champion.fourthPlace} size={24} onOpen={openTeamProfile} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ChampionCellProps {
  team: Team | null;
  size: 24 | 32;
  onOpen: (team: Team) => void;
  blink?: boolean;
}

function ChampionCell({ team, size, onOpen, blink = false }: ChampionCellProps) {
  if (!team) {
    return <span className="text-grass-soft italic">-</span>;
  }

  return (
    <div className={`flex items-center gap-2 ${blink ? 'blink' : ''}`}>
      <TeamFlag
        teamId={team.id}
        teamName={team.name}
        flagUrl={team.flag}
        size={size}
        onClick={() => onOpen(team)}
        clickable
      />
      <TeamNameTooltip teamName={team.name}>
        <span className="font-arcade text-[10px] uppercase">{team.id.toUpperCase()}</span>
      </TeamNameTooltip>
    </div>
  );
}
