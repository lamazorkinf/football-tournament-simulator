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
          error instanceof Error ? error.message : 'Failed to import tournament'
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
            Export Tournament
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-arcade text-[10px] text-gold uppercase mb-2">Full Tournament Export</h3>
            <p className="text-sm text-grass-soft mb-4">
              Export complete tournament data including teams, groups, matches, and results.
              Use this to backup your progress or share with others.
            </p>
            <Button variant="primary" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export Complete Tournament
            </Button>
          </div>

          <div className="border-t-2 border-grass pt-4">
            <h3 className="font-arcade text-[10px] text-gold uppercase mb-2">Teams Only Export</h3>
            <p className="text-sm text-grass-soft mb-4">
              Export only team data with current skill ratings and regional assignments.
            </p>
            <Button variant="outline" onClick={exportTeamsOnly} className="gap-2">
              <Download className="w-4 h-4" />
              Export Teams Data
            </Button>
          </div>

          <div className="bg-black/40 border-2 border-gold p-4 text-sm">
            <p className="text-gold font-medium mb-1">💡 Export Tips:</p>
            <ul className="text-grass-soft space-y-1">
              <li>• Exports are saved as JSON files</li>
              <li>• Files include timestamp for easy identification</li>
              <li>• Keep backups before making major changes</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-grass text-white">
          <CardTitle className="text-white flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Import Tournament
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-arcade text-[10px] text-gold uppercase mb-2">Load Tournament Data</h3>
            <p className="text-sm text-grass-soft mb-4">
              Import a previously exported tournament file. It is added to the database as a new
              tournament and selected right away.
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
                  {isImporting ? 'Importing…' : 'Click to select a file'}
                </span>
                <span className="text-xs text-grass-soft">JSON files only</span>
              </label>
            </div>

            {importError && (
              <div className="mt-4 bg-black/40 border-2 border-loss p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-loss flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-loss">Import Failed</p>
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
                  <p className="font-medium text-led">Import Successful!</p>
                  <p className="text-sm text-grass-soft">
                    Tournament saved to the database and selected.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-black/40 border-2 border-gold p-4 text-sm">
            <p className="text-gold font-medium mb-1">⚠️ Warning:</p>
            <ul className="text-grass-soft space-y-1">
              <li>• The imported tournament is added alongside your existing ones</li>
              <li>• It gets a fresh id, so it never overwrites a tournament you already have</li>
              <li>• Only import files from trusted sources</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>File Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-grass-soft mb-1">Teams Count</p>
              <p className="font-semibold text-lg text-led font-terminal tabular-nums">{teams.length}</p>
            </div>
            <div>
              <p className="text-grass-soft mb-1">Tournament Status</p>
              <p className="font-semibold text-lg text-led font-terminal tabular-nums">
                {currentTournament?.worldCup ? 'World Cup' : 'Qualifiers'}
              </p>
            </div>
            <div>
              <p className="text-grass-soft mb-1">Regions</p>
              <p className="font-semibold text-lg text-led font-terminal tabular-nums">
                {Object.keys(currentTournament?.qualifiers || {}).length}
              </p>
            </div>
            <div>
              <p className="text-grass-soft mb-1">Stored Tournaments</p>
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
