import type { View } from '../types/view';
import type { IconKey, ModeDescriptor, ModeEngine } from './types';
import { NATIONAL_COMPETITION_VIEW } from './seleccionesAdapter';

/**
 * NAVEGACIÓN DE UN MODO — una sola derivación para toda la interfaz.
 *
 * Sidebar (desktop), barra de pestañas (mobile), menú de pausa y el ruteo de
 * `App.tsx` mostraban listas escritas a mano, cada una con su propia rama
 * `¿es selecciones o es liga?`. Cuatro listas que había que acordarse de
 * actualizar juntas, y que hacían que sumar un modo fuera tocar cuatro
 * componentes.
 *
 * Acá se deriva una sola vez, desde el descriptor. Es puro y sin React —los
 * iconos son claves string y el mapeo a componentes vive en la UI—, así que se
 * testea como cualquier función.
 */

export type NavSectionKey = 'competition' | 'data' | 'archive' | 'footer';

export interface NavItem {
  key: string;
  label: string;
  /** Rótulo para la barra mobile. Presupuesto duro: 6 caracteres. */
  shortLabel: string;
  icon: IconKey;
  /** Vista de la app y, en los modos de temporada, la sub-pestaña. */
  target: { view: View; tab?: string };
  /** Navegable, pero todavía no desbloqueada. */
  locked: boolean;
  section: NavSectionKey;
}

export interface NavSection {
  key: NavSectionKey;
  title: string;
  items: NavItem[];
}

export interface ModeNav {
  engine: ModeEngine;
  items: NavItem[];
  /** Secciones con al menos un item, en orden de aparición. */
  sections: NavSection[];
  /** Las 4 de la barra de abajo en mobile. */
  primary: NavItem[];
  /** Lo que va en el menú de pausa: todo lo que no está en la barra. */
  overflow: NavItem[];
  /** Vistas alcanzables en este modo. */
  allowed: View[];
  /** Vista efectiva: la pedida si aplica a este modo, si no la raíz. */
  view: View;
  /** Sub-pestaña efectiva dentro de la vista raíz de un modo de temporada. */
  tab: string;
}

/**
 * Rótulos e iconos de las vistas que no son competiciones. Reemplaza las
 * cuatro copias que había en Sidebar, GameTabBar, PauseMenu y App.
 *
 * "FECHA" es la palabra rioplatense para la tanda de partidos de una jornada.
 * Los rótulos cortos son de 6 caracteres o menos a propósito: la barra mobile
 * tiene 5 columnas y Press Start 2P ocupa ~1em por carácter, así que a 375px
 * una etiqueta de 7 entra con cero margen y a 320px se superpone con la de al
 * lado.
 */
const VIEW_META: Record<View, { label: string; shortLabel: string; icon: IconKey }> = {
  hub: { label: 'Inicio', shortLabel: 'INICIO', icon: 'home' },
  matches: { label: 'Centro de Partidos', shortLabel: 'FECHA', icon: 'calendar' },
  continental: { label: 'Continental', shortLabel: 'CONTI', icon: 'globe' },
  confederations: { label: 'Confederaciones', shortLabel: 'CONFED', icon: 'shield' },
  qualifiers: { label: 'Clasificatorias', shortLabel: 'CLASIF', icon: 'route' },
  worldcup: { label: 'Mundial', shortLabel: 'COPA', icon: 'trophy' },
  stats: { label: 'Rendimiento', shortLabel: 'STATS', icon: 'chart' },
  comparison: { label: 'Comparar', shortLabel: 'VERSUS', icon: 'compare' },
  favorites: { label: 'Favoritos', shortLabel: 'FAVS', icon: 'star' },
  champions: { label: 'Campeones', shortLabel: 'REYES', icon: 'medal' },
  history: { label: 'Historial', shortLabel: 'DIARIO', icon: 'history' },
  tournaments: { label: 'Torneos', shortLabel: 'ARCHIVO', icon: 'archive' },
  settings: { label: 'Ajustes', shortLabel: 'AJUSTES', icon: 'settings' },
  // `league` dejó de ser la raíz de los modos de temporada (lo es el Hub):
  // quedó como contenedor de sus pestañas de competición, y cada pestaña trae
  // su propio rótulo del descriptor. Estos valores sólo se usarían si un modo
  // declarara `league` en sus `dataTabs`/`archiveTabs`, cosa que ninguno hace.
  league: { label: 'Inicio', shortLabel: 'INICIO', icon: 'home' },
};

