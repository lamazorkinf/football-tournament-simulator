import { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { useProgressStore } from '../../store/useProgressStore';
import { PixelBar } from './PixelBar';

export function ProgressModal() {
  const { isOpen, title, currentStep, progress, completedSteps, totalSteps, resetProgress } =
    useProgressStore();

  // Vía de escape: el modal es un overlay a pantalla completa sin más salida.
  // Si una operación falla o queda colgada sin cerrar el progreso, el usuario
  // quedaba atrapado hasta recargar. Cerrar aquí es solo visual: la operación
  // en curso (si la hay) sigue en segundo plano.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetProgress();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, resetProgress]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative bg-grass-dark border-4 border-line shadow-hard-panel p-8 max-w-md w-full mx-4">
        {/* Botón de cierre de emergencia */}
        <button
          onClick={resetProgress}
          aria-label="Cerrar"
          className="absolute top-2 right-2 p-2 text-grass-soft hover:text-white hover:bg-grass/40 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <h2 className="font-arcade text-xs text-gold uppercase mb-6 text-center">
          {title}
        </h2>

        {/* Progress Bar */}
        <div className="mb-6 space-y-3">
          <PixelBar value={progress} max={100} color="led" />

          <div className="text-center font-terminal text-led tabular-nums text-2xl">
            {progress}%
          </div>

          {/* Step Counter */}
          <div className="text-center text-grass-soft text-sm">
            {completedSteps} / {totalSteps} pasos completados
          </div>
        </div>

        {/* Current Step */}
        <div className="bg-night border-2 border-grass p-4">
          <div className="flex items-center gap-3">
            {/* Spinner */}
            {progress < 100 && (
              <div className="flex-shrink-0">
                <div className="w-5 h-5 border-2 border-led border-t-transparent animate-spin" />
              </div>
            )}

            {/* Checkmark */}
            {progress === 100 && (
              <div className="flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-led" />
              </div>
            )}

            {/* Step Text */}
            <p className="text-white text-sm flex-1">
              {currentStep}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
