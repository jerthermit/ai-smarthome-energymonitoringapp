// frontend/src/components/dashboard/sections/AggregateConsumptionSection.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { Skeleton } from '../../ui/skeleton';
import type { TimeRange } from '../../../types/dashboard';
import useAnalytics from '../../../hooks/useAnalytics';
import api from '../../../services/api';

type EnergySummaryRow = { deviceId: string; energyKwh: number };

const useAnimatedCounter = (target: string, duration: number = 800) => {
  const [displayValue, setDisplayValue] = useState('0.00');
  const animationRef = useRef<number | null>(null);
  const startValue = useRef<number>(0);
  const startTime = useRef<number>(0);
  const targetValue = useRef<number>(0);

  useEffect(() => {
    const newTargetValue = parseFloat(target) || 0;
    if (newTargetValue === targetValue.current) return;

    startValue.current = parseFloat(displayValue) || 0;
    targetValue.current = newTargetValue;
    startTime.current = performance.now();

    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const animate = (currentTime: number) => {
      const elapsedTime = currentTime - startTime.current;
      const progress = Math.min(elapsedTime / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue.current + (targetValue.current - startValue.current) * easeOut;

      setDisplayValue(currentValue.toFixed(2));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(target);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [target, duration]);

  return displayValue;
};

const formatNumber = (num: number, decimals: number = 2): string =>
  num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });

const RANGE_LABEL: Record<TimeRange, string> = {
  day: 'Today',
  '3days': 'Last 3 Days',
  week: 'Last 7 Days',
};

function computeWindow(nowLocal = new Date(), range: TimeRange) {
  const end = new Date(nowLocal);
  const start = new Date(end);
  switch (range) {
    case 'day':
      start.setDate(end.getDate() - 1);
      break;
    case '3days':
      start.setDate(end.getDate() - 3);
      break;
    case 'week':
      start.setDate(end.getDate() - 7);
      break;
  }
  return { start, end };
}

/** Backend-integrated kWh for a specific device over [start,end). */
async function fetchSingleDeviceKwh(range: TimeRange, deviceId: string): Promise<number> {
  const { start, end } = computeWindow(new Date(), range);
  const params = {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    device_ids: deviceId, // backend accepts comma-separated; single is fine
  };
  const { data } = await api.get<EnergySummaryRow[]>('/telemetry/energy_summary', { params });
  const kwh = (data?.[0]?.energyKwh ?? 0);
  return Number(kwh.toFixed(2));
}

interface AggregateConsumptionSectionProps {
  timeRange?: TimeRange;      // 'day' | '3days' | 'week'
  deviceIds?: string[];       // optional single device filter
  className?: string;
}

const AggregateConsumptionSection: React.FC<AggregateConsumptionSectionProps> = ({
  timeRange = 'day',
  deviceIds,
  className = '',
}) => {
  const deviceId = deviceIds && deviceIds.length > 0 ? deviceIds[0] : undefined;

  // All-devices total via analytics (already accurate & integrated)
  const {
    data: analytics = { topDevices: [], hourlyData: [], totalKwh: 0 },
    isLoading: isAnalyticsLoading,
    error: analyticsError,
  } = useAnalytics(timeRange);

  // Single-device total via backend energy_summary
  const [singleDeviceKwh, setSingleDeviceKwh] = useState<number>(0);
  const [isSingleLoading, setIsSingleLoading] = useState<boolean>(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!deviceId) {
      setSingleDeviceKwh(0);
      setIsSingleLoading(false);
      setSingleError(null);
      return;
    }
    setIsSingleLoading(true);
    setSingleError(null);
    fetchSingleDeviceKwh(timeRange, deviceId)
      .then((kwh) => {
        if (!cancelled) setSingleDeviceKwh(kwh);
      })
      .catch((e) => {
        if (!cancelled) setSingleError(e?.message || 'Failed to load device energy');
      })
      .finally(() => {
        if (!cancelled) setIsSingleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, timeRange]);

  const isSingleDevice = Boolean(deviceId);

  const totalEnergyKwh: number = useMemo(() => {
    if (!isSingleDevice) return analytics?.totalKwh ?? 0;
    return singleDeviceKwh ?? 0;
  }, [isSingleDevice, analytics?.totalKwh, singleDeviceKwh]);

  const animatedValue = useAnimatedCounter(totalEnergyKwh.toFixed(2), 800);

  const isLoading = isSingleDevice ? isSingleLoading : isAnalyticsLoading;
  const error = isSingleDevice ? (singleError ? new Error(singleError) : null) : analyticsError;

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
              {RANGE_LABEL[timeRange]}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AggregateConsumptionSection;