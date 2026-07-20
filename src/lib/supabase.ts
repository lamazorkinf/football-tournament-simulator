import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Credenciales desde variables de entorno (.env, no versionado).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// Aviso visible cuando faltan las env vars: sin esto la app arrancaba "bien"
// con el fallback placeholder y todos los servicios entraban por la rama
// !isSupabaseConfigured() devolviendo [] o mocks, sin ninguna pista de por qué
// no persistía nada.
if (
  supabaseUrl === 'https://your-project.supabase.co' ||
  supabaseAnonKey === 'your-anon-key'
) {
  console.warn(
    '⚠️ Supabase no está configurado: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'La app corre en modo local (sin persistencia). Copiá .env.example a .env con tus credenciales.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Escapa un valor para usarlo dentro de un filtro `.or()` de PostgREST.
 *
 * En el DSL de PostgREST, comas, puntos y paréntesis son separadores: un valor
 * con esos caracteres (p.ej. un id o un término de búsqueda) rompía o alteraba
 * el filtro. Envolver el valor en comillas dobles lo trata como literal;
 * las comillas y backslashes internos se escapan.
 */
export const escapeOrValue = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return (
    supabaseUrl !== 'https://your-project.supabase.co' &&
    supabaseAnonKey !== 'your-anon-key' &&
    supabaseUrl.includes('supabase.co')
  );
};
