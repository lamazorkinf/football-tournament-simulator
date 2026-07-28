/**
 * Vista activa de la app (qué panel se muestra en el área de contenido). Vivía
 * duplicada como unión literal en App/Sidebar/GameTabBar/PauseMenu; se centraliza
 * acá para no desincronizarse.
 *
 * `'league'` es la vista raíz de los modos de temporada: su sub-navegación —una
 * pestaña por competición del descriptor, más Temporada y Escudos— la derivan
 * `modes/nav.ts` y `useSeasonModeStore.activeTab`. Qué vistas alcanza cada modo
 * NO se decide acá sino en el descriptor (`dataTabs` / `archiveTabs`).
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
