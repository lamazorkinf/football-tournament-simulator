import { useState, useMemo } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Trophy, Calendar, Award, Users, Trash2, Eye, RefreshCw, Archive } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ViewHeader } from '../ui/ViewHeader';
import type { Tournament } from '../../types';
import type { View } from '../../types/view';

type FilterType = 'all' | 'qualifiers' | 'world-cup' | 'completed';

interface TournamentHistoryProps {
  /**
   * Navegación de la app. "Ver" no alcanza con activar el torneo: el usuario
   * queda mirando la misma lista y parece que el botón no hizo nada.
   */
  onNavigate?: (view: View) => void;
}

export function TournamentHistory({ onNavigate }: TournamentHistoryProps = {}) {
  const { tournaments, selectTournament, deleteTournament, recalculateTournamentPerformances, currentTournamentId } = useTournamentStore();
  // El campeón se guarda como id (`champion: final.winnerId`), así que hay que
  // resolverlo contra el pool de equipos — igual que hacen `ContinentalView` y
  // `ConfederationsCupView`.
  const teams = useTournamentStore((s) => s.teams);
  const [filter, setFilter] = useState<FilterType>('all');
  const [pendingDelete, setPendingDelete] = useState<Tournament | null>(null);
  const [pendingRecalc, setPendingRecalc] = useState<Tournament | null>(null);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'completed') return !!t.worldCup?.champion;
      if (filter === 'world-cup') return !!t.worldCup && !t.worldCup.champion;
      if (filter === 'qualifiers') return !t.worldCup;
      return true;
    });
  }, [tournaments, filter]);

  const getStatus = (tournament: Tournament) => {
    if (tournament.worldCup?.champion) return 'completed';
    if (tournament.worldCup) return 'world-cup';
    return 'qualifiers';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return { label: 'Completado', className: 'text-led border-led' };
      case 'world-cup': return { label: 'Mundial', className: 'text-gold border-gold' };
      default: return { label: 'Clasificatorias', className: 'text-grass-soft border-grass' };
    }
  };

  const getStats = (tournament: Tournament) => {
    let totalMatches = 0;
    let playedMatches = 0;

    // Count qualifier matches
    Object.values(tournament.qualifiers).forEach((groups) => {
      groups.forEach((group) => {
        totalMatches += group.matches.length;
        playedMatches += group.matches.filter((m) => m.isPlayed).length;
      });
    });

    // Count world cup matches
    if (tournament.worldCup) {
      tournament.worldCup.groups.forEach((group) => {
        totalMatches += group.matches.length;
        playedMatches += group.matches.filter((m) => m.isPlayed).length;
      });

      const knockout = tournament.worldCup.knockout;
      const knockoutMatches = [
        ...knockout.roundOf32,
        ...knockout.roundOf16,
        ...knockout.quarterFinals,
        ...knockout.semiFinals,
        ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
        ...(knockout.final ? [knockout.final] : []),
      ];
      totalMatches += knockoutMatches.length;
      playedMatches += knockoutMatches.filter((m) => m.isPlayed).length;
    }

    return { totalMatches, playedMatches };
  };

  /** Nombre del equipo, o el id si no está en el pool (modo distinto, equipo borrado). */
  const teamName = (teamId: string) => teams.find((t) => t.id === teamId)?.name ?? teamId;

  const handleView = (tournamentId: string) => {
    selectTournament(tournamentId);
    // Y llevar al usuario al torneo que acaba de elegir: quedarse en la lista
    // hacía que "Ver" pareciera un botón muerto.
    onNavigate?.('hub');
  };

  const handleDelete = (tournament: Tournament) => {
    setPendingDelete(tournament);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <ViewHeader
          icon={Trophy}
          title="Historial de Torneos"
          subtitle="Visualiza y gestiona todos tus torneos"
        />

        {/* Filter Tabs */}
        <div className="px-6 py-4">
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all' as const, label: 'Todos' },
              { id: 'qualifiers' as const, label: 'Clasificatorias' },
              { id: 'world-cup' as const, label: 'Mundial' },
              { id: 'completed' as const, label: 'Completados' },
            ].map((filterOption) => (
              <button
                key={filterOption.id}
                onClick={() => setFilter(filterOption.id)}
                className={`px-4 py-2 font-arcade text-[10px] uppercase border-2 transition-colors ${
                  filter === filterOption.id
                    ? 'bg-grass text-white border-line'
                    : 'text-grass-soft border-transparent hover:bg-grass/40'
                }`}
              >
                {filterOption.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tournament Cards */}
      {filteredTournaments.length === 0 ? (
        <Card>
          <CardContent>
            {filter === 'all' ? (
              <EmptyState
                icon={Archive}
                title="Sin torneos"
                description="Creá uno desde el selector de torneos."
              />
            ) : (
              <EmptyState
                icon={Archive}
                title="Sin torneos en esta categoría"
                description="Probá con otro filtro."
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((tournament) => {
            const status = getStatus(tournament);
            const statusInfo = getStatusLabel(status);
            const stats = getStats(tournament);
            const progress =
              stats.totalMatches > 0
                ? Math.round((stats.playedMatches / stats.totalMatches) * 100)
                : 0;
            const isActive = tournament.id === currentTournamentId;

            return (
              <motion.div
                key={tournament.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-grass-dark border-4 shadow-hard-panel overflow-hidden transition-colors ${
                  isActive ? 'border-gold' : 'border-line hover:border-led'
                }`}
              >
                {/* Card Header */}
                <div className="px-4 py-3 border-b-4 border-grass">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-gold" />
                      <span className="font-terminal text-lg text-white tabular-nums">
                        {tournament.year}
                      </span>
                    </div>
                    <span
                      className={`font-arcade text-[10px] uppercase px-2 py-1 bg-black/40 border ${statusInfo.className}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-grass-soft" />
                      <div>
                        <div className="text-xs text-grass-soft">Partidos</div>
                        <div className="font-terminal text-led tabular-nums">
                          {stats.playedMatches}/{stats.totalMatches}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-grass-soft" />
                      <div>
                        <div className="text-xs text-grass-soft">Progreso</div>
                        <div className="font-terminal text-led tabular-nums">
                          {progress}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Champion */}
                  {tournament.worldCup?.champion && (
                    <div className="flex items-center gap-2 bg-black/40 border border-gold px-3 py-2">
                      <Award className="w-4 h-4 text-gold" />
                      <span className="text-sm text-gold">
                        Campeón: {teamName(tournament.worldCup.champion)}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant={isActive ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => handleView(tournament.id)}
                      className="flex-1 gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      {isActive ? 'Activo' : 'Ver'}
                    </Button>
                    {tournament.worldCup?.champion && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingRecalc(tournament)}
                        title="Recalcular rendimientos de equipos"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(tournament)}
                      disabled={tournaments.length === 1}
                      title={
                        tournaments.length === 1
                          ? 'No puedes eliminar el único torneo'
                          : 'Eliminar torneo'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {isActive && (
                  <div className="bg-grass/30 border-t-4 border-gold px-4 py-2">
                    <span className="font-arcade text-[10px] text-gold uppercase">
                      Torneo Activo
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        variant="danger"
        title="Eliminar torneo"
        confirmLabel="Eliminar"
        description={
          <>
            <p>Se elimina <strong className="text-white">{pendingDelete?.name}</strong> y todo su historial de partidos.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={async () => {
          if (pendingDelete) await deleteTournament(pendingDelete.id);
        }}
      />

      <ConfirmDialog
        open={pendingRecalc !== null}
        onOpenChange={(open) => { if (!open) setPendingRecalc(null); }}
        title="Recalcular rendimientos"
        confirmLabel="Recalcular"
        description={
          <p>
            Se eliminan y recrean todos los registros de rendimiento de los equipos
            para <strong className="text-white">{pendingRecalc?.name}</strong>. Los datos
            se recalculan a partir de los partidos, así que no se pierde nada.
          </p>
        }
        onConfirm={() => {
          if (pendingRecalc) recalculateTournamentPerformances(pendingRecalc.id);
        }}
      />
    </div>
  );
}