export function viewLabel(view: View): string {
  return VIEW_META[view].label;
}

const SECTION_TITLE: Record<NavSectionKey, string> = {
  competition: 'Ciclo actual',
  data: 'Datos',
  archive: 'Archivo',
  footer: '',
};

/** Pestañas propias de un modo de temporada que no son competiciones. */
const EXTRA_TAB: Record<'season' | 'crests', { label: string; shortLabel: string; icon: IconKey }> = {
  season: { label: 'Temporada', shortLabel: 'AÑO', icon: 'calendar' },
  crests: { label: 'Escudos', shortLabel: 'ESCUDO', icon: 'crest' },
};

function viewItem(view: View, section: NavSectionKey, locked: boolean): NavItem {
  return { key: view, ...VIEW_META[view], target: { view }, locked, section };
}

export interface DeriveNavInput {
  descriptor: ModeDescriptor;
  /** La vista que la app quiere mostrar. */
  currentView: View;
  /** La sub-pestaña pedida dentro de un modo de temporada. */
  requestedTab?: string;
  /**
   * Modo de temporada: ids de las competiciones que tienen torneo corriendo
   * este año. Vacío ⇒ la temporada todavía no arrancó.
   */
  runningCompetitionIds?: string[];
  /** Fases del ciclo todavía bloqueadas (ver `seleccionesAdapter`). */
  lockedViews?: View[];
}

export function deriveModeNav(input: DeriveNavInput): ModeNav {
  const { descriptor, currentView } = input;
  const locked = new Set(input.lockedViews ?? []);
  const isLocked = (v: View) => locked.has(v);

  const items =
    descriptor.engine === 'national-cycle'
      ? nationalCompetitionItems(descriptor, isLocked)
      : seasonCompetitionItems(descriptor, input.runningCompetitionIds ?? []);

  for (const view of descriptor.dataTabs) items.push(viewItem(view, 'data', isLocked(view)));
  for (const view of descriptor.archiveTabs) items.push(viewItem(view, 'archive', isLocked(view)));
  items.push(viewItem('settings', 'footer', false));

  const allowed = [...new Set(items.map((i) => i.target.view))];
  // Una sola raíz para los dos motores: el Hub. Las dos pantallas de inicio que
  // había (el progreso del ciclo y la portada del modo de temporada) son ahora
  // la misma, así que acá no queda ninguna rama por motor.
  const root: View = 'hub';
  const view = allowed.includes(currentView) ? currentView : root;

  // Pestaña efectiva: la pedida si sigue siendo válida, si no la primera del modo.
  const tabs = items.filter((i) => i.target.tab !== undefined).map((i) => i.target.tab!);
  const requested = input.requestedTab ?? '';
  const tab = tabs.includes(requested) ? requested : (tabs[0] ?? 'main');

  const primary = pickPrimary(descriptor, items, root);
  const primaryKeys = new Set(primary.map((i) => i.key));

  const sections: NavSection[] = (['competition', 'data', 'archive', 'footer'] as const)
    .map((key) => ({
      key,
      title: key === 'competition' && descriptor.engine === 'season' ? 'Temporada' : SECTION_TITLE[key],
      items: items.filter((i) => i.section === key),
    }))
    .filter((s) => s.items.length > 0);

  return {
    engine: descriptor.engine,
    items,
    sections,
    primary,
    overflow: items.filter((i) => !primaryKeys.has(i.key)),
    allowed,
    view,
    tab,
  };
}

