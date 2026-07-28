import { useMemo, useState } from 'react';
import {
  filterTimeline,
  formatFinalScore,
  type ChampionHistoryRow,
  type CompetitionKind,
  type TimelineFilters,
} from '../../services/championsService';
import type { Region, Team } from '../../types';
import type { ModeDescriptor } from '../../modes/types';
import { competitionForDivision } from '../../modes/registry';
import { TeamFlag } from '../ui/TeamFlag';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { REGION_LABELS } from '../../utils/regionLabels';
import { ChevronRight, X } from 'lucide-react';


const KIND_LABELS: Record<CompetitionKind, string> = {
  'world-cup': 'Mundial',
  continental: 'Continental',
  confederations: 'Copa Confederaciones',
  season: 'Temporada',
};

/** Los chips se ofrecen en este orden, pero sólo los que aparecen en las filas. */
const KIND_ORDER: CompetitionKind[] = ['world-cup', 'continental', 'confederations', 'season'];

const CHIP_LABELS: Record<CompetitionKind, string> = {
  ...KIND_LABELS,
  confederations: 'Confed.',
};

/**
 * Cómo se llama el torneo de una fila.
 *
 * En el ciclo mundialista el `kind` alcanza (salvo los continentales, que se
 * desdoblan por región). En un modo de temporada todas las filas son `season`,
 * así que el nombre sale del descriptor: la columna `region` trae la división
 * del torneo y con eso se resuelve la competición ("Liga A", "Copa", …).
 */
function competitionLabel(row: ChampionHistoryRow, descriptor?: ModeDescriptor): string {
  if (row.kind === 'continental' && row.region) {
    return `Continental · ${REGION_LABELS[row.region as Region] ?? row.region}`;
  }
  if (row.kind === 'season' && descriptor) {
    const competition = competitionForDivision(descriptor, row.region || null);
    if (competition) return competition.name;
  }
  return KIND_LABELS[row.kind];
}

// Nombre del equipo filtrado según el puesto real en que aparece (no siempre es campeón).
function teamNameFor(rows: ChampionHistoryRow[], teamId: string): string {
  for (const r of rows) {
    if (r.championId === teamId) return r.championName ?? teamId.toUpperCase();
    if (r.runnerUpId === teamId) return r.runnerUpName ?? teamId.toUpperCase();
    if (r.thirdId === teamId) return r.thirdName ?? teamId.toUpperCase();
    if (r.fourthId === teamId) return r.fourthName ?? teamId.toUpperCase();
  }
  return teamId.toUpperCase();
}

interface ChampionsTimelineProps {
  rows: ChampionHistoryRow[];
  teamFilter: string | null;
  onClearTeamFilter: () => void;
  onOpenTournament: (row: ChampionHistoryRow) => void;
  /** Descriptor del modo activo, para nombrar los torneos de temporada. */
  descriptor?: ModeDescriptor;
}

