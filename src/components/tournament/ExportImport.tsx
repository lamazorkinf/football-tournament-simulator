import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Download, Upload, FileJson, AlertCircle } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import type { Cycle } from '../../types';

const REGIONS = ['Europe', 'America', 'Africa', 'Asia'] as const;

/**
 * Valida la FORMA del JSON importado, no solo la presencia de campos. Antes
 * bastaba con que existieran `version`, `teams` y `tournament`: un JSON con
 * `teams: "hola"` pasaba, se guardaba y el store crasheaba al arrancar en un
 * bucle de recarga, sin estado válido al que volver.
 */
function validateImportData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'El archivo no es un objeto JSON válido.';
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.teams) || d.teams.length === 0) {
    return 'El archivo no contiene una lista de equipos válida.';
  }
  const teamsOk = d.teams.every((t) => {
    if (!t || typeof t !== 'object') return false;
    const team = t as Record<string, unknown>;
    return (
      typeof team.id === 'string' &&
      typeof team.name === 'string' &&
      typeof team.skill === 'number' &&
      REGIONS.includes(team.region as (typeof REGIONS)[number])
    );
  });
  if (!teamsOk) return 'Algún equipo tiene un formato o una región inválidos.';

  const tournament = d.tournament as Record<string, unknown> | null | undefined;
  if (!tournament || typeof tournament !== 'object' || typeof tournament.id !== 'string') {
    return 'El torneo del archivo no tiene un formato válido.';
  }
  const qualifiers = tournament.qualifiers as Record<string, unknown> | undefined;
  if (!qualifiers || REGIONS.some((r) => !Array.isArray(qualifiers[r]))) {
    return 'Las clasificatorias del torneo tienen un formato inválido.';
  }

  return null;
}

export function ExportImport() {
  const { teams, tournaments, currentTournament, importTournament } = useTournamentStore();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = () => {
    const data = {
      version: 1,
      exportDate: new Date().toISOString(),
      teams,
      tournament: currentTournament,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `football-tournament-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(false);

    const reader = new FileReader();
    reader.onload = async (e) => {
      setIsImporting(true);
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // Validar la forma completa antes de escribir en la base.
        const validationError = validateImportData(data);
        if (validationError) {
          throw new Error(validationError);
        }

        // El torneo se da de alta en la base (con id nuevo) y queda
        // seleccionado. No hace falta recargar la página: la DB es la única
        // fuente de verdad y el store ya refleja el alta.
        await importTournament(data.tournament as Cycle);
        setImportSuccess(true);
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : 'No se pudo importar el torneo'
        );
      } finally {
        setIsImporting(false);
      }
    };

    reader.readAsText(file);
  };

  const exportTeamsOnly = () => {
    const data = {
      version: 1,
      exportDate: new Date().toISOString(),
      teams,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `football-teams-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-grass text-white">
          <CardTitle className="text-white flex items-center gap-2">
            <FileJson className="w-6 h-6" />
            Exportar Torneo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-arcade text-[10px] text-gold uppercase mb-2">Exportar el Torneo Completo</h3>
            <p className="text-sm text-grass-soft mb-4">
              Exportá todos los datos del torneo: equipos, grupos, partidos y resultados.
              Usalo para respaldar tu progreso o compartirlo con otros.
            </p>
            <Button variant="primary" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Exportar Torneo Completo
            </Button>
          </div>

          <div className="border-t-2 border-grass pt-4">
            <h3 className="font-arcade text-[10px] text-gold uppercase mb-2">Exportar Solo los Equipos</h3>
            <p className="text-sm text-grass-soft mb-4">
              Exportá solo los datos de los equipos, con su habilidad y región actuales.
            </p>
            <Button variant="outline" onClick={exportTeamsOnly} className="gap-2">
              <Download className="w-4 h-4" />
              Exportar Datos de Equipos
            </Button>
          </div>

          <div className="bg-black/40 border-2 border-gold p-4 text-sm">
            <p className="text-gold font-medium mb-1">💡 Consejos para exportar:</p>
            <ul className="text-grass-soft space-y-1">
              <li>• Las exportaciones se guardan como archivos JSON</li>
              <li>• Los archivos incluyen la fecha para identificarlos fácilmente</li>
              <li>• Hacé un respaldo antes de cambios grandes</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-grass text-white">
          <CardTitle className="text-white flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Importar Torneo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-arcade text-[10px] text-gold uppercase mb-2">Cargar Datos de un Torneo</h3>
            <p className="text-sm text-grass-soft mb-4">
              Importá un archivo de torneo exportado previamente. Se agrega a la base de datos
              como un torneo nuevo y queda seleccionado de inmediato.
            </p>

            <div className="border-2 border-dashed border-grass p-8 text-center hover:border-gold transition-colors">
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={isImporting}
                className="hidden"
                id="import-file"
              />
              <label
                htmlFor="import-file"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-12 h-12 text-grass-soft" />
                <span className="text-sm font-medium text-white">
                  {isImporting ? 'Importando…' : 'Hacé clic para elegir un archivo'}
                </span>
                <span className="text-xs text-grass-soft">Solo archivos JSON</span>
              </label>
            </div>

            {importError && (
              <div className="mt-4 bg-black/40 border-2 border-loss p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-loss flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-loss">No se pudo importar</p>
                  <p className="text-sm text-grass-soft">{importError}</p>
                </div>
              </div>
            )}

            {importSuccess && (
              <div className="mt-4 bg-black/40 border-2 border-led p-4 flex items-start gap-3">
                <div className="w-5 h-5 bg-led flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-night text-xs">✓</span>
                </div>
                <div>
                  <p className="font-medium text-led">¡Importación exitosa!</p>
                  <p className="text-sm text-grass-soft">
                    El torneo se guardó en la base de datos y quedó seleccionado.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-black/40 border-2 border-gold p-4 text-sm">
            <p className="text-gold font-medium mb-1">⚠️ Advertencia:</p>
            <ul className="text-grass-soft space-y-1">
              <li>• El torneo importado se agrega junto a los que ya tenés</li>
              <li>• Recibe un id nuevo, así que nunca sobrescribe un torneo existente</li>
              <li>• Importá solo archivos de fuentes confiables</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos del Archivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-grass-soft mb-1">Cantidad de Equipos</p>
              <p className="font-semibold text-lg text-led font-terminal tabular-nums">{teams.length}</p>
            </div>
            <div>
              <p className="text-grass-soft mb-1">Estado del Torneo</p>
              <p className="font-semibold text-lg text-led font-terminal tabular-nums">
                {currentTournament?.worldCup ? 'Mundial' : 'Clasificatorias'}
              </p>
            </div>
            <div>
              <p className="text-grass-soft mb-1">Regiones</p>
              <p className="font-semibold text-lg text-led font-terminal tabular-nums">
                {Object.keys(currentTournament?.qualifiers || {}).length}
              </p>
            </div>
            <div>
              <p className="text-grass-soft mb-1">Torneos Guardados</p>
              <p className="font-semibold text-lg text-led font-terminal tabular-nums">
                {tournaments.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
