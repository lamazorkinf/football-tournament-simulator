import { useState } from 'react';
import { Database, Sliders, Users } from 'lucide-react';
import { ExportImport } from '../tournament/ExportImport';
import { EngineSettings } from './EngineSettings';
import { TeamEditor } from '../tournament/TeamEditor';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { useConfigStore } from '../../store/useConfigStore';

type SettingsTab = 'teams' | 'elo' | 'data';

export function SettingsHub() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('teams');
  const scanlines = useConfigStore((s) => s.scanlines);
  const toggleScanlines = useConfigStore((s) => s.toggleScanlines);

  const tabs = [
    { id: 'teams' as const, label: 'Equipos', icon: Users },
    { id: 'elo' as const, label: 'ELO Config', icon: Sliders },
    { id: 'data' as const, label: 'Datos', icon: Database },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <CardHeader>
          <h2 className="font-arcade text-lg text-white text-shadow-retro">Configuración</h2>
          <p className="text-grass-soft text-sm mt-1">
            Gestiona equipos, parámetros ELO y datos del torneo
          </p>
        </CardHeader>

        {/* Tabs */}
        <div className="flex border-b-4 border-grass">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
                  activeTab === tab.id
                    ? 'border-gold text-gold bg-grass/30'
                    : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Pantalla */}
      <Card>
        <CardHeader><CardTitle>Pantalla</CardTitle></CardHeader>
        <CardContent>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span>Efecto CRT (scanlines)</span>
            <button
              role="switch"
              aria-checked={scanlines}
              onClick={toggleScanlines}
              className={`font-arcade text-[10px] px-3 py-2 border-2 ${
                scanlines ? 'bg-grass text-led border-line' : 'bg-grass-dark text-grass-soft border-grass'
              }`}
            >
              {scanlines ? 'ON' : 'OFF'}
            </button>
          </label>
        </CardContent>
      </Card>

      {/* Content */}
      <div>
        {activeTab === 'teams' && <TeamEditor />}
        {activeTab === 'elo' && <EngineSettings />}
        {activeTab === 'data' && <ExportImport />}
      </div>
    </div>
  );
}
