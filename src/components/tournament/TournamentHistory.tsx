import { useState, useMemo } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Trophy, Calendar, Award, Users, Trash2, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Tournament } from '../../types';

type FilterType = 'all' | 'qualifiers' | 'world-cup' | 'completed';

export function TournamentHistory() {
  const { tournaments, selectTournament, deleteTournament, currentTournamentId } = useTournamentStore();
  const [filter, setFilter] = useState<FilterType>('all');

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
      case 'completed': return { label: 'Completado', color: 'green' };
      case 'world-cup': return { label: 'Mundial', color: 'yellow' };
      default: return { label: 'Clasificatorias', color: 'blue' };
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

  const handleView = (tournamentId: string) => {
    selectTournament(tournamentId);
  };

  const handleDelete = (tournamentId: string) => {
    deleteTournament(tournamentId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold">Historial de Torneos</h2>
              <p className="text-gray-300 text-sm mt-1">
                Visualiza y gestiona todos tus torneos
              </p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="border-b border-gray-200 px-6 py-4">
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
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === filterOption.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filterOption.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tournament Cards */}
      {filteredTournaments.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No hay torneos
          </h3>
          <p className="text-gray-600">
            {filter === 'all'
              ? 'Crea tu primer torneo para comenzar'
              : 'No hay torneos en esta categoría'}
          </p>
        </div>
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
                className={`bg-white rounded-lg shadow-sm border-2 overflow-hidden transition-all hover:shadow-md ${
                  isActive ? 'border-primary-600' : 'border-gray-200'
                }`}
              >
                {/* Card Header */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-primary-600" />
                      <span className="font-bold text-gray-900 text-lg">
                        {tournament.year}
                      </span>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}
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
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="text-xs text-gray-500">Partidos</div>
                        <div className="font-semibold text-gray-900">
                          {stats.playedMatches}/{stats.totalMatches}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="text-xs text-gray-500">Progreso</div>
                        <div className="font-semibold text-gray-900">
                          {progress}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Champion */}
                  {tournament.worldCup?.champion && (
                    <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                      <Award className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-900">
                        Campeón: {tournament.worldCup.champion}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleView(tournament.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      {isActive ? 'Activo' : 'Ver'}
                    </button>
                    <button
                      onClick={() => handleDelete(tournament.id)}
                      disabled={tournaments.length === 1}
                      className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        tournaments.length === 1
                          ? 'No puedes eliminar el único torneo'
                          : 'Eliminar torneo'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isActive && (
                  <div className="bg-primary-50 border-t border-primary-200 px-4 py-2">
                    <span className="text-xs font-medium text-primary-700">
                      Torneo Activo
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
