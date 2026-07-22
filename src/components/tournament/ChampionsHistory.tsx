import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { TeamNameTooltip } from '../ui/TeamNameTooltip';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { Trophy, Medal, Award, Loader } from 'lucide-react';
import { db } from '../../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { CycleStatePayload } from '../../core/cycle';
import type { Region, Team } from '../../types';

const REGION_LABELS: Record<Region, string> = {
  Europe: 'Europa',
  America: 'América',
  Africa: 'África',
  Asia: 'Asia',
};

// Orden de las competiciones dentro de un mismo año (Mundial primero, luego los
// continentales por región y por último la Copa Confederaciones).
const CONTINENTAL_ORDER: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

type CompetitionKind = 'world-cup' | 'continental' | 'confederations';

interface ChampionRow {
  key: string;
  year: number;
  competition: string;
  kind: CompetitionKind;
  order: number;
  champion: Team | null;
  runnerUp: Team | null;
  thirdPlace: Team | null;
  fourthPlace: Team | null;
}

export function ChampionsHistory() {
  const [rows, setRows] = useState<ChampionRow[]>([]);
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
      // 1. Torneos (ciclos) completados: aportan el campeón del Mundial.
      const { data: tournaments, error: tournamentsError } = await db
        .tournaments_new()
        .select('*')
        .eq('status', 'completed')
        .order('year', { ascending: false });

      if (tournamentsError) throw tournamentsError;

      if (!tournaments || tournaments.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 2. Estado del ciclo (continental + confederaciones) de esos torneos.
      const tournamentIds = tournaments.map((t: any) => t.id);
      const { data: cycleStates, error: cycleStatesError } = await db
        .tournament_cycle_state()
        .select('tournament_id, state')
        .in('tournament_id', tournamentIds);

      if (cycleStatesError) throw cycleStatesError;

      const stateByTournament = new Map<string, CycleStatePayload>();
      cycleStates?.forEach((row: any) => {
        if (row.state) stateByTournament.set(row.tournament_id, row.state);
      });

      // 3. Reunir todos los IDs de equipos referenciados en cualquier competición.
      const teamIds = new Set<string>();
      const addId = (id?: string | null) => {
        if (id) teamIds.add(id);
      };

      tournaments.forEach((t: any) => {
        addId(t.champion_team_id);
        addId(t.runner_up_team_id);
        addId(t.third_place_team_id);
        addId(t.fourth_place_team_id);
      });

      stateByTournament.forEach((state) => {
        Object.values(state.continental?.brackets ?? {}).forEach((bracket) => {
          addId(bracket.championId);
          addId(bracket.runnerUpId);
          addId(bracket.thirdPlaceId);
          addId(bracket.thirdPlace?.loserId); // 4° puesto = perdedor del partido por el 3°
        });
        const confed = state.confederationsCup;
        addId(confed?.championId);
        addId(confed?.knockout?.final?.loserId);
        addId(confed?.knockout?.thirdPlace?.winnerId);
        addId(confed?.knockout?.thirdPlace?.loserId); // 4° puesto
      });

      // 4. Traer los equipos de una sola vez.
      const teamsMap = new Map<string, Team>();
      if (teamIds.size > 0) {
        const { data: teams, error: teamsError } = await db
          .teams()
          .select('*')
          .in('id', Array.from(teamIds));

        if (teamsError) throw teamsError;

        teams?.forEach((team: any) => {
          teamsMap.set(team.id, {
            id: team.id,
            name: team.name,
            flag: team.flag,
            region: team.region,
            skill: team.skill,
          });
        });
      }

      const teamOf = (id?: string | null): Team | null =>
        id ? teamsMap.get(id) ?? null : null;

      // 5. Construir una fila por competición con campeón definido.
      const allRows: ChampionRow[] = [];

      tournaments.forEach((t: any) => {
        // Mundial
        if (t.champion_team_id) {
          allRows.push({
            key: `${t.id}-world-cup`,
            year: t.year,
            competition: 'Mundial',
            kind: 'world-cup',
            order: 0,
            champion: teamOf(t.champion_team_id),
            runnerUp: teamOf(t.runner_up_team_id),
            thirdPlace: teamOf(t.third_place_team_id),
            fourthPlace: teamOf(t.fourth_place_team_id),
          });
        }

        const state = stateByTournament.get(t.id);
        if (!state) return;

        // Continentales (uno por región)
        CONTINENTAL_ORDER.forEach((region, idx) => {
          const bracket = state.continental?.brackets?.[region];
          if (!bracket?.championId) return;
          allRows.push({
            key: `${t.id}-continental-${region}`,
            year: t.year,
            competition: `Continental · ${REGION_LABELS[region]}`,
            kind: 'continental',
            order: 1 + idx,
            champion: teamOf(bracket.championId),
            runnerUp: teamOf(bracket.runnerUpId),
            thirdPlace: teamOf(bracket.thirdPlaceId),
            fourthPlace: teamOf(bracket.thirdPlace?.loserId),
          });
        });

        // Copa Confederaciones
        const confed = state.confederationsCup;
        if (confed?.championId) {
          allRows.push({
            key: `${t.id}-confederations`,
            year: t.year,
            competition: 'Copa Confederaciones',
            kind: 'confederations',
            order: 5,
            champion: teamOf(confed.championId),
            runnerUp: teamOf(confed.knockout?.final?.loserId),
            thirdPlace: teamOf(confed.knockout?.thirdPlace?.winnerId),
            fourthPlace: teamOf(confed.knockout?.thirdPlace?.loserId),
          });
        }
      });

      // Año descendente y, dentro del año, por orden de competición.
      allRows.sort((a, b) => b.year - a.year || a.order - b.order);

      setRows(allRows);
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

  if (rows.length === 0) {
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

  const totalYears = new Set(rows.map((r) => r.year)).size;

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
            Campeones de todas las competiciones ({rows.length}{' '}
            {rows.length === 1 ? 'título' : 'títulos'} en {totalYears}{' '}
            {totalYears === 1 ? 'año' : 'años'})
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
                    Año
                  </th>
                  <th className="text-left py-3 px-2 sm:px-4 font-arcade text-[10px] text-gold uppercase">
                    Competición
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
                {rows.map((row, index) => {
                  const isMostRecent = index === 0;
                  return (
                    <tr key={row.key} className="hover:bg-grass/40 transition-colors">
                      <td className="py-4 px-2 sm:px-4">
                        <span className="font-terminal text-led tabular-nums text-lg">{row.year}</span>
                      </td>
                      <td className="py-4 px-2 sm:px-4">
                        <span className="font-arcade text-[10px] text-white uppercase whitespace-nowrap">
                          {row.competition}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell
                          team={row.champion}
                          size={32}
                          onOpen={openTeamProfile}
                          blink={isMostRecent}
                        />
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell team={row.runnerUp} size={24} onOpen={openTeamProfile} />
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell team={row.thirdPlace} size={24} onOpen={openTeamProfile} />
                      </td>
                      <td className="py-4 px-4">
                        <ChampionCell team={row.fourthPlace} size={24} onOpen={openTeamProfile} />
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
