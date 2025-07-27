// frontend/src/components/dashboard/sections/TimeRangeTabs.tsx

import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';

export type TimeRangeOption = {
  value: 'day' | '3days' | 'week';
  label: string;
};

interface TimeRangeTabsProps {
  options: TimeRangeOption[];
  value: 'day' | '3days' | 'week';
  onChange: (newValue: 'day' | '3days' | 'week') => void;
}

const TimeRangeTabs: React.FC<TimeRangeTabsProps> = ({ options, value, onChange }) => (
  <div className="w-full sm:w-auto bg-card rounded-lg shadow-sm p-0.5 sm:p-1 border">
    <Tabs value={value} onValueChange={(v) => onChange(v as any)} className="w-full">
      <TabsList className="grid grid-cols-3 h-9 sm:h-10 w-full">
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className="text-xs sm:text-sm font-medium transition-colors hover:text-foreground px-2 sm:px-3"
          >
            <span className="truncate">{option.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  </div>
);

export default TimeRangeTabs;