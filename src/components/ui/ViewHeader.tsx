import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CardHeader } from './Card';

interface ViewHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Encabezado de vista con una única escala responsive.
 *
 * Antes cada vista repetía la misma cadena de clases y tres ya habían
 * divergido, así que en móvil algunos títulos se achicaban y otros no. Se fija
 * `text-base sm:text-lg`: Press Start 2P a `text-lg` desborda en móvil con los
 * títulos largos.
 */
export function ViewHeader({ icon: Icon, title, subtitle, actions }: ViewHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="w-8 h-8 text-gold flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="font-arcade text-base sm:text-lg text-white text-shadow-retro truncate">
              {title}
            </h2>
            {subtitle && <p className="text-grass-soft text-sm mt-1 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
    </CardHeader>
  );
}
