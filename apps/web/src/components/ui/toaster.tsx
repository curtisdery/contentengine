'use client';

import { useToast } from '@/hooks/use-toast';
import { Toast } from './toast';

function Toaster() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-4"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          duration={toast.duration}
          onDismiss={removeToast}
        />
      ))}
    </div>
  );
}

export { Toaster };
