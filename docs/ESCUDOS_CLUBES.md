# Escudos de clubes (modos de ligas)

Las **selecciones** derivan su bandera del `teamId` (código de país → flagcdn),
ignorando la columna `teams.flag`. Los **clubes** de un modo de ligas no tienen
código de país, así que su escudo sale del campo `teams.flag`, que puede ser:

- un **emoji** (ej. `⚽`, `🦅`, `🔴`), o
- una **URL de imagen** (PNG/SVG) — el camino recomendado para escudos reales.

El render lo hace `src/components/ui/TeamFlag.tsx`: si el id no tiene código de
país, usa `team.flag` (imagen si es URL/`data:`, si no lo trata como emoji/texto).
Funciona en todas las vistas donde aparece un equipo (tablas, marcadores, modales).

## Escudos reales con Supabase Storage

1. En el panel de Supabase → **Storage** → **New bucket**:
   - Nombre: `crests` (o el que prefieras).
   - Marcarlo **Public** (lectura pública), así las imágenes se sirven por URL.
2. Subir el archivo de cada club (PNG o SVG). Sugerencia de nombre: el `teamId`
   del club (ej. `crests/villa-fc.png`) para tenerlos ordenados.
3. La URL pública queda con este formato:
   ```
   https://<TU-PROJECT-REF>.supabase.co/storage/v1/object/public/crests/<archivo>
   ```
4. Esa URL es la que va en `teams.flag` de cada club (lo resuelve la migración de
   siembra `019`, que se genera cuando pases los clubes con sus escudos).

### Recomendaciones
- **Cuadrados** y con fondo transparente se ven mejor (el recuadro de club es 1:1).
- Tamaño chico alcanza (128×128 o 256×256): se renderiza a 16–48 px.
- Si una URL falla al cargar, el componente cae al id del club como texto, así que
  no rompe nada.
