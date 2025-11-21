import { useProgressStore } from '../../store/useProgressStore';

export function ProgressModal() {
  const { isOpen, title, currentStep, progress, completedSteps, totalSteps } = useProgressStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-blue-500/30 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-in fade-in zoom-in duration-300">
        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          {title}
        </h2>

        {/* Progress Bar Container */}
        <div className="mb-6">
          <div className="relative h-8 bg-slate-700/50 rounded-full overflow-hidden border border-slate-600/50 shadow-inner">
            {/* Animated Progress Bar */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 transition-all duration-500 ease-out flex items-center justify-center"
              style={{ width: `${progress}%` }}
            >
              {/* Shimmer Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>

            {/* Progress Text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-white drop-shadow-lg z-10">
                {progress}%
              </span>
            </div>
          </div>

          {/* Step Counter */}
          <div className="mt-3 text-center text-slate-400 text-sm font-medium">
            {completedSteps} / {totalSteps} pasos completados
          </div>
        </div>

        {/* Current Step */}
        <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30">
          <div className="flex items-center gap-3">
            {/* Spinner */}
            {progress < 100 && (
              <div className="flex-shrink-0">
                <div className="w-5 h-5 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Checkmark */}
            {progress === 100 && (
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}

            {/* Step Text */}
            <p className="text-white font-medium text-sm flex-1">
              {currentStep}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
