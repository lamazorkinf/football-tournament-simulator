import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Muestra el indicador de carga, deshabilita y marca aria-busy. */
  loading?: boolean;
  className?: string;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  loading = false,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-arcade uppercase leading-none border-4 transition-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none';

  const variantStyles = {
    primary: 'bg-gold text-night border-white shadow-hard-btn hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_#7a2b0e]',
    secondary: 'bg-grass text-white border-line shadow-hard-panel hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgb(0_0_0/0.5)]',
    outline: 'bg-transparent text-led border-line hover:bg-grass/40',
    ghost: 'bg-transparent text-grass-soft border-transparent hover:text-white hover:bg-grass/40',
    danger: 'bg-loss text-white border-white shadow-hard-panel hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgb(0_0_0/0.5)]',
  };

  const sizeStyles = {
    sm: 'px-3 py-2 text-[10px] min-h-11 lg:min-h-0',
    md: 'px-4 py-3 text-xs min-h-11 lg:min-h-0',
    lg: 'px-6 py-4 text-sm min-h-12 lg:min-h-0',
  };

  return (
    <button
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
