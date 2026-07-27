/**
 * Vista activa de la app (qué panel se muestra en el área de contenido). Vivía
 * duplicada como unión literal en App/Sidebar/GameTabBar/PauseMenu; se centraliza
 * acá para no desincronizarse. `'league'` es la vista raíz de los modos de ligas
 * (la sub-navegación —Liga A/B, Copa, Temporada, Escudos— la maneja el
 * useLeagueModeStore.activeTab).
 */
export type View =
  | 'wizard'
  | 'qualifiers'
  | 'worldcup'
  | 'stats'
  | 'settings'
  | 'history'
  | 'matches'
  | 'comparison'
  | 'tournaments'
  | 'champions'
  | 'continental'
  | 'confederations'
  | 'favorites'
  | 'league';
