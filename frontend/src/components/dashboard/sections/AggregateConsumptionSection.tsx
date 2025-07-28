import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Activity } from 'lucide-react';
import { useTelemetryData } from '../../../hooks/useTelemetryData';
import { Skeleton } from '../../ui/skeleton';

// Simple number formatter utility
const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

// Define time range types
type TelemetryTimeRange = 'day' | 'week' | 'month';
// Combined type to handle both Dashboard and Telemetry time ranges
type TimeRange = 'hour' | 'day' | 'week' | 'month' | '3days';

const timeRangeLabels: Record<string, string> = {
  day: 'Today',
  '3days': 'Last 3 Days',
  week: 'This Week',
  month: 'This Month'
};

interface AggregateConsumptionSectionProps {
  timeRange?: TimeRange;
  deviceIds?: string[];
  className?: string;
}

// Map any time range to a valid TelemetryTimeRange
const mapToTelemetryTimeRange = (range?: TimeRange): TelemetryTimeRange => {
  if (!range) return 'day';
  if (range === '3days') return 'day';
  if (range === 'day' || range === 'week' || range === 'month') {
    return range;
  }
  return 'day'; // default fallback
};

const AggregateConsumptionSection: React.FC<AggregateConsumptionSectionProps> = ({
  timeRange = 'day',
  deviceIds,
  className = '',
}) => {
  // Using the first device ID if provided, otherwise undefined for all devices
  const deviceId = deviceIds && deviceIds.length > 0 ? deviceIds[0] : undefined;
  
  const mappedTimeRange = mapToTelemetryTimeRange(timeRange || 'day');
  const { data: telemetryData, isLoading, error } = useTelemetryData(mappedTimeRange, {
    deviceId,
    realtime: false, // Disable realtime updates for now
  });

  // Calculate total energy consumption in watt-hours
  const totalEnergyWh = React.useMemo(() => {
    if (!telemetryData || telemetryData.length === 0) return 0;
    
    // Sum all energy readings (assuming energyWatts is in watts and readings are at regular intervals)
    // For more accuracy, we'd need to know the time interval between readings
    return telemetryData.reduce((sum, item) => sum + item.energyWatts, 0);
  }, [telemetryData]);
  
  // Convert to kWh with 2 decimal places
  const totalEnergyKwh = totalEnergyWh / 1000;

  return (
    <Card className={`border shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg font-semibold">
            Total Energy Consumption
          </CardTitle>
          <div className="p-2 rounded-full bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-6 sm:px-6">
        <div className="flex flex-col items-center justify-center py-6">
          {isLoading ? (
            <Skeleton className="h-12 w-32" />
          ) : error ? (
            <div className="text-destructive text-sm">Error loading data</div>
          ) : (
            <>
              <div className="text-4xl font-bold text-foreground">
                {formatNumber(totalEnergyKwh, 2)}
                <span className="text-lg text-muted-foreground ml-1">kWh</span>
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {timeRangeLabels[timeRange || 'day']}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AggregateConsumptionSection;
