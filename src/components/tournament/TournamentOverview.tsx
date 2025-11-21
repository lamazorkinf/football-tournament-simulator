import type { Tournament, Team, Region } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Trophy, Award, Target, TrendingUp, ChevronRight, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface TournamentOverviewProps {
  tournament: Tournament;
  teams: Team[];
  onNavigate: (view: string) => void;
}

export function TournamentOverview({ tournament, teams, onNavigate }: TournamentOverviewProps) {
  // Calculate overall progress
  const qualifierStats = calculateQualifierStats(tournament);
  const worldCupStats = tournament.worldCup ? calculateWorldCupStats(tournament) : null;
  const knockoutStats = tournament.worldCup?.knockout ? calculateKnockoutStats(tournament) : null;

  // Determine current stage
  const currentStage = determineCurrentStage(tournament);
  const nextStep = getNextStep(tournament, qualifierStats, worldCupStats, knockoutStats);

  // Regional progress
  const regionalProgress = calculateRegionalProgress(tournament);

  return (
    <div className="space-y-6">
      {/* Tournament Progress Timeline */}
      <Card className="bg-gradient-to-r from-primary-50 to-primary-100 border-primary-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8 text-primary-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Tournament Progress</h2>
                <p className="text-sm text-gray-600">{tournament.name}</p>
              </div>
            </div>
          </div>

          {/* Stage Timeline */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Qualifiers Stage */}
            <StageCard
              title="Qualifiers"
              icon={Target}
              isActive={currentStage === 'qualifiers'}
              isComplete={tournament.isQualifiersComplete}
              progress={qualifierStats.progress}
              subtitle={`${qualifierStats.playedMatches}/${qualifierStats.totalMatches} matches`}
            />

            {/* World Cup Stage */}
            <StageCard
              title="World Cup"
              icon={Award}
              isActive={currentStage === 'worldcup'}
              isComplete={worldCupStats?.isComplete || false}
              progress={worldCupStats?.progress || 0}
              subtitle={worldCupStats ? `${worldCupStats.playedMatches}/${worldCupStats.totalMatches} matches` : 'Not started'}
              isLocked={!tournament.worldCup}
            />

            {/* Knockout Stage */}
            <StageCard
              title="Knockout"
              icon={Trophy}
              isActive={currentStage === 'knockout'}
              isComplete={knockoutStats?.isComplete || false}
              progress={knockoutStats?.progress || 0}
              subtitle={knockoutStats ? `${knockoutStats.playedMatches}/${knockoutStats.totalMatches} matches` : 'Not started'}
              isLocked={!knockoutStats}
            />
          </div>
        </CardContent>
      </Card>

      {/* Next Step Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-2 border-primary-300 bg-primary-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-gray-900 mb-2">Next Step</h3>
                <p className="text-gray-700 mb-4">{nextStep.message}</p>
                <Button
                  variant="primary"
                  onClick={() => onNavigate(nextStep.action)}
                  className="gap-2"
                >
                  {nextStep.buttonText}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Regional Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Regional Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {regionalProgress.map((region, idx) => (
              <motion.div
                key={region.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{region.icon}</span>
                    <div>
                      <h4 className="font-semibold text-gray-900">{region.name}</h4>
                      <p className="text-xs text-gray-600">
                        {region.playedMatches}/{region.totalMatches} matches • {region.groupsComplete}/{region.totalGroups} groups
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{Math.round(region.progress)}%</span>
                    {region.progress === 100 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : region.progress > 0 ? (
                      <Clock className="w-5 h-5 text-orange-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${region.progress}%` }}
                    transition={{ delay: idx * 0.1 + 0.3, duration: 0.8 }}
                    className={`h-2.5 rounded-full ${
                      region.progress === 100
                        ? 'bg-green-600'
                        : region.progress > 50
                        ? 'bg-primary-600'
                        : 'bg-orange-500'
                    }`}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Teams"
          value={teams.length}
          icon="🏟️"
        />
        <StatCard
          label="Total Matches"
          value={qualifierStats.totalMatches + (worldCupStats?.totalMatches || 0) + (knockoutStats?.totalMatches || 0)}
          icon="⚽"
        />
        <StatCard
          label="Completed"
          value={qualifierStats.playedMatches + (worldCupStats?.playedMatches || 0) + (knockoutStats?.playedMatches || 0)}
          icon="✅"
        />
        <StatCard
          label="Remaining"
          value={
            (qualifierStats.totalMatches - qualifierStats.playedMatches) +
            ((worldCupStats?.totalMatches || 0) - (worldCupStats?.playedMatches || 0)) +
            ((knockoutStats?.totalMatches || 0) - (knockoutStats?.playedMatches || 0))
          }
          icon="⏳"
        />
      </div>
    </div>
  );
}

interface StageCardProps {
  title: string;
  icon: any;
  isActive: boolean;
  isComplete: boolean;
  progress: number;
  subtitle: string;
  isLocked?: boolean;
}

function StageCard({ title, icon: Icon, isActive, isComplete, progress, subtitle, isLocked }: StageCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border-2 transition-all ${
        isActive
          ? 'border-primary-500 bg-white shadow-lg scale-105'
          : isComplete
          ? 'border-green-500 bg-green-50'
          : isLocked
          ? 'border-gray-300 bg-gray-50 opacity-60'
          : 'border-gray-300 bg-white'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isActive
              ? 'bg-primary-600'
              : isComplete
              ? 'bg-green-600'
              : 'bg-gray-400'
          }`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-600">{subtitle}</p>
        </div>
      </div>

      {!isLocked && (
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              isComplete ? 'bg-green-600' : isActive ? 'bg-primary-600' : 'bg-gray-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {isComplete && (
        <div className="mt-2 flex items-center gap-1 text-green-700 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4" />
          Complete
        </div>
      )}

      {isLocked && (
        <div className="mt-2 text-gray-500 text-sm">
          🔒 Locked
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center">
          <div className="text-3xl mb-2">{icon}</div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-sm text-gray-600">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions
function calculateQualifierStats(tournament: Tournament) {
  let totalMatches = 0;
  let playedMatches = 0;

  Object.values(tournament.qualifiers).forEach((groups) => {
    groups.forEach((group) => {
      totalMatches += group.matches.length;
      playedMatches += group.matches.filter((m) => m.isPlayed).length;
    });
  });

  return {
    totalMatches,
    playedMatches,
    progress: totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0,
  };
}

function calculateWorldCupStats(tournament: Tournament) {
  if (!tournament.worldCup) return null;

  let totalMatches = 0;
  let playedMatches = 0;

  tournament.worldCup.groups.forEach((group) => {
    totalMatches += group.matches.length;
    playedMatches += group.matches.filter((m) => m.isPlayed).length;
  });

  return {
    totalMatches,
    playedMatches,
    progress: totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0,
    isComplete: playedMatches === totalMatches,
  };
}

function calculateKnockoutStats(tournament: Tournament) {
  if (!tournament.worldCup?.knockout) return null;

  const knockout = tournament.worldCup.knockout;
  const allMatches = [
    ...knockout.roundOf16,
    ...knockout.quarterFinals,
    ...knockout.semiFinals,
    ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
    ...(knockout.final ? [knockout.final] : []),
  ];

  const totalMatches = allMatches.length;
  const playedMatches = allMatches.filter((m) => m.isPlayed).length;

  return {
    totalMatches,
    playedMatches,
    progress: totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0,
    isComplete: playedMatches === totalMatches,
  };
}

function determineCurrentStage(tournament: Tournament): string {
  if (tournament.worldCup) {
    if (tournament.worldCup.knockout.roundOf16.length > 0) {
      const knockoutComplete = tournament.worldCup.knockout.final?.isPlayed || false;
      if (!knockoutComplete) return 'knockout';
    }

    const groupsComplete = tournament.worldCup.groups.every((g) =>
      g.matches.every((m) => m.isPlayed)
    );
    if (!groupsComplete) return 'worldcup';
  }

  return 'qualifiers';
}

function getNextStep(tournament: Tournament, qualifierStats: any, worldCupStats: any, knockoutStats: any) {
  // Check if tournament is complete
  if (tournament.worldCup?.champion) {
    return {
      message: '🏆 Tournament complete! Congratulations to the champion!',
      buttonText: 'View Results',
      action: 'worldcup',
    };
  }

  // Check knockout stage
  if (knockoutStats && knockoutStats.playedMatches < knockoutStats.totalMatches) {
    return {
      message: `Continue the knockout stage. ${knockoutStats.totalMatches - knockoutStats.playedMatches} matches remaining until we crown a champion!`,
      buttonText: 'Continue Knockout',
      action: 'worldcup',
    };
  }

  // Check World Cup groups
  if (worldCupStats && worldCupStats.playedMatches < worldCupStats.totalMatches) {
    return {
      message: `Complete the World Cup group stage. ${worldCupStats.totalMatches - worldCupStats.playedMatches} matches remaining.`,
      buttonText: 'Continue World Cup',
      action: 'worldcup',
    };
  }

  // Check if ready for World Cup
  if (tournament.isQualifiersComplete && !tournament.worldCup) {
    return {
      message: 'Qualifiers complete! Ready to advance to the World Cup stage.',
      buttonText: 'Advance to World Cup',
      action: 'qualifiers',
    };
  }

  // Check if ready for knockout
  if (worldCupStats?.isComplete && knockoutStats === null) {
    return {
      message: 'World Cup groups complete! Ready to advance to the knockout stage.',
      buttonText: 'View World Cup',
      action: 'worldcup',
    };
  }

  // Still in qualifiers
  const remainingMatches = qualifierStats.totalMatches - qualifierStats.playedMatches;
  if (remainingMatches > 0) {
    return {
      message: `Complete the qualifier stage. ${remainingMatches} matches remaining across all regions.`,
      buttonText: 'View Qualifiers',
      action: 'qualifiers',
    };
  }

  return {
    message: 'Tournament ready to begin!',
    buttonText: 'Start Tournament',
    action: 'qualifiers',
  };
}

function calculateRegionalProgress(tournament: Tournament) {
  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
  const regionIcons: Record<Region, string> = {
    Europe: '🇪🇺',
    America: '🌎',
    Africa: '🌍',
    Asia: '🌏',
  };

  return regions.map((region) => {
    const groups = tournament.qualifiers[region] || [];
    let totalMatches = 0;
    let playedMatches = 0;
    let groupsComplete = 0;

    groups.forEach((group) => {
      totalMatches += group.matches.length;
      playedMatches += group.matches.filter((m) => m.isPlayed).length;
      if (group.matches.every((m) => m.isPlayed)) groupsComplete++;
    });

    return {
      name: region,
      icon: regionIcons[region],
      totalMatches,
      playedMatches,
      totalGroups: groups.length,
      groupsComplete,
      progress: totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0,
    };
  });
}
