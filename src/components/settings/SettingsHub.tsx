import { useState } from 'react';
import { Database, Settings, Sliders, Users } from 'lucide-react';
import { ExportImport } from '../tournament/ExportImport';
import { EngineSettings } from './EngineSettings';
import { TeamEditor } from '../tournament/TeamEditor';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Tabs } from '../ui/Tabs';
import { ViewHeader } from '../ui/ViewHeader';
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
        <ViewHeader
          icon={Settings}
          title="Configuración"
          subtitle="Gestiona equipos, parámetros ELO y datos del torneo"
        />

        {/* Tabs */}
        <Tabs items={tabs} value={activeTab} onChange={(id) => setActiveTab(id as typeof activeTab)} />
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
