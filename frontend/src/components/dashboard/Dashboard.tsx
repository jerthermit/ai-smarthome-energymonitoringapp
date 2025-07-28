// frontend/src/components/dashboard/Dashboard.tsx

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import Header from './sections/Header';
import TimeRangeTabs from './sections/TimeRangeTabs';
import KeyMetrics from './sections/KeyMetrics';
import HourlySummarySection from './sections/HourlySummarySection';
import TopConsumersSection from './sections/TopConsumersSection';
import AggregateConsumptionSection from './sections/AggregateConsumptionSection';
import DeviceEnergySection from './sections/DeviceEnergySection';
import ScrollToTop from '../ui/ScrollToTop';
import useDashboardData from './hooks/useDashboardData';

type DashboardTimeRange = 'day' | '3days' | 'week';

type TimeRange = 'hour' | 'day' | 'week' | 'month';

const timeRangeOptions: { value: DashboardTimeRange; label: string }[] = [
  { value: 'day',   label: 'Today' },
  { value: '3days', label: 'Last 3 Days' },
  { value: 'week',  label: 'Last 7 Days' },
];

// Convert DashboardTimeRange to TimeRange (maps '3days' to 'day')
const toTimeRange = (range: DashboardTimeRange): TimeRange => {
  if (range === '3days') return 'day';
  return range as TimeRange;
};

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
    <div className="flex-1 min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Header />



        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <HourlySummarySection
              data={analyticsData.hourlyData}
              isLoading={isLoading}
              error={error}
            />
          </div>
          


          <div className="h-full">
            <KeyMetrics
              devices={devices}
              hourlyData={analyticsData.hourlyData}
              isLoading={isLoading}
              showCurrentUsage={true}
              showTotalToday={true}
            />
          </div>

<div className="lg:col-span-2">
            <div className="flex flex-col space-y-6">
              {/* Aggregate Chart Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Energy Consumption</h3>
                  <TimeRangeTabs
                    value={timeRange}
                    onChange={setTimeRange}
                    options={timeRangeOptions}
                  />
                </div>
                <div className="bg-card rounded-lg border p-4">
                  <AggregateConsumptionSection 
                    timeRange={toTimeRange(timeRange)}
                    deviceIds={selectedDeviceId !== 'all' ? [selectedDeviceId] : undefined}
                  />
                </div>
              </div>

              {/* Top Consumers Section */}
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Top Energy Consumers</h3>
                <div className="bg-card rounded-lg border p-4">
                  <TopConsumersSection
                    data={devicesWithNames}
                    isLoading={isLoading}
                    timeRange={timeRange}
                    error={error}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <DeviceEnergySection
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
              timeRange={chartTimeRange()}
              selectedDeviceName={selectedDevice.name}
              showDeviceList={true}
              isLoading={isLoading}
            />
          </div>
        </div>
        <ScrollToTop />
      </div>
    </div>
  );
};

export default Dashboard;