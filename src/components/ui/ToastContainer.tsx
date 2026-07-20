import { useToastStore } from '../../store/useToastStore';
import { X, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'info':
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getStyles = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-line text-led';
      case 'error':
        return 'border-loss text-loss';
      case 'warning':
        return 'border-gold text-gold';
      case 'info':
      default:
        return 'border-grass text-grass-soft';
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-40 lg:bottom-4 right-4 z-50 space-y-2 max-w-md">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 p-4 bg-grass-dark border-4 font-terminal shadow-hard-panel animate-slide-in ${getStyles(
            toast.type
          )}`}
        >
          <div className="flex-shrink-0">{getIcon(toast.type)}</div>
          <p className="flex-1 text-base text-white">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 text-grass-soft hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
