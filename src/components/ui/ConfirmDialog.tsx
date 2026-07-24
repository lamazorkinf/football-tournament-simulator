import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
}

/**
 * Diálogo de confirmación en la clave visual de la app, en reemplazo de
 * `window.confirm`. Radix aporta el foco atrapado, el retorno del foco al
 * disparador, Escape y los roles ARIA — todo lo que una implementación a mano
 * suele olvidar.
 *
 * Regla de uso: este diálogo es solo para acciones que DESTRUYEN trabajo
 * existente (regenerar un sorteo, borrar un torneo o un equipo). Las acciones
 * que crean progreso pasan directo con un toast. Confirmar todo equivale a no
 * confirmar nada: el usuario aprende a apretar "Aceptar" sin leer.
 *
 * Contrato de errores: si `onConfirm` rechaza, el diálogo queda abierto y el
 * error se registra en consola, pero NO se le muestra nada al usuario — el
 * mensaje lo pone el consumidor, que sabe qué falló. Corolario importante: un
 * consumidor que atrape sus propios errores sin re-lanzarlos hace que
 * `onConfirm` resuelva bien y el diálogo se cierre, enmascarando como éxito
 * una acción destructiva que falló. Si querés que el diálogo siga abierto
 * ante un fallo, dejá que la promesa rechace.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      // El diálogo queda ABIERTO a propósito: cerrarlo dejaría al usuario
      // creyendo que la acción destructiva se completó. El mensaje al usuario
      // lo pone el consumidor, que es el único que sabe qué falló.
      console.error('ConfirmDialog: la acción de confirmación falló', error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      // Mientras la acción corre, ni Escape ni el backdrop cierran: cerrar a
      // mitad dejaría al usuario sin saber si se completó.
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[calc(100%-2rem)] max-w-md p-6',
            'bg-grass-dark border-4 shadow-hard-panel pause-in',
            variant === 'danger' ? 'border-loss' : 'border-line'
          )}
        >
          <div className="flex items-start gap-3 mb-4">
            {variant === 'danger' && (
              <AlertTriangle className="w-6 h-6 text-loss flex-shrink-0" />
            )}
            <Dialog.Title className="font-arcade text-xs text-gold uppercase leading-relaxed">
              {title}
            </Dialog.Title>
          </div>

          {description ? (
            <Dialog.Description asChild>
              <div className="text-grass-soft text-sm mb-6 space-y-2">{description}</div>
            </Dialog.Description>
          ) : (
            // Sin descripción, Radix avisa por consola salvo que se declare.
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}

          <div className="flex gap-2 justify-end flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={handleConfirm}
              loading={pending}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
