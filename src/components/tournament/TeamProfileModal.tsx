import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, TrendingUp, TrendingDown, Minus, Activity, BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { TeamTournamentHistory } from './TeamTournamentHistory';
import { db } from '../../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { Team } from '../../types';

interface TeamProfileModalProps {
  team: Team;
  onClose: () => void;
}

interface MatchHistoryEntry {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  stage: string;
  groupName: string | null;
  region: string | null;
  tournamentId: string | null;
  homeSkillBefore: number;
  awaySkillBefore: number;
  homeSkillAfter: number;
  awaySkillAfter: number;
  homeSkillChange: number;
  awaySkillChange: number;
  playedAt: string;
  tournamentYear?: number;
  tournamentStage?: string;
}

interface SkillPoint {
  date: string;
  skill: number;
  matchId: string;
}

interface TournamentTitle {
  year: number;
  position: 'champion' | 'runner_up' | 'third_place' | 'fourth_place';
}

interface TeamStats {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  bestWorldCupResult?: {
    position: 'champion' | 'runner_up' | 'third_place' | 'fourth_place';
    year: number;
  };
  biggestVictory?: {
    score: string;
    opponent: string;
    goalDifference: number;
    stage: string;
    tournamentYear: number;
    tournamentStage: string;
  };
  worstDefeat?: {
    score: string;
    opponent: string;
    goalDifference: number;
    stage: string;
    tournamentYear: number;
    tournamentStage: string;
  };
}

