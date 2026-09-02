import { Typography } from '@/components/atoms';
import { Badge } from '@/components/atoms';

interface MovesSectionProps {
  fastMove?: string;
  chargedMove1?: string;
  chargedMove2?: string;
  additionalChargedMove?: string;
}

function formatMoveName(moveName: string): string {
  return moveName.replace(/_PLUS$/, '+').replace(/_/g, ' ');
}

export function MovesSection({
  fastMove,
  chargedMove1,
  chargedMove2,
  additionalChargedMove,
}: MovesSectionProps) {
  const labelClasses =
    'mb-1 block text-xs font-semibold text-gray-600 sm:text-sm dark:text-gray-400';

  const noRecommendationClasses = 'text-xs text-gray-400 dark:text-gray-500';

  return (
    <div className="space-y-2">
      <div>
        <Typography variant="span" className={labelClasses}>
          Recommended Fast Move
        </Typography>
        <div className="flex flex-wrap gap-1">
          {fastMove ? (
            <Badge color="green">⭐ {fastMove.replace(/_/g, ' ')}</Badge>
          ) : (
            <Typography variant="span" className={noRecommendationClasses}>
              No recommendation
            </Typography>
          )}
        </div>
      </div>

      <div>
        <Typography variant="span" className={labelClasses}>
          Recommended Charged Moves
        </Typography>
        <div className="flex flex-wrap gap-1">
          {chargedMove1 && (
            <Badge color="purple">⭐ {chargedMove1.replace(/_/g, ' ')}</Badge>
          )}
          {chargedMove2 && (
            <Badge color="purple">⭐ {chargedMove2.replace(/_/g, ' ')}</Badge>
          )}
          {!chargedMove1 && !chargedMove2 && (
            <Typography variant="span" className={noRecommendationClasses}>
              No recommendations
            </Typography>
          )}
        </div>
      </div>

      {additionalChargedMove && (
        <div>
          <Typography variant="span" className={labelClasses}>
            Additional Charged Attack
          </Typography>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="primary">
              {formatMoveName(additionalChargedMove)}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
