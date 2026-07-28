import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BarChart3,
  CalendarDays,
  GitCompare,
  Globe2,
  History,
  Home,
  Image,
  Medal,
  Route,
  Settings,
  Shield,
  Star,
  Trophy,
  Workflow,
} from 'lucide-react';
import type { IconKey } from '../../modes/types';

/**
 * De la clave de icono del descriptor al componente que la dibuja.
 *
 * El descriptor de un modo se guarda en `modes.config` (JSON), así que no puede
 * referenciar componentes: nombra iconos con strings y el mapeo vive acá, del
 * lado de la UI. Es lo que permite que un modo nuevo elija sus iconos sin
 * escribir TypeScript.
 */
export const NAV_ICONS: Record<IconKey, LucideIcon> = {
  trophy: Trophy,
  shield: Shield,
  globe: Globe2,
  route: Route,
  calendar: CalendarDays,
  flow: Workflow,
  crest: Image,
  medal: Medal,
  chart: BarChart3,
  compare: GitCompare,
  star: Star,
  history: History,
  archive: Archive,
  settings: Settings,
  home: Home,
};

export function navIcon(key: IconKey): LucideIcon {
  return NAV_ICONS[key] ?? Shield;
}
