import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Download, Upload, FileJson, AlertCircle } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';

export function ExportImport() {
  const { teams, currentTournament } = useTournamentStore();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

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
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // Validate the data structure
        if (!data.version || !data.teams || !data.tournament) {
          throw new Error('Invalid tournament file format');
        }

        // Save to localStorage directly
        localStorage.setItem(
          'football-tournament-storage',
          JSON.stringify({
            state: {
              teams: data.teams,
              currentTournament: data.tournament,
            },
            version: 1,
          })
        );

        setImportSuccess(true);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : 'Failed to import tournament'
        );
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
        <CardHeader className="bg-primary-600 text-white rounded-t-lg">
          <CardTitle className="text-white flex items-center gap-2">
            <FileJson className="w-6 h-6" />
            Export Tournament
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Full Tournament Export</h3>
            <p className="text-sm text-gray-600 mb-4">
              Export complete tournament data including teams, groups, matches, and results.
              Use this to backup your progress or share with others.
            </p>
            <Button variant="primary" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export Complete Tournament
            </Button>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h3 className="font-semibold text-gray-900 mb-2">Teams Only Export</h3>
            <p className="text-sm text-gray-600 mb-4">
              Export only team data with current skill ratings and regional assignments.
            </p>
            <Button variant="outline" onClick={exportTeamsOnly} className="gap-2">
              <Download className="w-4 h-4" />
              Export Teams Data
            </Button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <p className="text-blue-900 font-medium mb-1">💡 Export Tips:</p>
            <ul className="text-blue-800 space-y-1">
              <li>• Exports are saved as JSON files</li>
              <li>• Files include timestamp for easy identification</li>
              <li>• Keep backups before making major changes</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-blue-600 text-white rounded-t-lg">
          <CardTitle className="text-white flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Import Tournament
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Load Tournament Data</h3>
            <p className="text-sm text-gray-600 mb-4">
              Import a previously exported tournament file. This will replace all current
              data.
            </p>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors">
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
                id="import-file"
              />
              <label
                htmlFor="import-file"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-12 h-12 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  Click to select a file
                </span>
                <span className="text-xs text-gray-500">JSON files only</span>
              </label>
            </div>

            {importError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Import Failed</p>
                  <p className="text-sm text-red-700">{importError}</p>
                </div>
              </div>
            )}

            {importSuccess && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs">✓</span>
                </div>
                <div>
                  <p className="font-medium text-green-900">Import Successful!</p>
                  <p className="text-sm text-green-700">
                    Tournament loaded. Page will reload...
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
            <p className="text-yellow-900 font-medium mb-1">⚠️ Warning:</p>
            <ul className="text-yellow-800 space-y-1">
              <li>• Importing will replace ALL current tournament data</li>
              <li>• Make sure to export current progress before importing</li>
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
              <p className="text-gray-600 mb-1">Teams Count</p>
              <p className="font-semibold text-lg">{teams.length}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Tournament Status</p>
              <p className="font-semibold text-lg">
                {currentTournament?.worldCup ? 'World Cup' : 'Qualifiers'}
              </p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Regions</p>
              <p className="font-semibold text-lg">
                {Object.keys(currentTournament?.qualifiers || {}).length}
              </p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Storage Version</p>
              <p className="font-semibold text-lg">1.0</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
