import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { useTelemetryData } from '../../../hooks/useTelemetryData';
import { Skeleton } from '../../ui/skeleton';

// Custom hook for counting animation
const useAnimatedCounter = (target: string, duration: number = 1000) => {
  const [displayValue, setDisplayValue] = useState('0.00');
  const animationRef = useRef<number | null>(null);
  const startValue = useRef<number>(0);
  const startTime = useRef<number>(0);
  const targetValue = useRef<number>(0);

  useEffect(() => {
    const newTargetValue = parseFloat(target) || 0;
    if (newTargetValue === targetValue.current) return;
    
    // Store the starting value and time
    startValue.current = parseFloat(displayValue) || 0;
    targetValue.current = newTargetValue;
    startTime.current = performance.now();
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    const animate = (currentTime: number) => {
      const elapsedTime = currentTime - startTime.current;
      const progress = Math.min(elapsedTime / duration, 1);
      
      // Ease out function for smooth animation
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue.current + (targetValue.current - startValue.current) * easeOut;
      
      setDisplayValue(currentValue.toFixed(2));
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(target); // Ensure we end exactly at the target
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [target, duration]);
  
  return displayValue;
};

// Simple number formatter utility
const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

// Define time range types
type TimeRange = 'day' | '3days' | 'week' | 'month';

type TimeRangeConfig = {
  label: string;
  telemetryRange: 'day' | 'week' | 'month';
  days: number;
};

const timeRangeConfigs: Record<TimeRange, TimeRangeConfig> = {
  day: { label: 'Today', telemetryRange: 'day', days: 1 },
  '3days': { label: 'Last 3 Days', telemetryRange: 'day', days: 3 },
  week: { label: 'This Week', telemetryRange: 'week', days: 7 },
  month: { label: 'This Month', telemetryRange: 'month', days: 30 },
};

interface AggregateConsumptionSectionProps {
  timeRange?: TimeRange;
  deviceIds?: string[];
  className?: string;
}

const AggregateConsumptionSection: React.FC<AggregateConsumptionSectionProps> = ({
  timeRange = 'day',
  deviceIds,
  className = '',
}) => {
  const config = timeRangeConfigs[timeRange] || timeRangeConfigs.day;
  const deviceId = deviceIds && deviceIds.length > 0 ? deviceIds[0] : undefined;
  
  const { data: telemetryData, isLoading, error } = useTelemetryData(
    config.telemetryRange, 
    { deviceId, realtime: false }
  );

  // Calculate total energy consumption in watt-hours
  const totalEnergyWh = React.useMemo(() => {
    if (!telemetryData || telemetryData.length === 0) return 0;
    
    // For multi-day ranges, we need to adjust the total based on the number of days
    const dailyTotal = telemetryData.reduce((sum, item) => sum + item.energyWatts, 0);
    
    // If we have a multi-day range, multiply by the number of days
    // This is a simplification - for more accuracy, we'd need to know the exact time range of the data
    return dailyTotal * config.days;
  }, [telemetryData, config.days]);
  
  // Convert to kWh with 2 decimal places and format as string
  const totalEnergyKwh = (totalEnergyWh / 1000).toFixed(2);
  
  // Use the animated counter
  const animatedValue = useAnimatedCounter(totalEnergyKwh, 1000);

  return (
    <div className={`bg-card rounded-lg border p-4 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium text-foreground">Total Energy Consumption</h3>
        <div className="p-2 rounded-full bg-primary/10">
          <Zap className="h-4 w-4 text-primary" />
        </div>
      </div>
      
      <div className="flex flex-col items-start">
        {isLoading ? (
          <Skeleton className="h-12 w-32" />
        ) : error ? (
          <div className="text-destructive text-sm">Error loading data</div>
        ) : (
          <>
            <div className="text-3xl font-bold text-foreground">
              {formatNumber(parseFloat(animatedValue), 2)}
              <span className="text-base text-muted-foreground ml-1">kWh</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {config.label}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AggregateConsumptionSection;
