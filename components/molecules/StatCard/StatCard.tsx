import { Typography } from '@/components/atoms';

interface StatCardProps {
  label: string;
  value: number;
  color: 'red' | 'blue' | 'green';
}

export function StatCard({ label, value, color }: StatCardProps) {
  const colorClasses = {
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
  };

  return (
    <div className={`rounded-lg p-2 text-center ${colorClasses[color]}`}>
      <Typography variant="span" className="text-xs text-gray-600">
        {label}
      </Typography>
      <Typography variant="span" className="text-base font-bold sm:text-lg">
        {value}
      </Typography>
    </div>
  );
}
