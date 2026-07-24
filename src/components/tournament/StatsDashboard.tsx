import { useState } from 'react';
import type { Tournament, Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { EmptyState } from '../ui/EmptyState';
import { TrendingUp, History, BarChart3 } from 'lucide-react';
import { HistoricalStats } from './HistoricalStats';
import { Tabs } from '../ui/Tabs';

interface StatsDashboardProps {
  tournament: Tournament;
  teams: Team[];
}

export function StatsDashboard({ tournament, teams }: StatsDashboardProps) {
  const [view, setView] = useState<'current' | 'historical'>('current');

  // Calculate total matches
  let totalMatches = 0;
  let playedMatches = 0;

  Object.values(tournament.qualifiers).forEach((groups) => {
    groups.forEach((group) => {
      totalMatches += group.matches.length;
      playedMatches += group.matches.filter((m) => m.isPlayed).length;
    });
  });

  if (tournament.worldCup) {
    tournament.worldCup.groups.forEach((group) => {
      totalMatches += group.matches.length;
      playedMatches += group.matches.filter((m) => m.isPlayed).length;
    });

    // Include knockout matches
    if (tournament.worldCup.knockout) {
      const knockout = tournament.worldCup.knockout;
      const allKnockoutMatches = [
        ...knockout.roundOf32,
        ...knockout.roundOf16,
        ...knockout.quarterFinals,
        ...knockout.semiFinals,
        ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
        ...(knockout.final ? [knockout.final] : [])
      ];
      totalMatches += allKnockoutMatches.length;
      playedMatches += allKnockoutMatches.filter((m: any) => m.isPlayed).length;
    }
  }

  // Get top scorers (simulate based on matches)
  const teamStats = teams.map((team) => {
    let goalsScored = 0;
    let matchesPlayed = 0;

    Object.values(tournament.qualifiers).forEach((groups) => {
      groups.forEach((group) => {
        const standing = group.standings.find((s) => s.teamId === team.id);
        if (standing) {
          goalsScored += standing.goalsFor;
          matchesPlayed += standing.played;
        }
      });
    });

    if (tournament.worldCup) {
      tournament.worldCup.groups.forEach((group) => {
        const standing = group.standings.find((s) => s.teamId === team.id);
        if (standing) {
          goalsScored += standing.goalsFor;
          matchesPlayed += standing.played;
        }
      });
    }

    return {
      team,
      goalsScored,
      matchesPlayed,
      avgGoals: matchesPlayed > 0 ? goalsScored / matchesPlayed : 0,
    };
  });

  const topScorers = teamStats
    .filter((s) => s.goalsScored > 0)
    .sort((a, b) => b.goalsScored - a.goalsScored)
    .slice(0, 5);

  const topAverage = teamStats
    .filter((s) => s.matchesPlayed >= 3)
    .sort((a, b) => b.avgGoals - a.avgGoals)
    .slice(0, 5);

  // Regional stats
  const regionalStats = Object.entries(tournament.qualifiers).map(([region, groups]) => {
    let totalGoals = 0;
    let totalMatchesPlayed = 0;

    groups.forEach((group) => {
      group.matches.forEach((match) => {
        if (match.isPlayed && match.homeScore !== null && match.awayScore !== null) {
          totalGoals += match.homeScore + match.awayScore;
          totalMatchesPlayed++;
        }
      });
    });

    return {
      region,
      totalGoals,
      avgGoals: totalMatchesPlayed > 0 ? totalGoals / totalMatchesPlayed : 0,
      matchesPlayed: totalMatchesPlayed,
    };
  });

  return (
    <div className="space-y-6">
      {/* View Selector */}
      <Tabs
        items={[
          { id: 'current', label: 'Torneo Actual', icon: TrendingUp },
          { id: 'historical', label: 'Estadísticas Históricas', icon: History },
        ]}
        value={view}
        onChange={(id) => setView(id as 'current' | 'historical')}
      />

      {view === 'historical' ? (
        <HistoricalStats teams={teams} />
      ) : (
        <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Equipos Más Goleadores</CardTitle>
          </CardHeader>
          <CardContent>
            {topScorers.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Sin partidos jugados"
                description="Simulá algunos partidos para ver estadísticas."
              />
            ) : (
              <div className="space-y-3">
                {topScorers.map((stat, idx) => (
                  <div
                    key={stat.team.id}
                    className="flex items-center justify-between p-3 bg-black/40 hover:bg-grass/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-terminal text-xl text-grass-soft tabular-nums w-6">
                        {idx + 1}
                      </span>
                      <TeamFlag teamId={stat.team.id} teamName={stat.team.name} size={32} />
                      <div>
                        <p className="font-medium text-white">{stat.team.name}</p>
                        <p className="text-xs text-grass-soft">
                          {stat.matchesPlayed} partidos
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-terminal text-led tabular-nums">
                        {stat.goalsScored}
                      </p>
                      <p className="text-xs text-grass-soft">goles</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mejor Promedio de Goles</CardTitle>
          </CardHeader>
          <CardContent>
            {topAverage.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Faltan partidos"
                description="Se necesitan al menos 3 partidos jugados."
              />
            ) : (
              <div className="space-y-3">
                {topAverage.map((stat, idx) => (
                  <div
                    key={stat.team.id}
                    className="flex items-center justify-between p-3 bg-black/40 hover:bg-grass/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-terminal text-xl text-grass-soft tabular-nums w-6">
                        {idx + 1}
                      </span>
                      <TeamFlag teamId={stat.team.id} teamName={stat.team.name} size={32} />
                      <div>
                        <p className="font-medium text-white">{stat.team.name}</p>
                        <p className="text-xs text-grass-soft">
                          {stat.goalsScored} en {stat.matchesPlayed} partidos
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-terminal text-led tabular-nums">
                        {stat.avgGoals.toFixed(2)}
                      </p>
                      <p className="text-xs text-grass-soft">prom</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estadísticas Regionales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {regionalStats.map((stat) => (
              <div
                key={stat.region}
                className="border-2 border-grass p-4 hover:border-gold transition-colors"
              >
                <h4 className="font-arcade text-[10px] text-white text-shadow-retro uppercase mb-2">{stat.region}</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-grass-soft">
                    Partidos: <span className="font-terminal text-white tabular-nums">{stat.matchesPlayed}</span>
                  </p>
                  <p className="text-grass-soft">
                    Goles Totales: <span className="font-terminal text-white tabular-nums">{stat.totalGoals}</span>
                  </p>
                  <p className="text-grass-soft">
                    Prom. Goles:{' '}
                    <span className="font-terminal text-led tabular-nums">
                      {stat.avgGoals.toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
