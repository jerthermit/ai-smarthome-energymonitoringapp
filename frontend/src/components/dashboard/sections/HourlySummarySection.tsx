// frontend/src/components/dashboard/sections/HourlySummarySection.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../ui/card';
import { BarChart3 } from 'lucide-react';
import HourlySummaryChart from '../../../components/charts/HourlySummaryChart';

interface HourlyData {
  hour: number;
  averageEnergy: number;
}

interface HourlySummarySectionProps {
  data: HourlyData[];
  isLoading: boolean;
  error: Error | null;
}

const HourlySummarySection: React.FC<HourlySummarySectionProps> = ({
  data,
  isLoading,
  error,
}) => (
  <section>
    <div className="mb-3 sm:mb-4">
      <h2 className="text-lg sm:text-xl font-semibold text-foreground">
        Hourly Analysis
      </h2>
      <p className="text-xs sm:text-sm text-muted-foreground">
        Breakdown of energy usage throughout the day
      </p>
    </div>
    <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 sm:p-2 rounded-lg bg-secondary/10 text-secondary-foreground">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg">
              Hourly Energy Consumption
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Average energy usage by hour of day
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-64 sm:h-72 md:h-80">
        <div className="h-full w-full">
          <HourlySummaryChart
            data={data}
            isLoading={isLoading}
            error={error}
          />
        </div>
      </CardContent>
    </Card>
  </section>
);

export default HourlySummarySection;