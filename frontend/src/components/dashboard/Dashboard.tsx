// frontend/src/components/dashboard/Dashboard.tsx

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import Header from './sections/Header';
import TimeRangeTabs from './sections/TimeRangeTabs';
import KeyMetrics from './sections/KeyMetrics';
import HourlySummarySection from './sections/HourlySummarySection';
import TopConsumersSection from './sections/TopConsumersSection';
import DeviceEnergySection from './sections/DeviceEnergySection';
import DeviceListSection from './sections/DeviceListSection';
import useDashboardData from './hooks/useDashboardData';

type DashboardTimeRange = 'day' | '3days' | 'week';

const timeRangeOptions: { value: DashboardTimeRange; label: string }[] = [
  { value: 'day',   label: 'Today' },
  { value: '3days', label: 'Last 3 Days' },
  { value: 'week',  label: 'Last 7 Days' },
];

const Dashboard: React.FC = () => {
  const {
    timeRange,
    setTimeRange,
    selectedDeviceId,
    setSelectedDeviceId,
    analyticsData,
    devices,
    devicesWithNames,
    selectedDevice,
    isLoading,
    error,
    chartTimeRange,
  } = useDashboardData();

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-8">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-foreground">
          Something went wrong
        </h2>
        <p className="text-muted-foreground mb-4">
          We couldn't load the dashboard data. Please try again later.
        </p>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-gradient-to-br from-background to-muted/20 p-3 sm:p-4 md:p-6 lg:p-8 pt-4 sm:pt-6">
      <Header />

      <TimeRangeTabs
        options={timeRangeOptions}
        value={timeRange}
        onChange={setTimeRange}
      />

      <KeyMetrics
        devices={devices}
        hourlyData={analyticsData.hourlyData}
        isLoading={isLoading}
      />

      <HourlySummarySection
        data={analyticsData.hourlyData}
        isLoading={isLoading}
        error={error}
      />

      <TopConsumersSection
        data={devicesWithNames}
        timeRange={timeRange}
        isLoading={isLoading}
        error={error}
      />

      <DeviceEnergySection
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        timeRange={chartTimeRange()}
        selectedDeviceName={selectedDevice.name}
      />

      <DeviceListSection
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        isLoading={isLoading}
      />
    </div>
  );
};

export default Dashboard;