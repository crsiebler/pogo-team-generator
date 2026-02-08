import { Typography } from '@/components/atoms';
import { useTheme } from '@/hooks/useTheme';

interface StatCardProps {
  label: string;
  value: number;
  color: 'red' | 'blue' | 'green';
}

export function StatCard({ label, value, color }: StatCardProps) {
  const { theme } = useTheme();

  const colorClasses = {
    red:
      theme === 'dark'
        ? 'bg-red-900/30 text-red-300'
        : 'bg-red-50 text-red-700',
    blue:
      theme === 'dark'
        ? 'bg-blue-900/30 text-blue-300'
        : 'bg-blue-50 text-blue-700',
    green:
      theme === 'dark'
        ? 'bg-green-900/30 text-green-300'
        : 'bg-green-50 text-green-700',
  };

  const labelClasses =
    theme === 'dark' ? 'text-xs text-gray-400' : 'text-xs text-gray-600';

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
