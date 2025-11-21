import { useState } from 'react';
import type { Tournament, Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { TrendingUp, Target, Users, Globe, History } from 'lucide-react';
import { HistoricalStats } from './HistoricalStats';

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
  }

  const progress = totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0;

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
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setView('current')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            view === 'current'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Current Tournament
          </div>
        </button>
        <button
          onClick={() => setView('historical')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            view === 'historical'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historical Stats
          </div>
        </button>
      </div>

      {view === 'historical' ? (
        <HistoricalStats teams={teams} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Matches</p>
                <p className="text-3xl font-bold text-gray-900">
                  {playedMatches}
                  <span className="text-lg text-gray-500">/{totalMatches}</span>
                </p>
              </div>
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <Target className="w-6 h-6 text-primary-600" />
              </div>
            </div>
            <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Teams Participating</p>
                <p className="text-3xl font-bold text-gray-900">{teams.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Regions</p>
                <p className="text-3xl font-bold text-gray-900">6</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Globe className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completion</p>
                <p className="text-3xl font-bold text-gray-900">{Math.round(progress)}%</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Scoring Teams</CardTitle>
          </CardHeader>
          <CardContent>
            {topScorers.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No matches played yet
              </p>
            ) : (
              <div className="space-y-3">
                {topScorers.map((stat, idx) => (
                  <div
                    key={stat.team.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold text-gray-400 w-6">
                        {idx + 1}
                      </span>
                      <TeamFlag teamId={stat.team.id} teamName={stat.team.name} flagUrl={stat.team.flag} size={32} />
                      <div>
                        <p className="font-medium text-gray-900">{stat.team.name}</p>
                        <p className="text-xs text-gray-500">
                          {stat.matchesPlayed} matches
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary-600">
                        {stat.goalsScored}
                      </p>
                      <p className="text-xs text-gray-500">goals</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best Goal Average</CardTitle>
          </CardHeader>
          <CardContent>
            {topAverage.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                Not enough matches played (min. 3)
              </p>
            ) : (
              <div className="space-y-3">
                {topAverage.map((stat, idx) => (
                  <div
                    key={stat.team.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold text-gray-400 w-6">
                        {idx + 1}
                      </span>
                      <TeamFlag teamId={stat.team.id} teamName={stat.team.name} flagUrl={stat.team.flag} size={32} />
                      <div>
                        <p className="font-medium text-gray-900">{stat.team.name}</p>
                        <p className="text-xs text-gray-500">
                          {stat.goalsScored} in {stat.matchesPlayed} matches
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">
                        {stat.avgGoals.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">avg</p>
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
          <CardTitle>Regional Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {regionalStats.map((stat) => (
              <div
                key={stat.region}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary-400 transition-colors"
              >
                <h4 className="font-semibold text-gray-900 mb-2">{stat.region}</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-600">
                    Matches: <span className="font-medium">{stat.matchesPlayed}</span>
                  </p>
                  <p className="text-gray-600">
                    Total Goals: <span className="font-medium">{stat.totalGoals}</span>
                  </p>
                  <p className="text-gray-600">
                    Avg Goals:{' '}
                    <span className="font-medium text-primary-600">
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