export function TeamProfileModal({ team, onClose }: TeamProfileModalProps) {
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [skillEvolution, setSkillEvolution] = useState<SkillPoint[]>([]);
  const [titles, setTitles] = useState<TournamentTitle[]>([]);
  const [stats, setStats] = useState<TeamStats>({
    totalMatches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    winRate: 0,
    avgGoalsFor: 0,
    avgGoalsAgainst: 0,
  });
  const [loading, setLoading] = useState(true);
  const [allTeams, setAllTeams] = useState<Map<string, Team>>(new Map());
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; skill: number } | null>(null);

  useEffect(() => {
    loadTeamProfile();
  }, [team.id]);

  const loadTeamProfile = async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      // Load all teams first for opponent names
      const { data: teamsData, error: teamsError } = await db.teams().select('*');
      if (teamsError) throw teamsError;

      const teamsMap = new Map<string, Team>();
      teamsData?.forEach((t: any) => {
        teamsMap.set(t.id, {
          id: t.id,
          name: t.name,
          flag: t.flag,
          region: t.region,
          skill: t.skill,
        });
      });
      setAllTeams(teamsMap);

      // Load match history
      const { data: matches, error: matchesError } = await db
        .match_history()
        .select('*')
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .order('played_at', { ascending: false });

      if (matchesError) throw matchesError;

      // Load all tournaments to map tournament IDs to years
      const { data: allTournaments, error: allTournamentsError } = await db
        .tournaments_new()
        .select('id, year, status');

      if (allTournamentsError) throw allTournamentsError;

      const tournamentMap = new Map<string, { year: number; status: string }>();
      allTournaments?.forEach((t: any) => {
        tournamentMap.set(t.id, { year: t.year, status: t.status });
      });

      const history: MatchHistoryEntry[] =
        matches?.map((m: any) => {
          const tournament = m.tournament_id ? tournamentMap.get(m.tournament_id) : null;
          const tournamentStage = tournament?.status === 'completed' ? 'Mundial' : 'Qualifiers';

          return {
            id: m.id,
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            homeScore: m.home_score,
            awayScore: m.away_score,
            stage: m.stage,
            groupName: m.group_name,
            region: m.region,
            tournamentId: m.tournament_id,
            homeSkillBefore: m.home_skill_before,
            awaySkillBefore: m.away_skill_before,
            homeSkillAfter: m.home_skill_after,
            awaySkillAfter: m.away_skill_after,
            homeSkillChange: m.home_skill_change,
            awaySkillChange: m.away_skill_change,
            playedAt: m.played_at,
            tournamentYear: tournament?.year,
            tournamentStage,
          };
        }) || [];

      setMatchHistory(history);

      // Build skill evolution from matches (chronological)
      const skillPoints: SkillPoint[] = [];
      const chronologicalMatches = [...history].reverse(); // Oldest first

      chronologicalMatches.forEach((match) => {
        const isHome = match.homeTeamId === team.id;
        const skillAfter = isHome ? match.homeSkillAfter : match.awaySkillAfter;

        skillPoints.push({
          date: new Date(match.playedAt).toLocaleDateString(),
          skill: skillAfter,
          matchId: match.id,
        });
      });

      setSkillEvolution(skillPoints);

      // Calculate statistics
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      history.forEach((match) => {
        const isHome = match.homeTeamId === team.id;
        const teamScore = isHome ? match.homeScore : match.awayScore;
        const opponentScore = isHome ? match.awayScore : match.homeScore;

        goalsFor += teamScore;
        goalsAgainst += opponentScore;

        if (teamScore > opponentScore) wins++;
        else if (teamScore === opponentScore) draws++;
        else losses++;
      });

      const totalMatches = history.length;
      const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
      const avgGoalsFor = totalMatches > 0 ? goalsFor / totalMatches : 0;
      const avgGoalsAgainst = totalMatches > 0 ? goalsAgainst / totalMatches : 0;

      // Find biggest victory (only wins)
      let biggestVictory: TeamStats['biggestVictory'];
      let maxVictoryDiff = 0;

      history.forEach((match) => {
        const isHome = match.homeTeamId === team.id;
        const teamScore = isHome ? match.homeScore : match.awayScore;
        const opponentScore = isHome ? match.awayScore : match.homeScore;
        const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
        const goalDifference = teamScore - opponentScore;

        if (goalDifference > maxVictoryDiff) {
          maxVictoryDiff = goalDifference;
          const opponent = teamsMap.get(opponentId);
          biggestVictory = {
            score: `${teamScore}-${opponentScore}`,
            opponent: opponent?.name || 'Desconocido',
            goalDifference,
            stage: match.stage,
            tournamentYear: match.tournamentYear || 0,
            tournamentStage: match.tournamentStage || 'Desconocido',
          };
        }
      });

      // Find worst defeat (only losses)
      let worstDefeat: TeamStats['worstDefeat'];
      let maxDefeatDiff = 0;

      history.forEach((match) => {
        const isHome = match.homeTeamId === team.id;
        const teamScore = isHome ? match.homeScore : match.awayScore;
        const opponentScore = isHome ? match.awayScore : match.homeScore;
        const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
        const goalDifference = opponentScore - teamScore;

        if (goalDifference > maxDefeatDiff) {
          maxDefeatDiff = goalDifference;
          const opponent = teamsMap.get(opponentId);
          worstDefeat = {
            score: `${teamScore}-${opponentScore}`,
            opponent: opponent?.name || 'Desconocido',
            goalDifference,
            stage: match.stage,
            tournamentYear: match.tournamentYear || 0,
            tournamentStage: match.tournamentStage || 'Desconocido',
          };
        }
      });

      setStats({
        totalMatches,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        winRate,
        avgGoalsFor,
        avgGoalsAgainst,
        biggestVictory,
        worstDefeat,
      });

      // Load titles from tournaments
      const { data: tournaments, error: tournamentsError } = await db
        .tournaments_new()
        .select('*')
        .eq('status', 'completed');

      if (tournamentsError) throw tournamentsError;

      const teamTitles: TournamentTitle[] = [];
      tournaments?.forEach((t: any) => {
        if (t.champion_team_id === team.id) {
          teamTitles.push({ year: t.year, position: 'champion' });
        } else if (t.runner_up_team_id === team.id) {
          teamTitles.push({ year: t.year, position: 'runner_up' });
        } else if (t.third_place_team_id === team.id) {
          teamTitles.push({ year: t.year, position: 'third_place' });
        } else if (t.fourth_place_team_id === team.id) {
          teamTitles.push({ year: t.year, position: 'fourth_place' });
        }
      });

      setTitles(teamTitles.sort((a, b) => b.year - a.year));

      // Find best World Cup result (best position achieved)
      let bestWorldCupResult: TeamStats['bestWorldCupResult'];
      if (teamTitles.length > 0) {
        // Sort by position importance: champion > runner_up > third_place > fourth_place
        const positionRank = { champion: 1, runner_up: 2, third_place: 3, fourth_place: 4 };
        const bestTitle = teamTitles.sort((a, b) => positionRank[a.position] - positionRank[b.position])[0];
        bestWorldCupResult = {
          position: bestTitle.position,
          year: bestTitle.year,
        };

        // Update stats with best World Cup result
        setStats((prev) => ({
          ...prev,
          bestWorldCupResult,
        }));
      }
    } catch (error) {
      console.error('Error loading team profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPositionLabel = (position: string) => {
    switch (position) {
      case 'champion':
        return '🥇 Campeón';
      case 'runner_up':
        return '🥈 Subcampeón';
      case 'third_place':
        return '🥉 3° Lugar';
      case 'fourth_place':
        return '4° Lugar';
      default:
        return position;
    }
  };

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'champion':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'runner_up':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'third_place':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'fourth_place':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getMatchResult = (match: MatchHistoryEntry): 'W' | 'D' | 'L' => {
    const isHome = match.homeTeamId === team.id;
    const teamScore = isHome ? match.homeScore : match.awayScore;
    const opponentScore = isHome ? match.awayScore : match.homeScore;

    if (teamScore > opponentScore) return 'W';
    if (teamScore === opponentScore) return 'D';
    return 'L';
  };

  const getSkillChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  // Simple line chart calculation (SVG path) with fixed Y axis 30-100
  const generateSkillChartPath = () => {
    if (skillEvolution.length === 0) return '';

    const width = 600;
    const height = 200;
    const padding = 20;

    const minSkill = 30; // Fixed minimum
    const maxSkill = 100; // Fixed maximum

    const xStep = (width - 2 * padding) / (skillEvolution.length - 1 || 1);

    const points = skillEvolution.map((point, idx) => {
      const x = padding + idx * xStep;
      const y = height - padding - ((point.skill - minSkill) / (maxSkill - minSkill)) * (height - 2 * padding);
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-primary-600 to-primary-700 text-white px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
              <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={48} />
              <div>
                <h2 className="text-2xl font-bold">{team.name}</h2>
                <p className="text-primary-100 text-sm">{team.region}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando perfil...</p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Skill Evolution Graph */}
              {skillEvolution.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary-600" />
                      Evolución de Habilidad
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto relative">
                      <svg viewBox="0 0 600 200" className="w-full h-48">
                        {/* Grid lines */}
                        {[0, 17.5, 35, 52.5, 70].map((val) => {
                          const skillValue = 30 + val;
                          const y = 180 - (val / 70) * 160;
                          return (
                            <g key={val}>
                              <line
                                x1={20}
                                y1={y}
                                x2={580}
                                y2={y}
                                stroke="#e5e7eb"
                                strokeWidth="1"
                              />
                              <text x={5} y={y + 5} fontSize="10" fill="#6b7280">
                                {Math.round(skillValue)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Skill line */}
                        <path
                          d={generateSkillChartPath()}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Data points */}
                        {skillEvolution.map((point, idx) => {
                          const width = 600;
                          const height = 200;
                          const padding = 20;
                          const minSkill = 30;
                          const maxSkill = 100;
                          const xStep = (width - 2 * padding) / (skillEvolution.length - 1 || 1);
                          const x = padding + idx * xStep;
                          const y =
                            height -
                            padding -
                            ((point.skill - minSkill) / (maxSkill - minSkill)) * (height - 2 * padding);

                          return (
                            <circle
                              key={point.matchId}
                              cx={x}
                              cy={y}
                              r="5"
                              fill="#3b82f6"
                              className="cursor-pointer hover:fill-blue-700 transition-colors"
                              onMouseEnter={() => setHoveredPoint({ x, y, skill: point.skill })}
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                          );
                        })}

                        {/* Tooltip */}
                        {hoveredPoint && (
                          <g>
                            <rect
                              x={hoveredPoint.x - 25}
                              y={hoveredPoint.y - 30}
                              width="50"
                              height="20"
                              fill="rgba(0, 0, 0, 0.8)"
                              rx="4"
                            />
                            <text
                              x={hoveredPoint.x}
                              y={hoveredPoint.y - 15}
                              textAnchor="middle"
                              fontSize="12"
                              fill="white"
                              fontWeight="bold"
                            >
                              {hoveredPoint.skill}
                            </text>
                          </g>
                        )}
                      </svg>
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      Evolución a través de {skillEvolution.length} partidos
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Comparative Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary-600" />
                    Estadísticas Comparativas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Victorias</p>
                      <p className="text-2xl font-bold text-green-600">{stats.wins}</p>
                      <div className="w-full bg-gray-200 h-2 rounded-full mt-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${(stats.wins / stats.totalMatches) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Empates</p>
                      <p className="text-2xl font-bold text-gray-600">{stats.draws}</p>
                      <div className="w-full bg-gray-200 h-2 rounded-full mt-2">
                        <div
                          className="bg-gray-600 h-2 rounded-full"
                          style={{ width: `${(stats.draws / stats.totalMatches) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Derrotas</p>
                      <p className="text-2xl font-bold text-red-600">{stats.losses}</p>
                      <div className="w-full bg-gray-200 h-2 rounded-full mt-2">
                        <div
                          className="bg-red-600 h-2 rounded-full"
                          style={{ width: `${(stats.losses / stats.totalMatches) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">% Victorias</p>
                      <p className="text-2xl font-bold text-primary-600">{stats.winRate.toFixed(1)}%</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Goles Favor</p>
                      <p className="text-2xl font-bold text-blue-600">{stats.goalsFor}</p>
                      <p className="text-xs text-gray-500 mt-1">Prom: {stats.avgGoalsFor.toFixed(2)}</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Goles Contra</p>
                      <p className="text-2xl font-bold text-orange-600">{stats.goalsAgainst}</p>
                      <p className="text-xs text-gray-500 mt-1">Prom: {stats.avgGoalsAgainst.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Historical Records */}
              {(stats.bestWorldCupResult || stats.biggestVictory || stats.worstDefeat) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-500" />
                      Récords Históricos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Best World Cup Result */}
                      {stats.bestWorldCupResult && (
                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-lg border-2 border-yellow-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Trophy className="w-5 h-5 text-yellow-600" />
                            <p className="text-sm font-semibold text-gray-700">Mejor Resultado Mundial</p>
                          </div>
                          <div className="mt-2">
                            <p className="text-2xl font-bold text-yellow-800">
                              {getPositionLabel(stats.bestWorldCupResult.position).split(' ')[0]}
                            </p>
                            <p className="text-sm text-yellow-700 mt-1">
                              {getPositionLabel(stats.bestWorldCupResult.position).split(' ').slice(1).join(' ')}
                            </p>
                            <p className="text-xs text-yellow-600 mt-2">
                              Mundial {stats.bestWorldCupResult.year}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Biggest Victory */}
                      {stats.biggestVictory && (
                        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border-2 border-green-200">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-5 h-5 text-green-600" />
                            <p className="text-sm font-semibold text-gray-700">Victoria más Abultada</p>
                          </div>
                          <div className="mt-2">
                            <p className="text-3xl font-bold text-green-800">{stats.biggestVictory.score}</p>
                            <p className="text-sm text-green-700 mt-1">vs {stats.biggestVictory.opponent}</p>
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-green-700 font-medium">
                                {stats.biggestVictory.stage.includes('knockout') ? 'Eliminatorias' : stats.biggestVictory.stage}
                              </p>
                              <p className="text-xs text-green-600">
                                {stats.biggestVictory.tournamentStage} {stats.biggestVictory.tournamentYear}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Worst Defeat */}
                      {stats.worstDefeat && (
                        <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border-2 border-red-200">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="w-5 h-5 text-red-600" />
                            <p className="text-sm font-semibold text-gray-700">Peor Derrota</p>
                          </div>
                          <div className="mt-2">
                            <p className="text-3xl font-bold text-red-800">{stats.worstDefeat.score}</p>
                            <p className="text-sm text-red-700 mt-1">vs {stats.worstDefeat.opponent}</p>
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-red-700 font-medium">
                                {stats.worstDefeat.stage.includes('knockout') ? 'Eliminatorias' : stats.worstDefeat.stage}
                              </p>
                              <p className="text-xs text-red-600">
                                {stats.worstDefeat.tournamentStage} {stats.worstDefeat.tournamentYear}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Titles & Achievements */}
              {titles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-yellow-500" />
                      Títulos y Logros
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {titles.map((title, idx) => (
                        <div
                          key={idx}
                          className={`border-2 rounded-lg p-3 text-center ${getPositionColor(
                            title.position
                          )}`}
                        >
                          <p className="font-bold text-lg">{title.year}</p>
                          <p className="text-sm mt-1">{getPositionLabel(title.position)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tournament Performance History */}
              <TeamTournamentHistory teamId={team.id} teamName={team.name} />

              {/* Match History */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary-600" />
                    Historial de Partidos ({matchHistory.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {matchHistory.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No hay partidos registrados</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {matchHistory.map((match) => {
                        const isHome = match.homeTeamId === team.id;
                        const opponent = isHome
                          ? allTeams.get(match.awayTeamId)
                          : allTeams.get(match.homeTeamId);
                        const teamScore = isHome ? match.homeScore : match.awayScore;
                        const opponentScore = isHome ? match.awayScore : match.homeScore;
                        const skillChange = isHome ? match.homeSkillChange : match.awaySkillChange;
                        const result = getMatchResult(match);

                        return (
                          <div
                            key={match.id}
                            className={`border rounded-lg p-3 flex items-center justify-between ${
                              result === 'W'
                                ? 'bg-green-50 border-green-200'
                                : result === 'L'
                                ? 'bg-red-50 border-red-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              {opponent && (
                                <>
                                  <TeamFlag
                                    teamId={opponent.id}
                                    teamName={opponent.name}
                                    flagUrl={opponent.flag}
                                    size={32}
                                  />
                                  <div>
                                    <p className="font-medium text-sm">{opponent.name}</p>
                                    <p className="text-xs text-gray-500">
                                      {match.stage.includes('knockout') ? 'Eliminatorias' : match.stage} - {match.groupName}
                                    </p>
                                    {match.tournamentYear && (
                                      <p className="text-xs text-gray-400">
                                        {match.tournamentStage} {match.tournamentYear}
                                      </p>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-center">
                                <p className="font-bold text-lg">
                                  {teamScore} - {opponentScore}
                                </p>
                                <p
                                  className={`text-xs font-semibold ${
                                    result === 'W'
                                      ? 'text-green-600'
                                      : result === 'L'
                                      ? 'text-red-600'
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {result === 'W' ? 'Victoria' : result === 'L' ? 'Derrota' : 'Empate'}
                                </p>
                              </div>

                              <div className="flex items-center gap-1">
                                {getSkillChangeIcon(skillChange)}
                                <span
                                  className={`text-sm font-semibold ${
                                    skillChange > 0
                                      ? 'text-green-600'
                                      : skillChange < 0
                                      ? 'text-red-600'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {skillChange > 0 ? '+' : ''}
                                  {skillChange}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
