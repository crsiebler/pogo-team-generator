import { Typography } from '@/components/atoms';

interface StatCardProps {
  label: string;
  value: number;
  color: 'red' | 'blue' | 'green';
}

export function StatCard({ label, value, color }: StatCardProps) {
  const colorClasses = {
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    green:
      'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };

  const labelClasses = 'text-xs text-gray-600 dark:text-gray-400';

  return (
    <div className={`rounded-lg p-2 text-center ${colorClasses[color]}`}>
      <Typography variant="span" className={labelClasses}>
        {label}
      </Typography>
      <Typography variant="span" className="text-base font-bold sm:text-lg">
        {value}
      </Typography>
    </div>
  );
}
