'use client';

import * as React from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToastVariant } from '@/hooks/use-toast';

interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  onDismiss: (id: string) => void;
}

const variantStyles: Record<ToastVariant, string> = {
  default: 'border-cme-border',
  success: 'border-cme-success/30',
  error: 'border-cme-error/30',
  warning: 'border-cme-warning/30',
};

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="h-5 w-5 text-cme-primary" />,
  success: <CheckCircle2 className="h-5 w-5 text-cme-success" />,
  error: <AlertCircle className="h-5 w-5 text-cme-error" />,
  warning: <AlertTriangle className="h-5 w-5 text-cme-warning" />,
};

function Toast({ id, title, description, variant, duration, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = React.useState(false);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setIsExiting(true);
    }, duration - 300);

    const removeTimeout = setTimeout(() => {
      onDismiss(id);
    }, duration);

    return () => {
      clearTimeout(timeout);
      clearTimeout(removeTimeout);
    };
  }, [id, duration, onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto w-[360px] overflow-hidden rounded-lg border bg-cme-surface/95 backdrop-blur-xl shadow-lg shadow-black/20',
        variantStyles[variant],
        isExiting ? 'animate-toast-out' : 'animate-toast-in'
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0 mt-0.5">{variantIcons[variant]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-cme-text">{title}</p>
          {description && (
            <p className="mt-1 text-xs text-cme-text-muted">{description}</p>
          )}
        </div>
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(() => onDismiss(id), 300);
          }}
          className="shrink-0 rounded-md p-1 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export { Toast };
