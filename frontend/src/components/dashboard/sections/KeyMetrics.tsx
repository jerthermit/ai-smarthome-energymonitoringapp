// frontend/src/components/dashboard/sections/KeyMetrics.tsx

import React, { useEffect, useState, useRef } from 'react';
import { StatCard } from '../../ui/stat-card';
import { cn } from '../../../utils';

interface Device {
  current_power?: number;
}

interface HourlyData {
  hour: number;
  averageEnergy?: number;
}

interface KeyMetricsProps {
  devices: Device[];
  hourlyData: HourlyData[];
  isLoading: boolean;
  showCurrentUsage?: boolean;
  showTotalToday?: boolean;
  className?: string;
}

// Animation function for counting up values
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
      
      // Ease out function
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

const KeyMetrics: React.FC<KeyMetricsProps> = ({
  devices,
  hourlyData,
  isLoading,
  showCurrentUsage = true,
  showTotalToday = true,
  className = '',
}) => {
  const [currentUsage, setCurrentUsage] = useState('0.00');
  const [totalToday, setTotalToday] = useState('0.00');
  
  // Use animated counters
  const animatedCurrentUsage = useAnimatedCounter(currentUsage, 1000);
  const animatedTotalToday = useAnimatedCounter(totalToday, 1000);

  // Update current usage
  useEffect(() => {
    if (isLoading) return;
    
    const newCurrentUsage = devices
      .reduce((sum, d) => sum + (d.current_power || 0), 0)
      .toFixed(2);
    
    if (newCurrentUsage !== currentUsage) {
      setCurrentUsage(newCurrentUsage);
    }
  }, [devices, isLoading]);

  // Calculate total usage for today up to current hour
  useEffect(() => {
    if (isLoading || hourlyData.length === 0) return;
    
    const now = new Date();
    const currentHour = now.getHours();
    
    // Filter data up to current hour and calculate total
    const todayData = hourlyData.filter(data => data.hour <= currentHour);
    const total = todayData.reduce((sum, h) => sum + (h.averageEnergy || 0), 0);
    
    // Add partial hour if needed
    const minutes = now.getMinutes();
    const partialHour = minutes / 60;
    const lastHourData = todayData[todayData.length - 1]?.averageEnergy || 0;
    const partialHourUsage = lastHourData * partialHour;
    
    const newTotalToday = (total + partialHourUsage).toFixed(2);
    if (newTotalToday !== totalToday) {
      setTotalToday(newTotalToday);
    }
  }, [hourlyData, isLoading]);

  // Don't render anything if both metrics are hidden
  if (!showCurrentUsage && !showTotalToday) {
    return null;
  }

  return (
    <section className={cn("mb-2 sm:mb-4", className)}>
      <div className="flex gap-2 sm:gap-3 w-full">
        {showCurrentUsage && (
          <div className="flex-1 min-w-0">
            <StatCard
              title="Current Usage"
              value={animatedCurrentUsage}
              unit="W"
              icon="bolt"
              description="Instant power usage"
              isLoading={isLoading}
              variant="bordered"
              iconVariant="solid"
              className="h-full transition-all duration-200 hover:shadow-sm"
            />
          </div>
        )}
        {showTotalToday && (
          <div className="flex-1 min-w-0">
            <StatCard
              title="Total Today"
              value={animatedTotalToday}
              unit="kWh"
              icon="bolt"
              description="Energy consumed"
              isLoading={isLoading}
              variant="bordered"
              iconVariant="solid"
              className="h-full transition-all duration-200 hover:shadow-sm"
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default KeyMetrics;