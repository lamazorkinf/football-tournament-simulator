import { useMemo } from 'react';
import type { Team } from '../../types';
import { Trophy, Medal, Award } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';

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

  // Posiciones del confeti fijadas una vez: si se calculan con Math.random() en
  // el render, saltan a otra posición en cada re-render del componente.
  const confetti = useMemo(
    () =>
      Array.from({ length: 50 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${Math.random() * 2}s`,
      })),
    []
  );

  if (!champion || !runnerUp) return null;

  return (
    <div className="space-y-8">
      {/* Champion Banner */}
      <div className="relative bg-grass-dark border-4 border-gold shadow-hard-panel p-12 overflow-hidden">
        {/* Confetti effect background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-full h-full">
            {confetti.map((c, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-gold blink"
                style={{ left: c.left, top: c.top, animationDelay: c.delay }}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 text-center space-y-4">
          <Trophy className="w-24 h-24 mx-auto animate-bounce text-gold" />
          <h1 className="font-arcade text-xl text-gold blink">WORLD CUP CHAMPION</h1>
          <div className="flex items-center justify-center gap-4">
            <TeamFlag teamId={champion.id} teamName={champion.name} size={64} />
            <div className="text-left">
              <h2 className="font-arcade text-lg text-white text-shadow-retro">{champion.name}</h2>
              <p className="text-grass-soft text-xl">Skill Rating: {Math.round(champion.skill)}</p>
            </div>
          </div>
          <p className="text-2xl text-white font-semibold mt-4">
            Congratulations on winning the World Cup!
          </p>
        </div>
      </div>

      {/* Podium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {/* Second Place */}
        <div className="order-2 md:order-1">
          <Card className="border-grass-soft">
            <div className="p-6 text-center space-y-3">
              <div className="flex justify-center items-center gap-2">
                <Medal className="w-8 h-8 text-grass-soft" />
                <span className="font-arcade text-xl text-grass-soft">2nd</span>
              </div>
              <div className="flex justify-center"><TeamFlag teamId={runnerUp.id} teamName={runnerUp.name} size={48} /></div>
              <h3 className="font-arcade text-sm text-white text-shadow-retro">{runnerUp.name}</h3>
              <p className="text-sm text-grass-soft">Runner-up</p>
              <p className="text-sm text-grass-soft">Skill: {Math.round(runnerUp.skill)}</p>
            </div>
          </Card>
        </div>

        {/* First Place - Taller */}
        <div className="order-1 md:order-2">
          <Card className="border-gold transform md:scale-110 md:translate-y-[-1rem]">
            <div className="p-6 text-center space-y-3">
              <div className="flex justify-center items-center gap-2">
                <Trophy className="w-10 h-10 text-gold" />
                <span className="font-arcade text-2xl text-gold">1st</span>
              </div>
              <div className="flex justify-center"><TeamFlag teamId={champion.id} teamName={champion.name} size={64} /></div>
              <h3 className="font-arcade text-base text-white text-shadow-retro">{champion.name}</h3>
              <p className="text-sm text-gold font-semibold">Champion</p>
              <p className="text-sm text-gold">Skill: {Math.round(champion.skill)}</p>
            </div>
          </Card>
        </div>

        {/* Third Place */}
        {thirdPlace ? (
          <div className="order-3">
            <Card className="border-led">
              <div className="p-6 text-center space-y-3">
                <div className="flex justify-center items-center gap-2">
                  <Award className="w-8 h-8 text-led" />
                  <span className="font-arcade text-xl text-led">3rd</span>
                </div>
                <div className="flex justify-center"><TeamFlag teamId={thirdPlace.id} teamName={thirdPlace.name} size={48} /></div>
                <h3 className="font-arcade text-sm text-white text-shadow-retro">{thirdPlace.name}</h3>
                <p className="text-sm text-led">Third Place</p>
                <p className="text-sm text-grass-soft">Skill: {Math.round(thirdPlace.skill)}</p>
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
          <Card className="border-2">
            <div className="p-4 text-center space-y-2">
              <div className="flex justify-center items-center gap-2">
                <span className="font-arcade text-sm text-grass-soft">4th Place</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <TeamFlag teamId={fourthPlace.id} teamName={fourthPlace.name} size={32} />
                <div>
                  <h3 className="font-arcade text-xs text-white text-shadow-retro">{fourthPlace.name}</h3>
                  <p className="text-xs text-grass-soft">Skill: {Math.round(fourthPlace.skill)}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tournament Stats Summary */}
      <Card className="max-w-3xl mx-auto bg-grass/30">
        <div className="p-6">
          <h3 className="font-arcade text-sm text-white text-shadow-retro mb-4 text-center">
            Tournament Complete
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="font-terminal text-3xl text-gold tabular-nums">1st</div>
              <div className="flex items-center justify-center gap-2 text-sm text-grass-soft">
                <TeamFlag teamId={champion.id} teamName={champion.name} size={16} />
                {champion.name}
              </div>
            </div>
            <div>
              <div className="font-terminal text-3xl text-grass-soft tabular-nums">2nd</div>
              <div className="flex items-center justify-center gap-2 text-sm text-grass-soft">
                <TeamFlag teamId={runnerUp.id} teamName={runnerUp.name} size={16} />
                {runnerUp.name}
              </div>
            </div>
            {thirdPlace && (
              <div>
                <div className="font-terminal text-3xl text-led tabular-nums">3rd</div>
                <div className="flex items-center justify-center gap-2 text-sm text-grass-soft">
                  <TeamFlag teamId={thirdPlace.id} teamName={thirdPlace.name} size={16} />
                  {thirdPlace.name}
                </div>
              </div>
            )}
            {fourthPlace && (
              <div>
                <div className="font-terminal text-3xl text-grass-soft tabular-nums">4th</div>
                <div className="flex items-center justify-center gap-2 text-sm text-grass-soft">
                  <TeamFlag teamId={fourthPlace.id} teamName={fourthPlace.name} size={16} />
                  {fourthPlace.name}
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
          className="gap-2"
        >
          <Trophy className="w-5 h-5" />
          Start New Tournament
        </Button>
      </div>
    </div>
  );
};
