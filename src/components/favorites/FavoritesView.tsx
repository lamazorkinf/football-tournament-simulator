import { useMemo, useState } from 'react';
import { Star, Search, Trash2 } from 'lucide-react';
import type { Region, Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TeamFlag } from '../ui/TeamFlag';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/** Normaliza para buscar sin distinguir mayúsculas ni tildes. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function FavoritesView() {
  const teams = useTournamentStore((s) => s.teams);
  const { favoriteTeamIds, toggleFavorite, clearFavorites } = useFavoritesStore();
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');

  const favoriteSet = useMemo(() => new Set(favoriteTeamIds), [favoriteTeamIds]);

  const visibleTeams = useMemo(() => {
    const query = normalize(search.trim());
    return teams
      .filter((t) => regionFilter === 'all' || t.region === regionFilter)
      .filter((t) => !query || normalize(t.name).includes(query) || normalize(t.id).includes(query))
      .sort((a, b) => {
        const favDiff = Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id));
        return favDiff !== 0 ? favDiff : b.skill - a.skill;
      });
  }, [teams, search, regionFilter, favoriteSet]);

  // Ids marcados que ya no existen en la base de equipos no cuentan.
  const favoriteCount = teams.filter((t) => favoriteSet.has(t.id)).length;

  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = () => setConfirmClear(true);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap min-w-0">
            <Star className="w-5 h-5 text-gold flex-shrink-0" />
            <span className="truncate">Equipos Favoritos ({favoriteCount})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-grass-soft">
            Los partidos de tus equipos favoritos se muestran siempre en la jornada en vivo.
            Si tus favoritos generan más de 12 partidos, se priorizan los de mayor suma de skill;
            si generan menos, se completa hasta 12 con los mejores partidos de la jornada.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-grass-soft absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar equipo…"
                className="w-full pl-9 pr-3 py-2 min-h-11 bg-night border-2 border-grass text-sm text-white placeholder:text-grass-soft focus:outline-none focus:border-gold"
              />
            </div>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as Region | 'all')}
              className="px-3 py-2 min-h-11 bg-night border-2 border-grass text-sm text-white focus:outline-none focus:border-gold"
            >
              <option value="all">Todas las regiones</option>
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <button
              onClick={handleClear}
              disabled={favoriteCount === 0}
              className="flex items-center justify-center gap-2 px-3 py-2 min-h-11 border-2 border-grass text-grass-soft hover:bg-grass/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-arcade text-[10px] uppercase"
              title="Quitar todos los favoritos"
            >
              <Trash2 className="w-4 h-4" />
              Limpiar
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {visibleTeams.length > 0 ? (
            <div className="space-y-1">
              {visibleTeams.map((team) => (
                <FavoriteTeamRow
                  key={team.id}
                  team={team}
                  isFavorite={favoriteSet.has(team.id)}
                  onToggle={() => toggleFavorite(team.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-grass-soft py-8 text-sm">
              No hay equipos que coincidan con la búsqueda
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        variant="danger"
        title="Quitar todos los favoritos"
        confirmLabel="Quitar todos"
        description={<p>Se desmarcan los {favoriteCount} equipos favoritos. Podés volver a marcarlos cuando quieras.</p>}
        onConfirm={clearFavorites}
      />
    </div>
  );
}

function FavoriteTeamRow({
  team,
  isFavorite,
  onToggle,
}: {
  team: Team;
  isFavorite: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={isFavorite}
      className={`w-full flex items-center gap-3 px-3 py-2 min-h-12 border-2 transition-colors text-left ${
        isFavorite
          ? 'bg-grass/20 border-gold'
          : 'bg-grass-dark border-grass hover:bg-grass/20'
      }`}
    >
      <Star
        className={`w-5 h-5 flex-shrink-0 ${isFavorite ? 'text-gold fill-gold' : 'text-grass-soft'}`}
      />
      <TeamFlag teamId={team.id} teamName={team.name} size={24} />
      <span className="flex-1 min-w-0 truncate text-sm text-white">{team.name}</span>
      <span className="text-xs text-grass-soft uppercase hidden sm:inline">{team.region}</span>
      <span className="font-arcade text-[10px] text-led w-10 text-right">{Math.round(team.skill)}</span>
    </button>
  );
}
