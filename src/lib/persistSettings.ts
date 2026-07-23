import { appSettingsService, type AppSettings } from '../services/appSettingsService';

/**
 * Guardado diferido de las preferencias en la DB.
 *
 * Las mutaciones de config vienen en ráfaga (arrastrar un slider dispara una
 * por pixel), así que se acumulan en un patch y se envía uno solo tras la
 * pausa. Es fire-and-forget: una preferencia que no llega a guardarse no puede
 * bloquear la UI ni justifica un toast de error, sólo se loguea.
 */
const DEBOUNCE_MS = 300;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Partial<AppSettings> = {};

/** Envía el patch acumulado y limpia el buffer. */
function flush(): void {
  timer = null;
  const patch = pending;
  pending = {};
  if (Object.keys(patch).length === 0) return;
  appSettingsService
    .saveSettings(patch)
    .catch((error) => console.error('No se pudieron guardar las preferencias:', error));
}

/** Acumula un cambio de preferencias y programa su guardado. */
export function queueSettingsSave(patch: Partial<AppSettings>): void {
  pending = { ...pending, ...patch };
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

/** Fuerza el envío inmediato de lo pendiente (tests, cierre de la app). */
export function flushSettingsSave(): void {
  if (timer !== null) clearTimeout(timer);
  flush();
}
