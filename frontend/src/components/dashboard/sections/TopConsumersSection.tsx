// frontend/src/components/dashboard/sections/TopConsumersSection.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../ui/card';
import { Activity } from 'lucide-react';
import TopDevicesChart from '../../../components/charts/TopDevicesChart';

interface ConsumerData {
  deviceId: string;
  totalEnergy: number;
  name?: string;
}

interface TopConsumersSectionProps {
  data: ConsumerData[];
  timeRange: 'day' | '3days' | 'week';
  isLoading: boolean;
  error: Error | null;
}

const TopConsumersSection: React.FC<TopConsumersSectionProps> = ({
  data,
  timeRange,
  isLoading,
  error,
}) => {
  const label =
    timeRange === 'day'
      ? 'Today'
      : timeRange === '3days'
      ? 'Last 3 Days'
      : 'Last 7 Days';

  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
      <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 sm:p-2 rounded-lg bg-secondary/10 text-secondary-foreground">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg">Top Energy Consumers</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {label}'s highest consumers
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-[280px] sm:min-h-[320px] px-4 pb-4 sm:px-6 sm:pb-6">
        <TopDevicesChart
          data={data}
          timeRange={timeRange}
          isLoading={isLoading}
          error={error}
        />
      </CardContent>
    </Card>
  );
};

export default TopConsumersSection;