'use client';

interface ToastMessageProps {
  message: string;
  onDismiss: () => void;
}

/**
 * Individual toast notification component
 * Displays a success message with auto-dismiss
 */
export function ToastMessage({ message, onDismiss }: ToastMessageProps) {
  return (
    <div
      className="animate-in slide-in-from-bottom-full pointer-events-auto flex items-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-white shadow-lg transition-all duration-300"
      role="alert"
    >
      <svg
        className="h-5 w-5 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="ml-2 flex-shrink-0 rounded p-1 hover:bg-green-700 focus:ring-2 focus:ring-green-400 focus:outline-none"
        aria-label="Dismiss notification"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
