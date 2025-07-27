import { cn } from "../../utils/index"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

function Skeleton({
  className,
  shimmer = true,
  rounded = 'md',
  ...props
}: SkeletonProps) {
  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  }[rounded];

  return (
    <div 
      className={cn(
        "relative overflow-hidden bg-muted/50",
        roundedClass,
        className
      )}
      {...props}
    >
      <div 
        className={cn(
          "h-full w-full",
          shimmer && "animate-pulse"
        )}
      >
        {shimmer && (
          <div 
            className={cn(
              "absolute inset-0 -translate-x-full bg-gradient-to-r",
              "from-muted/50 via-muted/30 to-muted/50",
              "animate-[shimmer_2s_infinite]"
            )}
          />
        )}
        {/* Invisible content to maintain dimensions */}
        <span className="opacity-0">{props.children}</span>
      </div>
    </div>
  )
}

export { Skeleton }
