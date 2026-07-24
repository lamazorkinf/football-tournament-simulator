import { useConfigStore, type ImportanceKey } from '../../store/useConfigStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Settings, RotateCcw, Info, Zap, Home, Target, Trophy } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

const IMPORTANCE_ROWS: Array<{ key: ImportanceKey; label: string }> = [
  { key: 'qualifier', label: 'Clasificatorias Mundial' },
  { key: 'continentalEarly', label: 'Continental · R64–R16' },
  { key: 'continentalLate', label: 'Continental · QF–Final' },
  { key: 'confedGroup', label: 'Copa Confed · grupos' },
  { key: 'confedKnockout', label: 'Copa Confed · semis/final' },
  { key: 'wcGroup', label: 'Mundial · grupos' },
  { key: 'wcKnockout', label: 'Mundial · knockout' },
];

export function EngineSettings() {
  const { config, updateKFactor, updateEloDivisor, updateHomeAdvantage, updateSkillLimits, updateImportance, resetToDefaults } = useConfigStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpiar el timer del "confirmar reset" al desmontar: si el usuario pulsa
  // Restaurar y cambia de pestaña antes de 3s, hacía setState sobre un
  // componente desmontado.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const getKFactorLabel = (value: number): { label: string; color: string } => {
    if (value <= 2) return { label: 'Muy Estable', color: 'text-led' };
    if (value <= 4) return { label: 'Moderado', color: 'text-led' };
    if (value <= 7) return { label: 'Rápido', color: 'text-gold' };
    return { label: 'Muy Volátil', color: 'text-loss' };
  };

  const kFactorInfo = getKFactorLabel(config.kFactor);

  const handleReset = () => {
    if (showResetConfirm) {
      resetToDefaults();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setShowResetConfirm(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gold" />
            Configuración del Motor ELO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 bg-night border-2 border-line p-4">
            <Info className="w-5 h-5 text-led flex-shrink-0 mt-0.5" />
            <div className="text-sm text-grass-soft">
              <p className="font-semibold text-white mb-1">Sistema ELO</p>
              <p>
                El sistema ELO ajusta dinámicamente las habilidades de los equipos basándose en resultados de partidos.
                Los cambios aquí afectan cómo los equipos ganan o pierden puntos de habilidad.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* K-Factor Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-gold" />
            Factor K (Volatilidad)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-grass-soft">
                  K-Factor: <span className="text-led font-terminal tabular-nums font-bold">{config.kFactor}</span>
                </label>
                <span className={`text-sm font-semibold ${kFactorInfo.color}`}>
                  {kFactorInfo.label}
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={config.kFactor}
                onChange={(e) => updateKFactor(Number(e.target.value))}
                className="w-full h-2 bg-grass-dark border-2 border-line appearance-none cursor-pointer accent-led"
              />
              <div className="flex justify-between text-xs text-grass-soft mt-1">
                <span>0.5 (Muy estable)</span>
                <span>5</span>
                <span>10 (Muy volátil)</span>
              </div>
            </div>

            <div className="bg-night border-2 border-grass p-4 space-y-2">
              <p className="text-sm font-semibold text-white">¿Qué significa el K-Factor?</p>
              <div className="text-sm text-grass-soft space-y-1">
                <p>• <strong className="text-white">Valores bajos (0.5-2):</strong> Cambios lentos y estables. Ideal para jugar muchas temporadas.</p>
                <p>• <strong className="text-white">Valores medios (2.5-4):</strong> Balance entre estabilidad y adaptabilidad.</p>
                <p>• <strong className="text-white">Valores altos (4.5-10):</strong> Cambios rápidos. Los equipos pueden subir/bajar mucho.</p>
              </div>
              <div className="mt-3 pt-3 border-t-2 border-grass">
                <p className="text-xs text-grass-soft">
                  <strong className="text-white">Ejemplo con K={config.kFactor}:</strong> Si un equipo con 70 de habilidad le gana a uno con 85,
                  ganará aproximadamente <strong className="text-led font-terminal tabular-nums">+{(config.kFactor * 0.61).toFixed(1)}</strong> puntos
                  (el favorito perdería <strong className="text-loss font-terminal tabular-nums">-{(config.kFactor * 0.61).toFixed(1)}</strong>).
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-grass-soft">
                  Divisor Elo: <span className="text-led font-terminal tabular-nums font-bold">{config.eloDivisor}</span>
                </label>
                <span className="text-sm text-grass-soft">
                  {config.eloDivisor === 75 && 'Calibrado'}
                  {config.eloDivisor < 75 && 'Favoritos ganan más rating'}
                  {config.eloDivisor > 75 && 'Sorpresas pagan de más'}
                </span>
              </div>
              <input
                type="range"
                min="25"
                max="200"
                step="5"
                value={config.eloDivisor}
                onChange={(e) => updateEloDivisor(Number(e.target.value))}
                className="w-full h-2 bg-grass-dark border-2 border-line appearance-none cursor-pointer accent-led"
              />
              <p className="text-xs text-grass-soft mt-2">
                Controla qué tan &quot;sorpresa&quot; se considera cada resultado. El valor <strong className="text-white">75</strong> está
                calibrado para que la expectativa Elo coincida con la probabilidad real de victoria del simulador:
                con él, los ratings se mantienen estables durante décadas de temporadas. No lo cambies salvo que sepas lo que hacés.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Home Advantage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5 text-gold" />
            Ventaja de Local
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-grass-soft">
                  Bonus de habilidad: <span className="text-led font-terminal tabular-nums font-bold">+{config.homeAdvantage}</span>
                </label>
                <span className="text-sm text-grass-soft">
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
                className="w-full h-2 bg-grass-dark border-2 border-line appearance-none cursor-pointer accent-led"
              />
              <div className="flex justify-between text-xs text-grass-soft mt-1">
                <span>0 (Sin ventaja)</span>
                <span>5</span>
                <span>10 (Máxima)</span>
              </div>
            </div>

            <div className="bg-night border-2 border-grass p-4">
              <p className="text-sm font-semibold text-white mb-2">Impacto</p>
              <p className="text-sm text-grass-soft">
                El equipo local recibe <strong className="text-led font-terminal tabular-nums">+{config.homeAdvantage}</strong> puntos de habilidad
                temporalmente durante el cálculo de goles esperados. Esto NO afecta el cálculo ELO, solo la generación de resultados.
              </p>
              <div className="mt-2 pt-2 border-t-2 border-grass">
                <p className="text-xs text-grass-soft">
                  <strong className="text-white">Realista:</strong> En fútbol real, la ventaja de local suele ser equivalente a ~2-4 puntos de habilidad.
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
            <Target className="w-5 h-5 text-gold" />
            Límites de Habilidad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-grass-soft mb-2">
                  Mínimo
                </label>
                <input
                  type="number"
                  min="0"
                  max={config.skillMax - 1}
                  value={config.skillMin}
                  onChange={(e) => updateSkillLimits(Number(e.target.value), config.skillMax)}
                  className="w-full px-3 py-2 bg-grass-dark border-2 border-line text-led font-terminal tabular-nums focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-sm text-grass-soft mb-2">
                  Máximo
                </label>
                <input
                  type="number"
                  min={config.skillMin + 1}
                  max="100"
                  value={config.skillMax}
                  onChange={(e) => updateSkillLimits(config.skillMin, Number(e.target.value))}
                  className="w-full px-3 py-2 bg-grass-dark border-2 border-line text-led font-terminal tabular-nums focus:outline-none focus:border-gold"
                />
              </div>
            </div>

            <div className="bg-night border-2 border-grass p-4">
              <p className="text-sm font-semibold text-white mb-2">Rango actual</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-3 bg-grass-dark border-2 border-grass relative">
                  <div
                    className="absolute top-0 h-full bg-led"
                    style={{ left: `${config.skillMin}%`, width: `${config.skillMax - config.skillMin}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-grass-soft mt-2">
                <span>0</span>
                <span className="text-led font-terminal tabular-nums font-semibold">{config.skillMin} - {config.skillMax}</span>
                <span>100</span>
              </div>
              <p className="text-xs text-grass-soft mt-3">
                Los equipos no podrán superar estos límites, incluso si ganan muchos partidos seguidos.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Peso por torneo (importancia Elo) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-gold" />
            Peso por torneo (importancia Elo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-grass-soft">
              Multiplica el Factor K según la etapa del partido: cuánto mueve el skill cada torneo.
              Las clasificatorias pesan menos (muchos partidos) y el knockout del Mundial, más.
              Los cruces por penales cuentan como empate para el Elo.
            </p>
            {IMPORTANCE_ROWS.map(({ key, label }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-grass-soft">{label}</label>
                  <span className="text-led font-terminal tabular-nums font-bold text-sm">
                    {config.importanceByStage[key].toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.05"
                  value={config.importanceByStage[key]}
                  onChange={(e) => updateImportance(key, Number(e.target.value))}
                  className="w-full h-2 bg-grass-dark border-2 border-line appearance-none cursor-pointer accent-led"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">Restaurar valores predeterminados</p>
              <p className="text-sm text-grass-soft mt-1">
                K-Factor: 1.5, Divisor Elo: 75, Ventaja local: 3, Límites: 30-100
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
