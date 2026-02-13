'use client';

import { ToastMessage } from './ToastMessage';
import { useToast } from '@/lib/hooks/useToast';

/**
 * Container component for rendering toast notifications
 * Positioned at bottom-right of screen
 */
export function Toast() {
  const { toasts, hideToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastMessage
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onDismiss={() => hideToast(toast.id)}
        />
      ))}
    </div>
  );
}
