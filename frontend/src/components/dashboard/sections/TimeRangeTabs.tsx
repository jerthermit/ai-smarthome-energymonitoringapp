import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import type { TimeRange, DashboardTimeRangeOption } from '../../../types/dashboard';

interface TimeRangeTabsProps {
  options: DashboardTimeRangeOption[];
  value: TimeRange;
  onChange: (newValue: TimeRange) => void;
}

const TimeRangeTabs: React.FC<TimeRangeTabsProps> = ({ options, value, onChange }) => (
  <div className="w-full sm:w-auto bg-card rounded-lg shadow-sm p-0.5 sm:p-1 border">
    <Tabs value={value} onValueChange={(v) => onChange(v as any)} className="w-full">
      <TabsList className="grid grid-cols-3 h-10 sm:h-12 w-full">
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className="text-sm sm:text-base font-medium transition-colors hover:text-foreground px-3 sm:px-4 py-1"
          >
            <span className="truncate">{option.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  </div>
);

export default TimeRangeTabs;
