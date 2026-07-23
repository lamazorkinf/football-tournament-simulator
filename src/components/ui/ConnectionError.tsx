import { useState } from 'react';
import { WifiOff, DatabaseZap } from 'lucide-react';
import { Button } from './Button';

interface ConnectionErrorProps {
  /** 'error': la DB no respondió. 'unconfigured': faltan las env vars. */
  variant: 'error' | 'unconfigured';
  onRetry: () => Promise<void> | void;
}

/**
 * Pantalla de arranque fallido. La app no guarda copia local del torneo, así
 * que sin base de datos no hay nada que mostrar: en vez de arrancar con datos
 * viejos (la causa de que un dispositivo pisara lo jugado en otro), se bloquea
 * con un estado explícito.
 */
export function ConnectionError({ variant, onRetry }: ConnectionErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const Icon = variant === 'unconfigured' ? DatabaseZap : WifiOff;

  return (
    <div className="min-h-screen flex items-center justify-center bg-night px-4">
      <div className="max-w-md w-full bg-grass-dark border-4 border-gold shadow-hard-panel p-6 text-center">
        <Icon className="w-12 h-12 text-gold mx-auto mb-4" aria-hidden="true" />

        {variant === 'unconfigured' ? (
          <>
            <h1 className="font-arcade text-xs text-gold uppercase mb-4">Base sin configurar</h1>
            <p className="text-sm text-grass-soft mb-2">
              Faltan las credenciales de Supabase. Sin base de datos la app no puede guardar ni
              cargar torneos.
            </p>
            <p className="text-sm text-grass-soft">
              Copiá <code className="text-led font-terminal">.env.example</code> a{' '}
              <code className="text-led font-terminal">.env</code>, completá{' '}
              <code className="text-led font-terminal">VITE_SUPABASE_URL</code> y{' '}
              <code className="text-led font-terminal">VITE_SUPABASE_ANON_KEY</code>, y reiniciá el
              servidor de desarrollo.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-arcade text-xs text-gold uppercase mb-4">Sin conexión</h1>
            <p className="text-sm text-grass-soft mb-6">
              No se pudo conectar con la base de datos. Tus torneos están guardados ahí: revisá la
              conexión y volvé a intentar.
            </p>
            <Button variant="primary" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? 'Reintentando…' : 'Reintentar'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
