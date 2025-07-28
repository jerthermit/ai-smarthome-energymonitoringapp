// frontend/src/components/dashboard/sections/HourlySummarySection.tsx

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import HourlySummaryChart from '../../../components/charts/HourlySummaryChart';
import { Clock } from 'lucide-react';

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
  <section className="mb-6 sm:mb-8">
    <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Hourly Energy Consumption</CardTitle>
            <CardDescription>Energy usage patterns throughout the day</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 sm:h-72 md:h-80">
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