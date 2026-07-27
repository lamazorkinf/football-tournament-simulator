import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Wand2, X, Check } from 'lucide-react';
import { crestsService, DEFAULT_CRESTS_BUCKET, type CrestFile } from '../../services/crestsService';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import type { Team } from '../../types';

/** Nombre de archivo sin extensión (para el auto-match contra el id del club). */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase();
}

/**
 * Asigna a cada club uno de los escudos ya subidos al bucket de Supabase Storage.
 * No sube archivos: sólo lista los existentes y setea teams.flag con su URL
 * pública. El auto-asignar empareja por nombre de archivo (ej. vm-alumni.png →
 * club vm-alumni).
 */
export function CrestManager() {
  const teams = useTournamentStore((s) => s.teams);
  const updateTeam = useTournamentStore((s) => s.updateTeam);

  const [bucket, setBucket] = useState(DEFAULT_CRESTS_BUCKET);
  const [crests, setCrests] = useState<CrestFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pickingFor, setPickingFor] = useState<Team | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const files = await crestsService.listCrests(bucket);
      setCrests(files);
      setLoaded(true);
      if (files.length === 0) {
        toast.info(`El bucket "${bucket}" no tiene imágenes (o no es público).`);
      }
    } catch (error) {
      console.error('Error listando escudos:', error);
      toast.error(`No se pudo leer el bucket "${bucket}". ¿Existe y es público?`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assign = async (team: Team, url: string | null) => {
    await updateTeam(team.id, { flag: url ?? '' });
  };

  const autoMatch = async () => {
    const byBase = new Map(crests.map((c) => [baseName(c.name), c.url]));
    let matched = 0;
    for (const team of teams) {
      const url = byBase.get(team.id.toLowerCase());
      if (url && team.flag !== url) {
        await updateTeam(team.id, { flag: url });
        matched++;
      }
    }
    toast[matched > 0 ? 'success' : 'info'](
      matched > 0 ? `Auto-asignados ${matched} escudos por nombre de archivo.` : 'Ningún archivo coincide con el id de un club.',
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Escudos de los clubes</CardTitle>
            <div className="flex items-center gap-2">
              <input
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="w-28 px-2 py-1 bg-grass-dark border-2 border-line text-white font-terminal text-sm"
                placeholder="bucket"
                title="Nombre del bucket de Supabase Storage"
              />
              <Button size="sm" variant="secondary" onClick={load} loading={loading} className="gap-1">
                <RefreshCw className="w-3 h-3" /> Releer
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-grass-soft mb-3">
            {loaded
              ? `${crests.length} imágenes en el bucket "${bucket}". Elegí una para cada club, o auto-asigná por nombre de archivo (ej. vm-alumni.png → club vm-alumni).`
              : 'Leyendo el bucket…'}
          </p>
          <Button size="sm" onClick={autoMatch} disabled={crests.length === 0} className="gap-1">
            <Wand2 className="w-3 h-3" /> Auto-asignar por nombre de archivo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <ul className="divide-y divide-line/40">
            {teams.map((team) => (
              <li key={team.id} className="flex items-center gap-3 py-2">
                <TeamFlag teamId={team.id} teamName={team.name} flag={team.flag} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white truncate">{team.name}</span>
                  <span className="block text-[10px] text-grass-soft truncate">{team.id}</span>
                </span>
                {team.flag && /^https?:/i.test(team.flag) && (
                  <button
                    onClick={() => assign(team, null)}
                    className="text-[10px] text-grass-soft hover:text-white uppercase font-arcade"
                    title="Quitar escudo"
                  >
                    Quitar
                  </button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setPickingFor(team)} disabled={crests.length === 0}>
                  Elegir
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {pickingFor && (
        <CrestPickerModal
          team={pickingFor}
          crests={crests}
          onClose={() => setPickingFor(null)}
          onPick={async (url) => {
            await assign(pickingFor, url);
            setPickingFor(null);
          }}
        />
      )}
    </div>
  );
}

function CrestPickerModal({
  team,
  crests,
  onClose,
  onPick,
}: {
  team: Team;
  crests: CrestFile[];
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-auto bg-grass-dark border-4 border-line shadow-hard-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-line sticky top-0 bg-grass-dark">
          <p className="font-arcade text-xs text-gold truncate">Escudo para {team.name}</p>
          <button onClick={onClose} className="text-grass-soft hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {crests.map((c) => {
            const selected = team.flag === c.url;
            return (
              <button
                key={c.name}
                onClick={() => onPick(c.url)}
                className={`relative flex flex-col items-center gap-1 p-2 border-2 transition-colors ${
                  selected ? 'border-gold bg-black/40' : 'border-line hover:bg-grass/40'
                }`}
                title={c.name}
              >
                {selected && <Check className="w-4 h-4 text-led absolute top-1 right-1" />}
                <img src={c.url} alt={c.name} className="w-12 h-12 object-contain" loading="lazy" />
                <span className="text-[9px] text-grass-soft truncate w-full">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
