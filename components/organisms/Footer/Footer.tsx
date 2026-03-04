import { TwitchIcon, XIcon } from '@/components/atoms';
import {
  formatUtcDateTime,
  getLastSuccessfulSyncAt,
} from '@/lib/data/syncMetadata';

export function Footer() {
  const lastSuccessfulSyncAt = getLastSuccessfulSyncAt();
  const lastUpdatedText = lastSuccessfulSyncAt
    ? formatUtcDateTime(lastSuccessfulSyncAt)
    : 'Not available yet';

  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-6 dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-4">
          <a
            href="https://x.com/ekvelt"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit Ekvelt on X"
            className="rounded-md p-1 text-gray-700 transition-colors hover:text-black focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-gray-300 dark:hover:text-white"
          >
            <XIcon size={24} />
          </a>
          <a
            href="https://twitch.tv/ekvelt"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit Ekvelt on Twitch"
            className="rounded-md p-1 transition-opacity hover:opacity-80 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <TwitchIcon size={24} />
          </a>
        </div>
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Last data sync (UTC): {lastUpdatedText}
        </p>
      </div>
    </footer>
  );
}
