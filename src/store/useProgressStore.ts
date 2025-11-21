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

export const useProgressStore = create<ProgressState>((set) => ({
  isOpen: false,
  title: '',
  currentStep: '',
  progress: 0,
  totalSteps: 0,
  completedSteps: 0,

  startProgress: (title: string, totalSteps: number) => {
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
    set({
      progress: 100,
      currentStep: '¡Completado!',
    });

    // Auto-close after 800ms
    setTimeout(() => {
      set({
        isOpen: false,
        title: '',
        currentStep: '',
        progress: 0,
        totalSteps: 0,
        completedSteps: 0,
      });
    }, 800);
  },

  resetProgress: () => {
    set({
      isOpen: false,
      title: '',
      currentStep: '',
      progress: 0,
      totalSteps: 0,
      completedSteps: 0,
    });
  },
}));
