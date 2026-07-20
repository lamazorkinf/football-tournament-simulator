import { create } from 'zustand';

export interface ProgressState {
  isOpen: boolean;
  title: string;
  currentStep: string;
  progress: number; // 0-100
  totalSteps: number;
  completedSteps: number;

  // Actions
  startProgress: (title: string, totalSteps: number) => void;
  updateProgress: (currentStep: string, completedSteps: number) => void;
  completeProgress: () => void;
  resetProgress: () => void;
}

const EMPTY_PROGRESS = {
  isOpen: false,
  title: '',
  currentStep: '',
  progress: 0,
  totalSteps: 0,
  completedSteps: 0,
} as const;

/**
 * Cierre diferido de completeProgress. Si empieza una operación nueva antes de
 * que venza, hay que cancelarlo: si no, cerraría el modal de esa operación
 * nueva y la dejaría corriendo sin feedback.
 */
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

const cancelAutoClose = () => {
  if (autoCloseTimer !== null) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
};

export const useProgressStore = create<ProgressState>((set) => ({
  ...EMPTY_PROGRESS,

  startProgress: (title: string, totalSteps: number) => {
    cancelAutoClose();
    set({
      isOpen: true,
      title,
      currentStep: 'Iniciando...',
      progress: 0,
      totalSteps,
      completedSteps: 0,
    });
  },

  updateProgress: (currentStep: string, completedSteps: number) => {
    set((state) => {
      const progress = state.totalSteps > 0
        ? Math.round((completedSteps / state.totalSteps) * 100)
        : 0;

      return {
        currentStep,
        completedSteps,
        progress,
      };
    });
  },

  completeProgress: () => {
    cancelAutoClose();

    set({
      progress: 100,
      currentStep: '¡Completado!',
    });

    // Auto-close after 800ms
    autoCloseTimer = setTimeout(() => {
      autoCloseTimer = null;
      set({ ...EMPTY_PROGRESS });
    }, 800);
  },

  resetProgress: () => {
    cancelAutoClose();
    set({ ...EMPTY_PROGRESS });
  },
}));
