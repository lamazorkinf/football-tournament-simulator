import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Escudos de club subidos a un bucket público de Supabase Storage. Este servicio
 * sólo LISTA lo que ya está subido (con su URL pública) para poder asignarlo a
 * cada club; la subida se hace por fuera (panel de Supabase). Ver
 * docs/ESCUDOS_CLUBES.md.
 */

export const DEFAULT_CRESTS_BUCKET = 'crests';

export interface CrestFile {
  name: string; // nombre del archivo en el bucket (ej. "vm-alumni.png")
  url: string; // URL pública
}

export const crestsService = {
  /** Lista los archivos del bucket con su URL pública. Vacío si no está configurado. */
  async listCrests(bucket = DEFAULT_CRESTS_BUCKET): Promise<CrestFile[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await supabase.storage
      .from(bucket)
      .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    return (data ?? [])
      // Las carpetas vienen con id null y el placeholder de carpeta vacía se filtra.
      .filter((f) => f.id !== null && f.name !== '.emptyFolderPlaceholder')
      .map((f) => ({
        name: f.name,
        url: supabase.storage.from(bucket).getPublicUrl(f.name).data.publicUrl,
      }));
  },
};
