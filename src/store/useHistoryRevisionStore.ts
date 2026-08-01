import { create } from 'zustand';

/**
 * CUÁNDO CAMBIÓ EL HISTORIAL. Un contador y nada más: quien lee `match_history`
 * y quiere estar al día se suscribe acá en vez de re-consultar por las dudas.
 *
 * Lo incrementa `matchHistoryService` tras un insert exitoso. Va ahí y no en los
 * stores que persisten porque el servicio es el único cuello de botella por
 * donde pasa el historial de todos los modos: los seis lugares que hoy escriben
 * son seis oportunidades de olvidarse, y un modo futuro heredaría el olvido.
 */
interface HistoryRevisionState {
  revision: number;
  bump: () => void;
}

export const useHistoryRevisionStore = create<HistoryRevisionState>((set) => ({
  revision: 0,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
}));

/** Atajo para los llamadores que no son componentes. */
export const bumpHistoryRevision = (): void => useHistoryRevisionStore.getState().bump();
