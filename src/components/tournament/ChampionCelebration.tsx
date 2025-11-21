import type { Team } from '../../types';
import { Trophy, Medal, Award } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface ChampionCelebrationProps {
  championId: string;
  runnerUpId: string;
  thirdPlaceId?: string;
  fourthPlaceId?: string;
  teams: Team[];
  onNewTournament: () => void;
}

export const ChampionCelebration = ({
  championId,
  runnerUpId,
  thirdPlaceId,
  fourthPlaceId,
  teams,
  onNewTournament,
}: ChampionCelebrationProps) => {
  const champion = teams.find((t) => t.id === championId);
  const runnerUp = teams.find((t) => t.id === runnerUpId);
  const thirdPlace = thirdPlaceId ? teams.find((t) => t.id === thirdPlaceId) : null;
  const fourthPlace = fourthPlaceId ? teams.find((t) => t.id === fourthPlaceId) : null;

  if (!champion || !runnerUp) return null;

  return (
    <div className="space-y-8">
      {/* Champion Banner */}
      <div className="relative bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white rounded-2xl p-12 shadow-2xl overflow-hidden">
        {/* Confetti effect background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-full h-full">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-white rounded-full animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 text-center space-y-4">
          <Trophy className="w-24 h-24 mx-auto animate-bounce" />
          <h1 className="text-5xl font-bold tracking-tight">WORLD CUP CHAMPION</h1>
          <div className="flex items-center justify-center gap-4">
            <span className="text-8xl">{champion.flag}</span>
            <div className="text-left">
              <h2 className="text-4xl font-bold">{champion.name}</h2>
              <p className="text-yellow-100 text-xl">Skill Rating: {champion.skill}</p>
            </div>
          </div>
          <p className="text-2xl text-yellow-100 font-semibold mt-4">
            Congratulations on winning the World Cup!
          </p>
        </div>
      </div>

      {/* Podium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {/* Second Place */}
        <div className="order-2 md:order-1">
          <Card className="bg-gradient-to-br from-gray-200 to-gray-300 border-4 border-gray-400">
            <div className="p-6 text-center space-y-3">
              <div className="flex justify-center items-center gap-2">
                <Medal className="w-8 h-8 text-gray-600" />
                <span className="text-3xl font-bold text-gray-700">2nd</span>
              </div>
              <div className="text-6xl">{runnerUp.flag}</div>
              <h3 className="text-xl font-bold text-gray-800">{runnerUp.name}</h3>
              <p className="text-sm text-gray-600">Runner-up</p>
              <p className="text-sm text-gray-500">Skill: {runnerUp.skill}</p>
            </div>
          </Card>
        </div>

        {/* First Place - Taller */}
        <div className="order-1 md:order-2">
          <Card className="bg-gradient-to-br from-yellow-100 to-yellow-200 border-4 border-yellow-500 transform md:scale-110 md:translate-y-[-1rem]">
            <div className="p-6 text-center space-y-3">
              <div className="flex justify-center items-center gap-2">
                <Trophy className="w-10 h-10 text-yellow-700" />
                <span className="text-4xl font-bold text-yellow-800">1st</span>
              </div>
              <div className="text-7xl">{champion.flag}</div>
              <h3 className="text-2xl font-bold text-yellow-900">{champion.name}</h3>
              <p className="text-sm text-yellow-700 font-semibold">Champion</p>
              <p className="text-sm text-yellow-600">Skill: {champion.skill}</p>
            </div>
          </Card>
        </div>

        {/* Third Place */}
        {thirdPlace ? (
          <div className="order-3">
            <Card className="bg-gradient-to-br from-orange-100 to-orange-200 border-4 border-orange-400">
              <div className="p-6 text-center space-y-3">
                <div className="flex justify-center items-center gap-2">
                  <Award className="w-8 h-8 text-orange-600" />
                  <span className="text-3xl font-bold text-orange-700">3rd</span>
                </div>
                <div className="text-6xl">{thirdPlace.flag}</div>
                <h3 className="text-xl font-bold text-orange-800">{thirdPlace.name}</h3>
                <p className="text-sm text-orange-600">Third Place</p>
                <p className="text-sm text-orange-500">Skill: {thirdPlace.skill}</p>
              </div>
            </Card>
          </div>
        ) : (
          <div className="order-3" />
        )}
      </div>

      {/* Fourth Place (if available) */}
      {fourthPlace && (
        <div className="max-w-md mx-auto">
          <Card className="bg-gray-50 border-2 border-gray-300">
            <div className="p-4 text-center space-y-2">
              <div className="flex justify-center items-center gap-2">
                <span className="text-xl font-bold text-gray-600">4th Place</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-4xl">{fourthPlace.flag}</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{fourthPlace.name}</h3>
                  <p className="text-xs text-gray-500">Skill: {fourthPlace.skill}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tournament Stats Summary */}
      <Card className="max-w-3xl mx-auto bg-primary-50 border-2 border-primary-200">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
            Tournament Complete
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-primary-600">1st</div>
              <div className="text-sm text-gray-600">
                {champion.flag} {champion.name}
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-600">2nd</div>
              <div className="text-sm text-gray-600">
                {runnerUp.flag} {runnerUp.name}
              </div>
            </div>
            {thirdPlace && (
              <div>
                <div className="text-3xl font-bold text-orange-600">3rd</div>
                <div className="text-sm text-gray-600">
                  {thirdPlace.flag} {thirdPlace.name}
                </div>
              </div>
            )}
            {fourthPlace && (
              <div>
                <div className="text-3xl font-bold text-gray-500">4th</div>
                <div className="text-sm text-gray-600">
                  {fourthPlace.flag} {fourthPlace.name}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <Button
          variant="primary"
          size="lg"
          onClick={onNewTournament}
          className="gap-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
        >
          <Trophy className="w-5 h-5" />
          Start New Tournament
        </Button>
      </div>
    </div>
  );
};
