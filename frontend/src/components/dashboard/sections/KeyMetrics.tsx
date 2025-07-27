// frontend/src/components/dashboard/sections/KeyMetrics.tsx

import React from 'react';
import { StatCard } from '../../ui/stat-card';

interface Device {
  current_power?: number;
}

interface HourlyData {
  averageEnergy?: number;
}

interface KeyMetricsProps {
  devices: Device[];
  hourlyData: HourlyData[];
  isLoading: boolean;
}

const KeyMetrics: React.FC<KeyMetricsProps> = ({ devices, hourlyData, isLoading }) => {
  const totalCurrentUsage = devices
    .reduce((sum, d) => sum + (d.current_power || 0), 0)
    .toFixed(2);

  const totalToday = (
    hourlyData.reduce((sum, h) => sum + (h.averageEnergy || 0), 0) * 24
  ).toFixed(2);

  return (
    <section className="mb-6 sm:mb-8">
      <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">
        Key Metrics
      </h2>
      <div className="grid gap-4 sm:gap-6 grid-cols-1 xs:grid-cols-2">
        <StatCard
          title="Current Usage"
          value={totalCurrentUsage}
          unit="W"
          icon="bolt"
          description="Total power being used right now"
          isLoading={isLoading}
          className="bg-card hover:shadow-md transition-shadow duration-200 border"
        />
        <StatCard
          title="Total Today"
          value={totalToday}
          unit="kWh"
          icon="bolt"
          description="Energy used so far today"
          isLoading={isLoading}
          className="bg-card hover:shadow-md transition-shadow duration-200 border"
        />
      </div>
    </section>
  );
};

export default KeyMetrics;