import { useConfigStore } from '../../store/useConfigStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Settings, RotateCcw, Info, Zap, Home, Target } from 'lucide-react';
import { useState } from 'react';

export function EngineSettings() {
  const { config, updateKFactor, updateHomeAdvantage, updateSkillLimits, resetToDefaults } = useConfigStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const getKFactorLabel = (value: number): { label: string; color: string } => {
    if (value <= 5) return { label: 'Muy Estable', color: 'text-blue-600' };
    if (value <= 15) return { label: 'Moderado', color: 'text-green-600' };
    if (value <= 30) return { label: 'Rápido', color: 'text-orange-600' };
    return { label: 'Muy Volátil', color: 'text-red-600' };
  };

  const kFactorInfo = getKFactorLabel(config.kFactor);

  const handleReset = () => {
    if (showResetConfirm) {
      resetToDefaults();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-t-lg">
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Configuración del Motor ELO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Sistema ELO</p>
              <p>
                El sistema ELO ajusta dinámicamente las habilidades de los equipos basándose en resultados de partidos.
                Los cambios aquí afectan cómo los equipos ganan o pierden puntos de skill.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* K-Factor Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary-600" />
            Factor K (Volatilidad)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  K-Factor: <span className="text-primary-600 font-bold">{config.kFactor}</span>
                </label>
                <span className={`text-sm font-semibold ${kFactorInfo.color}`}>
                  {kFactorInfo.label}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={config.kFactor}
                onChange={(e) => updateKFactor(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1 (Muy estable)</span>
                <span>25</span>
                <span>50 (Muy volátil)</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-900">¿Qué significa el K-Factor?</p>
              <div className="text-sm text-gray-700 space-y-1">
                <p>• <strong>Valores bajos (1-5):</strong> Cambios lentos y estables. Ideal para ligas largas.</p>
                <p>• <strong>Valores medios (6-15):</strong> Balance entre estabilidad y adaptabilidad.</p>
                <p>• <strong>Valores altos (16-50):</strong> Cambios rápidos. Los equipos pueden subir/bajar mucho.</p>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  <strong>Ejemplo con K={config.kFactor}:</strong> Si un equipo de 70 skill gana a uno de 85 skill,
                  ganará aproximadamente <strong className="text-primary-600">+{Math.round(config.kFactor * 0.76)}</strong> puntos
                  (el favorito perdería <strong className="text-red-600">-{Math.round(config.kFactor * 0.76)}</strong>).
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Home Advantage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5 text-primary-600" />
            Ventaja de Local
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Bonus de skill: <span className="text-primary-600 font-bold">+{config.homeAdvantage}</span>
                </label>
                <span className="text-sm text-gray-600">
                  {config.homeAdvantage === 0 && 'Sin ventaja'}
                  {config.homeAdvantage > 0 && config.homeAdvantage <= 3 && 'Realista'}
                  {config.homeAdvantage > 3 && config.homeAdvantage <= 6 && 'Alta'}
                  {config.homeAdvantage > 6 && 'Muy alta'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={config.homeAdvantage}
                onChange={(e) => updateHomeAdvantage(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0 (Sin ventaja)</span>
                <span>5</span>
                <span>10 (Máxima)</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Impacto</p>
              <p className="text-sm text-gray-700">
                El equipo local recibe <strong className="text-primary-600">+{config.homeAdvantage}</strong> puntos de skill
                temporalmente durante el cálculo de goles esperados. Esto NO afecta el cálculo ELO, solo la generación de resultados.
              </p>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  <strong>Realista:</strong> En fútbol real, la ventaja de local suele ser equivalente a ~2-4 puntos de skill.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skill Limits Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary-600" />
            Límites de Skill
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mínimo
                </label>
                <input
                  type="number"
                  min="0"
                  max={config.skillMax - 1}
                  value={config.skillMin}
                  onChange={(e) => updateSkillLimits(Number(e.target.value), config.skillMax)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Máximo
                </label>
                <input
                  type="number"
                  min={config.skillMin + 1}
                  max="100"
                  value={config.skillMax}
                  onChange={(e) => updateSkillLimits(config.skillMin, Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Rango actual</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-3 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full relative">
                  <div
                    className="absolute top-0 left-0 h-full bg-gray-300 rounded-l-full"
                    style={{ width: `${config.skillMin}%` }}
                  />
                  <div
                    className="absolute top-0 right-0 h-full bg-gray-300 rounded-r-full"
                    style={{ width: `${100 - config.skillMax}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-2">
                <span>0</span>
                <span className="text-primary-600 font-semibold">{config.skillMin} - {config.skillMax}</span>
                <span>100</span>
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Los equipos no podrán superar estos límites, incluso si ganan muchos partidos seguidos.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Restaurar valores predeterminados</p>
              <p className="text-sm text-gray-600 mt-1">
                K-Factor: 5, Ventaja local: 3, Límites: 30-100
              </p>
            </div>
            <Button
              variant={showResetConfirm ? 'danger' : 'outline'}
              onClick={handleReset}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {showResetConfirm ? '¿Confirmar reset?' : 'Restaurar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
