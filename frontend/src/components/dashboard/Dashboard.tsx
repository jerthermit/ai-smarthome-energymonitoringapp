// frontend/src/components/dashboard/Dashboard.tsx

import React, { useState, useCallback } from 'react';
import type { TimeRange } from '../../types/dashboard';
import { TIME_RANGE_OPTIONS } from '../../types/dashboard';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import Header from './sections/Header';
import TimeRangeTabs from './sections/TimeRangeTabs';
// import KeyMetrics from './sections/KeyMetrics'; // unused
import HourlySummarySection from './sections/HourlySummarySection';
import TopConsumersSection from './sections/TopConsumersSection';
import AggregateConsumptionSection from './sections/AggregateConsumptionSection';
import DeviceEnergySection from './sections/DeviceEnergySection';
import ScrollToTop from '../ui/ScrollToTop';
import useDashboardData from './hooks/useDashboardData';

const Dashboard: React.FC = () => {
  // Dashboard-wide time range tabs: 'day' | '3days' | 'week'
  const [timeRange, setTimeRange] = useState<TimeRange>('week');

  // Now that timeRange exists, we can pass it into the data hook
  const {
    selectedDeviceId,
    setSelectedDeviceId,
    devices,
    analyticsData,
    devicesWithNames,
    selectedDevice,
    isLoading,
    error,
  } = useDashboardData(timeRange);

  const handleTimeRangeChange = useCallback((newRange: TimeRange) => {
    setTimeRange(newRange);
  }, []);

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-8">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-foreground">Something went wrong</h2>
        <p className="text-muted-foreground mb-4">
          We couldn't load the dashboard data. Please try again later.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Header />

        <div className="grid gap-6 grid-cols-1">
          {/* Hourly (kWh) summary */}
          <div className="col-span-1">
            <HourlySummarySection
              data={analyticsData.hourlyData}
              isLoading={isLoading}
              error={error}
            />
          </div>

          {/* Time range tabs + Total Energy */}
          <div className="col-span-1">
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Energy Consumption</h3>
                <TimeRangeTabs
                  options={TIME_RANGE_OPTIONS}
                  value={timeRange}
                  onChange={handleTimeRangeChange}
                />
              </div>

              <AggregateConsumptionSection
                timeRange={timeRange}
                deviceIds={selectedDeviceId !== 'all' ? [selectedDeviceId] : undefined}
                className="w-full"
              />
            </div>
          </div>

          {/* Side-by-side layout with equal heights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Left: Top Energy Consumers */}
            <div className="col-span-1 h-full">
              <TopConsumersSection
                data={devicesWithNames}
                isLoading={isLoading}
                timeRange={timeRange}
                error={error}
              />
            </div>

            {/* Right: Device Energy Usage */}
            <div className="col-span-1 h-full">
              <DeviceEnergySection
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={setSelectedDeviceId}
                timeRange={timeRange} // 'day' | '3days' | 'week'
                selectedDeviceName={selectedDevice?.name || 'All Devices'}
                showDeviceList={true}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>

        <ScrollToTop />
      </div>
    </div>
  );
};

export default Dashboard;