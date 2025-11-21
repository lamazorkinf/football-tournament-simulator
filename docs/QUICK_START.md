# Quick Start - Schema Normalizado

Guía rápida para empezar a usar el schema normalizado.

## Estado Actual

✅ Migración de base de datos aplicada
✅ Servicios TypeScript implementados
✅ Feature flag configurado
✅ Errores de compilación TypeScript **RESUELTOS** ✅
✅ Build production exitoso ✅

## Solución Implementada

Los errores de compilación de TypeScript han sido **completamente resueltos** mediante un cliente tipado personalizado (`src/lib/supabaseNormalized.ts`).

### ¿Qué se hizo?

Se creó un objeto `db` que proporciona métodos tipados para cada tabla:

```typescript
// Los servicios ahora usan:
await db.tournaments_new().insert({...})

// En lugar de:
await supabase.from('tournaments_new').insert({...})
```

### Build Production

```bash
npm run build
# ✅ Compila sin errores
```

## Cómo Usar el Schema Normalizado

### 1. Activar el Schema Normalizado

Edita tu archivo `.env`:

```bash
# Cambiar de:
VITE_USE_NORMALIZED_SCHEMA=false

# A:
VITE_USE_NORMALIZED_SCHEMA=true
```

### 2. Iniciar en Modo Desarrollo

```bash
npm run dev
```

### 3. Crear un Nuevo Torneo

1. Abre http://localhost:5173
2. Click en "New Tournament"
3. Ingresa un año (ej: 2030)
4. Click "Create"

### 4. Generar Draw y Fixtures

1. Click en "Generate Draw & Fixtures"
2. Espera unos segundos
3. Verifica que los grupos y partidos se generaron

### 5. Simular Partidos

1. Ve a "Qualifiers"
2. Selecciona una región (ej: Europe)
3. Click "Simulate" en cualquier partido
4. **¡Magia!** Los standings se actualizan automáticamente ✨

### 6. Verificar en Supabase

Abre tu Supabase Dashboard:

1. Ve a `Table Editor`
2. Busca la tabla `qualifier_group_teams`
3. Verás los puntos, victorias, goles actualizados automáticamente

## Ventajas que Verás

### ⚡ Actualización Automática
- No necesitas calcular standings manualmente
- Los triggers de DB lo hacen por ti

### 🔒 Integridad de Datos
- Foreign keys previenen datos inválidos
- No puedes crear partidos con equipos que no existen

### 📊 Mejor Performance
- Queries directos en lugar de deserializar JSONB
- Índices optimizados

## Testing Básico

Sigue la guía completa en: `docs/TESTING_NORMALIZED_SCHEMA.md`

### Test Rápido (5 minutos)

```bash
# 1. Activar schema normalizado
# En .env: VITE_USE_NORMALIZED_SCHEMA=true

# 2. Iniciar
npm run dev

# 3. Crear torneo y generar draw
# UI: New Tournament → Generate Draw

# 4. Simular un partido
# UI: Qualifiers → Europe → Simulate un partido

# 5. Verificar standings automáticos
# UI: La tabla de posiciones se actualiza instantáneamente

# 6. Verificar en Supabase
# Dashboard → qualifier_group_teams → Ver datos actualizados
```

## Troubleshooting

### "Using legacy JSONB service" en consola

**Problema:** El feature flag no está funcionando.

**Solución:**
```bash
# 1. Verifica .env
cat .env | grep VITE_USE_NORMALIZED_SCHEMA

# 2. Debe decir: VITE_USE_NORMALIZED_SCHEMA=true

# 3. Reinicia el servidor
# Ctrl+C
npm run dev
```

### Los standings no se actualizan

**Problema:** Simulaste un partido pero los puntos no cambian.

**Solución:**
1. Verifica que estás usando schema normalizado (consola debe decir "Using normalized schema service")
2. Verifica en Supabase que el trigger existe
3. Recarga la página

## Próximos Pasos

1. ✅ Usar la aplicación en modo dev con schema normalizado
2. ✅ Hacer build production: `npm run build`
3. ✅ Migrar datos existentes (opcional): `npx tsx scripts/migrateTournamentsToNormalized.ts`
4. ✅ Testing exhaustivo: Ver `docs/TESTING_NORMALIZED_SCHEMA.md`

## Soporte

- **Documentación Completa:** `docs/NORMALIZED_SCHEMA_IMPLEMENTATION.md`
- **Testing:** `docs/TESTING_NORMALIZED_SCHEMA.md`
- **Servicios:** `src/services/README.md`

---

**Estado:** ✅ **Schema normalizado completamente funcional** - Tanto en desarrollo como en producción.
