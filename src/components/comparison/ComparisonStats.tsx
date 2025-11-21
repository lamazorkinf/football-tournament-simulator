import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Trophy, Target, TrendingUp, Award, Zap } from 'lucide-react';
import type { Team } from '../../types';
import type { HeadToHeadStats } from '../../services/headToHeadService';
import { getWinPercentage, getFormString } from '../../services/headToHeadService';

interface ComparisonStatsProps {
  team1: Team;
  team2: Team;
  h2hStats: HeadToHeadStats;
  overallComparison: {
    skillDifference: number;
    favoriteTeam: string;
    skillGap: number;
    team1Tier: string;
    team2Tier: string;
  };
}

export function ComparisonStats({
  team1,
  team2,
  h2hStats,
  overallComparison,
}: ComparisonStatsProps) {
  const team1WinPct = getWinPercentage(h2hStats, 1);
  const team2WinPct = getWinPercentage(h2hStats, 2);
  const drawPct = h2hStats.totalMatches > 0
    ? (h2hStats.draws / h2hStats.totalMatches) * 100
    : 0;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Head to Head Stats */}
      {h2hStats.totalMatches > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary-600" />
              Cara a Cara
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Win/Draw/Loss */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-700">{h2hStats.team1Wins}</div>
                  <div className="text-xs text-gray-600">Victorias</div>
                  <div className="text-xs text-green-600 font-semibold mt-1">
                    {team1WinPct.toFixed(0)}%
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-2xl font-bold text-gray-700">{h2hStats.draws}</div>
                  <div className="text-xs text-gray-600">Empates</div>
                  <div className="text-xs text-gray-500 font-semibold mt-1">
                    {drawPct.toFixed(0)}%
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-700">{h2hStats.team2Wins}</div>
                  <div className="text-xs text-gray-600">Victorias</div>
                  <div className="text-xs text-blue-600 font-semibold mt-1">
                    {team2WinPct.toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Goals */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
                  <div className="text-sm text-gray-700 mb-1">Goles a favor</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-primary-700">
                      {h2hStats.team1GoalsFor}
                    </span>
                    <span className="text-xs text-gray-600">
                      {h2hStats.averageGoalsTeam1.toFixed(1)} avg
                    </span>
                  </div>
                </div>

                <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
                  <div className="text-sm text-gray-700 mb-1">Goles a favor</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-primary-700">
                      {h2hStats.team2GoalsFor}
                    </span>
                    <span className="text-xs text-gray-600">
                      {h2hStats.averageGoalsTeam2.toFixed(1)} avg
                    </span>
                  </div>
                </div>
              </div>

              {/* Form (Last 5) */}
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  Últimos {h2hStats.lastFiveResults.length} partidos
                </div>
                <div className="flex gap-2">
                  {getFormString(h2hStats, team1.id).map((result, index) => (
                    <div
                      key={index}
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                        result === 'W'
                          ? 'bg-green-500'
                          : result === 'D'
                          ? 'bg-gray-400'
                          : 'bg-red-500'
                      }`}
                    >
                      {result}
                    </div>
                  ))}
                </div>
              </div>

              {/* Biggest Wins */}
              {(h2hStats.biggestWinTeam1 || h2hStats.biggestWinTeam2) && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="text-sm font-semibold text-gray-700 mb-2">
                    Mayor victoria
                  </div>
                  <div className="space-y-2 text-sm">
                    {h2hStats.biggestWinTeam1 && (
                      <div className="flex items-center gap-2 text-green-700">
                        <Award className="w-4 h-4" />
                        <span>
                          {team1.name}: {Math.abs(h2hStats.biggestWinTeam1.goalDifference)} goles de diferencia
                        </span>
                      </div>
                    )}
                    {h2hStats.biggestWinTeam2 && (
                      <div className="flex items-center gap-2 text-blue-700">
                        <Award className="w-4 h-4" />
                        <span>
                          {team2.name}: {Math.abs(h2hStats.biggestWinTeam2.goalDifference)} goles de diferencia
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary-600" />
            Comparación General
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Skill Comparison */}
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Nivel de Habilidad</div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`border-2 rounded-lg p-3 ${
                  team1.skill > team2.skill
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 bg-white'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-primary-600" />
                    <span className="text-xs text-gray-600">{team1.name}</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{team1.skill}</div>
                  {team1.skill > team2.skill && (
                    <div className="text-xs text-green-600 font-semibold mt-1">
                      +{overallComparison.skillGap} ventaja
                    </div>
                  )}
                </div>

                <div className={`border-2 rounded-lg p-3 ${
                  team2.skill > team1.skill
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 bg-white'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-primary-600" />
                    <span className="text-xs text-gray-600">{team2.name}</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{team2.skill}</div>
                  {team2.skill > team1.skill && (
                    <div className="text-xs text-green-600 font-semibold mt-1">
                      +{overallComparison.skillGap} ventaja
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tiers */}
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Clasificación</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-gray-900">{overallComparison.team1Tier}</div>
                  <div className="text-xs text-gray-600">{team1.name}</div>
                </div>

                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-gray-900">{overallComparison.team2Tier}</div>
                  <div className="text-xs text-gray-600">{team2.name}</div>
                </div>
              </div>
            </div>

            {/* Prediction */}
            <div className="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-gray-900 mb-1">
                    Predicción
                  </div>
                  <p className="text-sm text-gray-700">
                    {overallComparison.skillGap === 0 ? (
                      <>
                        Los equipos están <strong>igualados</strong> en habilidad.
                        Un partido entre ellos sería <strong>muy reñido</strong>.
                      </>
                    ) : overallComparison.skillGap < 10 ? (
                      <>
                        <strong>{overallComparison.favoriteTeam === team1.id ? team1.name : team2.name}</strong>
                        {' '}es <strong>ligeramente favorito</strong>, pero la diferencia es pequeña.
                      </>
                    ) : overallComparison.skillGap < 20 ? (
                      <>
                        <strong>{overallComparison.favoriteTeam === team1.id ? team1.name : team2.name}</strong>
                        {' '}tiene una <strong>ventaja moderada</strong> en habilidad.
                      </>
                    ) : (
                      <>
                        <strong>{overallComparison.favoriteTeam === team1.id ? team1.name : team2.name}</strong>
                        {' '}es <strong>claramente superior</strong> en habilidad.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Regions */}
            <div className="pt-3 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-3 text-center text-sm">
                <div>
                  <div className="text-gray-600">Región</div>
                  <div className="font-semibold text-gray-900 mt-1">{team1.region}</div>
                </div>
                <div>
                  <div className="text-gray-600">Región</div>
                  <div className="font-semibold text-gray-900 mt-1">{team2.region}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
