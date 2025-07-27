import { Icons } from '../shared/icons';
import { Skeleton } from './skeleton';
import { cn } from '../../utils/index';

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string;
  unit: string;
  icon: keyof typeof Icons;
  isLoading?: boolean;
  trend?: number;
  description?: string;
  className?: string;
  variant?: 'default' | 'gradient' | 'bordered';
  iconVariant?: 'default' | 'solid' | 'outline';
}

export function StatCard({
  title,
  value,
  unit,
  icon: IconName,
  isLoading = false,
  trend,
  description,
  className,
  variant = 'default',
  iconVariant = 'default',
  ...props
}: StatCardProps) {
  const Icon = Icons[IconName];
  
  const getTrendIcon = (): React.ReactNode => {
    if (trend === undefined || trend === null) return null;
    const Icon = trend > 0 ? Icons.trendingUp : Icons.trendingDown;
    return <Icon className="h-4 w-4" aria-hidden="true" />;
  };

  const cardVariants = {
    default: 'bg-card border-border/50',
    gradient: 'bg-gradient-to-br from-card to-card/80 border-border/30',
    bordered: 'bg-card border-2 border-primary/10',
  };

  const iconVariants = {
    default: 'text-muted-foreground',
    solid: 'bg-primary/10 text-primary p-1.5 rounded-lg',
    outline: 'border border-border p-1.5 rounded-lg text-foreground',
  };

  if (isLoading) {
    return (
      <div className={cn(
        "relative overflow-hidden rounded-xl border p-6 shadow-sm transition-all hover:shadow-md",
        cardVariants[variant],
        className
      )}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "group relative overflow-hidden rounded-xl border p-6 transition-all hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        cardVariants[variant],
        className
      )} 
      {...props}
    >
      {/* Decorative background elements */}
      {variant === 'gradient' && (
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-primary/5" />
      )}
      
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {Icon && (
            <div className={cn(
              "flex h-8 w-8 items-center justify-center transition-colors",
              "group-hover:bg-primary/5 group-hover:text-primary",
              iconVariants[iconVariant]
            )}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
        </div>
        
        <div className="mt-2">
          <div className="flex items-baseline">
            <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
            {unit && (
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
          
          {(trend !== undefined || description) && (
            <div className="mt-3 flex items-center text-sm">
              {trend !== undefined && (
                <div 
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    trend > 0 
                      ? 'bg-destructive/10 text-destructive' 
                      : 'bg-green-500/10 text-green-600',
                    "transition-colors duration-200"
                  )}
                >
                  {getTrendIcon()}
                  <span className="ml-1">{Math.abs(trend)}%</span>
                </div>
              )}
              {description && (
                <p className="ml-2 text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