export function ChampionsTimeline({
  rows,
  teamFilter,
  onClearTeamFilter,
  onOpenTournament,
  descriptor,
}: ChampionsTimelineProps) {
  const [kind, setKind] = useState<CompetitionKind | 'all'>('all');
  const [region, setRegion] = useState<Region | null>(null);
  const { openTeamProfile } = useTeamProfile();

  const years = useMemo(() => rows.map((r) => r.year), [rows]);
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;

  // Los chips salen de las filas y no de una lista escrita a mano: en un modo de
  // temporada, tres filtros del ciclo mundialista no filtrarían nada. Con un solo
  // tipo presente no hay nada que elegir, así que la fila entera se esconde.
  const kinds = useMemo(
    () => KIND_ORDER.filter((k) => rows.some((r) => r.kind === k)),
    [rows],
  );
  const regions = useMemo(
    () =>
      (Object.keys(REGION_LABELS) as Region[]).filter((r) =>
        rows.some((row) => row.kind === 'continental' && row.region === r),
      ),
    [rows],
  );

  const filters: TimelineFilters = {
    kind,
    region: kind === 'continental' ? region : null,
    teamId: teamFilter,
    yearFrom: null,
    yearTo: null,
  };
  const visible = filterTimeline(rows, filters);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2 items-center">
          <FilterChip active={kind === 'all'} onClick={() => setKind('all')}>Todas</FilterChip>
          {kinds.map((k) => (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
              {CHIP_LABELS[k]}
            </FilterChip>
          ))}
          {kind === 'continental' && regions.length > 1 && (
            <>
              <span className="text-grass-soft text-xs px-1">·</span>
              <FilterChip active={region === null} onClick={() => setRegion(null)}>Todas</FilterChip>
              {regions.map((r) => (
                <FilterChip key={r} active={region === r} onClick={() => setRegion(r)}>
                  {REGION_LABELS[r]}
                </FilterChip>
              ))}
            </>
          )}
        </div>
      )}

      {/* Chip de filtro por equipo (cross-tab desde Palmarés) */}
      {teamFilter && (
        <button
          onClick={onClearTeamFilter}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-gold text-gold font-arcade text-[9px] uppercase"
        >
          Equipo: {teamNameFor(rows, teamFilter)}
          <X className="w-3 h-3" />
        </button>
      )}

      {minYear !== null && maxYear !== null && (
        <p className="text-xs text-grass-soft">
          {visible.length} de {rows.length} títulos · {minYear}–{maxYear}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-center py-8 text-grass-soft text-sm">
          Sin resultados para estos filtros.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <TimelineRow
              key={`${row.tournamentId}-${row.kind}-${row.region ?? ''}`}
              row={row}
              label={competitionLabel(row, descriptor)}
              onOpenProfile={openTeamProfile}
              onOpenTournament={() => onOpenTournament(row)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  row,
  label,
  onOpenProfile,
  onOpenTournament,
}: {
  row: ChampionHistoryRow;
  label: string;
  onOpenProfile: (team: Team) => void;
  onOpenTournament: () => void;
}) {
  const score = formatFinalScore(row);
  const teamOf = (id: string | null, name: string | null, region: string | null): Team | null =>
    id ? { id, name: name ?? id, flag: '', region: (region ?? 'Europe') as Region, skill: 0 } : null;

  const champion = teamOf(row.championId, row.championName, row.championRegion);
  const runnerUp = teamOf(row.runnerUpId, row.runnerUpName, row.runnerUpRegion);
  const third = teamOf(row.thirdId, row.thirdName, row.thirdRegion);
  const fourth = teamOf(row.fourthId, row.fourthName, row.fourthRegion);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-grass-dark/40 border-2 border-grass hover:bg-grass/30 transition-colors">
      {/* Año + competición */}
      <div className="flex items-center gap-3 sm:w-56 shrink-0">
        <span className="font-terminal text-led tabular-nums text-lg">{row.year}</span>
        <span className="font-arcade text-[9px] text-white uppercase leading-tight">
          {label}
        </span>
      </div>

      {/* Final */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MiniTeam team={champion} onOpenProfile={onOpenProfile} bold />
        <span className="font-terminal text-led tabular-nums whitespace-nowrap px-1">
          {score || 'vs'}
        </span>
        <MiniTeam team={runnerUp} onOpenProfile={onOpenProfile} />
      </div>

      {/* 3° / 4° */}
      <div className="flex items-center gap-2 sm:w-28 shrink-0">
        {third && <MiniFlag team={third} onOpenProfile={onOpenProfile} />}
        {fourth && <MiniFlag team={fourth} onOpenProfile={onOpenProfile} />}
      </div>

      {/* Ir al bracket */}
      <button
        onClick={onOpenTournament}
        className="shrink-0 flex items-center justify-center w-9 h-9 border-2 border-grass text-gold hover:bg-grass/40 transition-colors"
        title="Ver este torneo"
        aria-label="Ver este torneo"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function MiniTeam({
  team,
  onOpenProfile,
  bold = false,
}: {
  team: Team | null;
  onOpenProfile: (team: Team) => void;
  bold?: boolean;
}) {
  if (!team) return <span className="text-grass-soft italic text-sm">-</span>;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <TeamFlag teamId={team.id} teamName={team.name} size={24} onClick={() => onOpenProfile(team)} clickable />
      <span className={`font-arcade text-[9px] uppercase truncate ${bold ? 'text-gold' : 'text-white'}`}>
        {team.name}
      </span>
    </div>
  );
}

function MiniFlag({ team, onOpenProfile }: { team: Team; onOpenProfile: (team: Team) => void }) {
  return (
    <TeamFlag teamId={team.id} teamName={team.name} size={16} onClick={() => onOpenProfile(team)} clickable />
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
