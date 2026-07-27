/**
 * Constantes del sistema de modos. El modo 'selecciones' es el ciclo
 * mundialista clásico: existía antes de la feature y todos los datos legacy se
 * backfillean a él (ver migración 018). Es el modo por defecto al arrancar.
 */
export const SELECCIONES_MODE_ID = 'selecciones';

/** Clave de localStorage donde se recuerda el último modo activo. */
export const ACTIVE_MODE_STORAGE_KEY = 'fts.activeModeId';