/**
 * Ciclo mundialista: las dos pantallas de maquinaria más las competiciones que
 * tienen vista propia. Su navegación es fija porque su motor lo es.
 */
function nationalCompetitionItems(
  descriptor: ModeDescriptor,
  isLocked: (v: View) => boolean,
): NavItem[] {
  const items: NavItem[] = [
    viewItem('hub', 'competition', false),
    viewItem('matches', 'competition', false),
  ];

  for (const competition of [...descriptor.competitions].sort((a, b) => a.order - b.order)) {
    const view = NATIONAL_COMPETITION_VIEW[competition.id];
    if (!view) continue; // sin pantalla propia en el motor de 4 años
    items.push({
      key: competition.id,
      label: competition.name,
      shortLabel: competition.shortLabel ?? VIEW_META[view].shortLabel,
      icon: competition.icon ?? VIEW_META[view].icon,
      target: { view },
      locked: isLocked(view),
      section: 'competition',
    });
  }
  return items;
}

/**
 * Modo de temporada: el Hub adelante, después una entrada por competición con
 * torneo corriendo y las pestañas propias del modo. Esas apuntan todas a la
 * vista `league` —que dejó de ser la raíz, pero sigue siendo su contenedor— y
 * se distinguen por `tab`.
 *
 * El Hub encabeza la lista en los dos motores: es la raíz y el primer casillero
 * de la barra mobile, y `pickPrimary` lo busca acá adentro.
 */
function seasonCompetitionItems(descriptor: ModeDescriptor, running: string[]): NavItem[] {
  const runningIds = new Set(running);
  const hub = viewItem('hub', 'competition', false);
  const extras = descriptor.extraTabs.map(
    (key): NavItem => ({
      key,
      ...EXTRA_TAB[key],
      target: { view: 'league', tab: key },
      locked: false,
      section: 'competition',
    }),
  );

  // Sin temporada arrancada no hay competiciones que listar: sólo el Hub —que
  // es el que ofrece arrancarla— y los escudos, que se pueden cargar antes de
  // que haya un solo partido.
  if (runningIds.size === 0) {
    return [hub, ...extras.filter((t) => t.key === 'crests')];
  }

  const competitions = [...descriptor.competitions]
    .filter((c) => runningIds.has(c.id))
    .sort((a, b) => a.order - b.order)
    .map(
      (c): NavItem => ({
        key: c.id,
        label: c.name,
        shortLabel: c.shortLabel ?? c.name.slice(0, 6).toUpperCase(),
        icon: c.icon ?? 'shield',
        target: { view: 'league', tab: c.id },
        locked: false,
        section: 'competition',
      }),
    );

  return [hub, ...competitions, ...extras];
}

/**
 * Las 4 de la barra de abajo. Un modo puede marcar competiciones con `primary`
 * (el ciclo destaca Clasificatorias y Mundial); lo que falte se completa con
 * la raíz del modo y sus vistas de datos, que es lo que hacen los modos de
 * temporada, donde la sub-navegación ya vive en el contenido.
 */
function pickPrimary(descriptor: ModeDescriptor, items: NavItem[], root: View): NavItem[] {
  const flagged = new Set(
    descriptor.competitions.filter((c) => c.primary).map((c) => c.id),
  );
  const out: NavItem[] = [];
  const push = (item: NavItem | undefined) => {
    if (item && out.length < 4 && !out.some((i) => i.key === item.key)) out.push(item);
  };

  // La raíz abre la barra en los dos motores: con el Hub como raíz única, el
  // item ya está en la lista y no hay que reconstruirlo con el rótulo de la
  // vista. El ciclo suma después su Centro de Partidos, la otra pantalla que
  // no es una competición.
  push(items.find((i) => i.target.view === root));
  if (descriptor.engine === 'national-cycle') push(items.find((i) => i.key === 'matches'));

  for (const item of items) if (flagged.has(item.key)) push(item);
  for (const item of items) if (item.section === 'data') push(item);
  for (const item of items) if (item.section === 'archive') push(item);
  return out;
}
