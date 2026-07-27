import { Hammer } from 'lucide-react';

/**
 * Placeholder para los modos de ligas (league-system) mientras sus vistas y
 * formatos se construyen (Etapa 2: liga, copa a doble partido, temporada con
 * ascensos/descensos). Mantiene la app usable —y el selector de modo del
 * Sidebar accesible— aunque el modo todavía no tenga torneos.
 */
export function ModeComingSoon({ modeName }: { modeName?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-5">
        <Hammer className="w-14 h-14 text-gold mx-auto" />
        <p className="font-arcade text-sm text-gold text-shadow-retro">
          {modeName ?? 'Modo'} — en construcción
        </p>
        <p className="text-sm text-grass-soft leading-relaxed">
          Este modo ya existe y tiene su propio plantel de equipos, aislado del
          resto. Sus torneos (liga, copa y temporada con ascensos y descensos)
          llegan en la próxima etapa. Mientras tanto, podés volver al modo
          Selecciones desde el selector del panel lateral.
        </p>
      </div>
    </div>
  );
}
