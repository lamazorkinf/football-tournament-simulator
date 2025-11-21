import { useState } from 'react';
import { Database, Sliders, Users } from 'lucide-react';
import { ExportImport } from '../tournament/ExportImport';
import { EngineSettings } from './EngineSettings';
import { TeamEditor } from '../tournament/TeamEditor';

type SettingsTab = 'teams' | 'elo' | 'data';

export function SettingsHub() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('teams');

  const tabs = [
    { id: 'teams' as const, label: 'Equipos', icon: Users },
    { id: 'elo' as const, label: 'ELO Config', icon: Sliders },
    { id: 'data' as const, label: 'Datos', icon: Database },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-6 py-4 text-white">
          <h2 className="text-2xl font-bold">Configuración</h2>
          <p className="text-gray-300 text-sm mt-1">
            Gestiona equipos, parámetros ELO y datos del torneo
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600 bg-primary-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {activeTab === 'teams' && <TeamEditor />}
        {activeTab === 'elo' && <EngineSettings />}
        {activeTab === 'data' && <ExportImport />}
      </div>
    </div>
  );
}
