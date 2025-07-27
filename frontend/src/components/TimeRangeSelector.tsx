import React from 'react';
import { Button } from './ui/button';
// Utility function to merge class names
const cn = (...classes: (string | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};

type TimeRange = 'day' | 'week' | 'month';

interface TimeRangeOption {
  value: TimeRange;
  label: string;
}

const timeRanges: TimeRangeOption[] = [
  { value: 'day', label: '24h' },
  { value: 'week', label: '7d' },
  { value: 'month', label: '30d' },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  className?: string;
}

const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  value,
  onChange,
  className,
}) => {
  return (
    <div className={cn("flex items-center space-x-1 bg-muted p-1 rounded-md", className)}>
      {timeRanges.map((range) => (
        <Button
          key={range.value}
          variant="ghost"
          size="sm"
          className={cn(
            "px-2 py-1 h-auto text-xs font-medium rounded-sm",
            value === range.value 
              ? "bg-background shadow-sm text-foreground" 
              : "text-muted-foreground hover:bg-background/50"
          )}
          onClick={() => onChange(range.value)}
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
};

export { TimeRangeSelector };
export type { TimeRange };
