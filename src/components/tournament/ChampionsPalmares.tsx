import { useState } from 'react';
import type { PalmaresRow } from '../../services/championsService';
import type { Region, Team } from '../../types';
import { TeamFlag } from '../ui/TeamFlag';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { Trophy, Medal, Award } from 'lucide-react';

const REGION_LABELS: Record<Region, string> = {
  Europe: 'Europa',
  America: 'América',
  Africa: 'África',
  Asia: 'Asia',
};

interface ChampionsPalmaresProps {
  rows: PalmaresRow[];
  onSelectTeam: (teamId: string) => void;
}

export function ChampionsPalmares({ rows, onSelectTeam }: ChampionsPalmaresProps) {
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const { openTeamProfile } = useTeamProfile();

  const visible = regionFilter === 'all'
    ? rows
    : rows.filter((r) => r.region === regionFilter);

  return (
    <div className="space-y-4">
      {/* Filtro por región */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={regionFilter === 'all'} onClick={() => setRegionFilter('all')}>
          Todas
        </FilterChip>
        {(Object.keys(REGION_LABELS) as Region[]).map((region) => (
          <FilterChip
            key={region}
            active={regionFilter === region}
            onClick={() => setRegionFilter(region)}
          >
            {REGION_LABELS[region]}
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-center py-8 text-grass-soft text-sm">
          Sin campeones para esta región.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-grass-dark">
              <tr className="border-b-2 border-grass">
                <th className="text-left py-3 px-2 sm:px-4 font-arcade text-[10px] text-gold uppercase">#</th>
                <th className="text-left py-3 px-2 sm:px-4 font-arcade text-[10px] text-gold uppercase">Equipo</th>
                <th className="py-3 px-2 font-arcade text-[10px] text-gold uppercase" title="Títulos">
                  <Trophy className="w-4 h-4 text-gold inline" />
                </th>
                <th className="py-3 px-2 font-arcade text-[10px] text-gold uppercase" title="Subcampeonatos">
                  <Medal className="w-4 h-4 text-grass-soft inline" />
                </th>
                <th className="py-3 px-2 font-arcade text-[10px] text-gold uppercase" title="Terceros puestos">
                  <Award className="w-4 h-4 text-grass-soft inline" />
                </th>
                <th className="py-3 px-2 font-arcade text-[9px] text-grass-soft uppercase">MUN</th>
                <th className="py-3 px-2 font-arcade text-[9px] text-grass-soft uppercase">CON</th>
                <th className="py-3 px-2 font-arcade text-[9px] text-grass-soft uppercase">CCF</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-grass">
              {visible.map((row, idx) => {
                const team: Team = {
                  id: row.teamId,
                  name: row.teamName,
                  flag: '',
                  region: row.region as Region,
                  skill: 0,
                };
                return (
                  <tr
                    key={row.teamId}
                    className="hover:bg-grass/40 transition-colors cursor-pointer"
                    onClick={() => onSelectTeam(row.teamId)}
                  >
                    <td className="py-3 px-2 sm:px-4 font-terminal text-led tabular-nums text-lg">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-2 sm:px-4">
                      <div className="flex items-center gap-2">
                        {/* La bandera abre el perfil; el span frena la propagación
                            para que el clic no dispare también onSelectTeam de la fila.
                            (TeamFlag.onClick es () => void, no recibe el evento.) */}
                        <span onClick={(e) => e.stopPropagation()}>
                          <TeamFlag
                            teamId={row.teamId}
                            teamName={row.teamName}
                            size={24}
                            onClick={() => openTeamProfile(team)}
                            clickable
                          />
                        </span>
                        <span className="font-arcade text-[10px] uppercase whitespace-nowrap">
                          {row.teamName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center font-terminal text-led tabular-nums text-lg">{row.titles}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.runnerUps}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.thirds}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.wcTitles}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.continentalTitles}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.confedTitles}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 font-arcade text-[9px] uppercase border-2 transition-colors ${
        active
          ? 'border-gold text-gold bg-grass/30'
          : 'border-grass text-grass-soft hover:text-white hover:bg-grass/40'
      }`}
    >
      {children}
    </button>
  );
}
