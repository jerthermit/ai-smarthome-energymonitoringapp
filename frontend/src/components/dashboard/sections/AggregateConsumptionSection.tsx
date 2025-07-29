import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Zap, Layers } from 'lucide-react';
import { Skeleton } from '../../ui/skeleton';
import { Button } from '../../ui/button';
import DeviceListSection from './DeviceListSection';
import type { TimeRange } from '../../../types/dashboard';
import useAnalytics from '../../../hooks/useAnalytics';
import api from '../../../services/api';

type EnergySummaryRow = { deviceId: string; energyKwh: number };

interface Device {
  id: string;
  name: string;
  type: string;
  current_power?: number | null;
}

interface AggregateConsumptionSectionProps {
  timeRange?: TimeRange;      // 'day' | '3days' | 'week'
  deviceIds?: string[];       // optional single device filter
  className?: string;
  devices: Device[];          // list of devices for selection
  selectedDeviceId: string;   // current selected device
  onSelectDevice: (id: string) => void; // handler to select device
  showDeviceList?: boolean;   // whether to show device controls
  isLoading?: boolean;        // loading state for device list
}

const RANGE_LABEL: Record<TimeRange, string> = {
  day: 'Today',
  '3days': 'Last 3 Days',
  week: 'Last 7 Days',
};

const useAnimatedCounter = (target: string, duration: number = 800) => {
  const [displayValue, setDisplayValue] = useState('0.00');
  const animationRef = useRef<number | null>(null);
  const startValue = useRef<number>(0);
  const startTime = useRef<number>(0);
  const targetValue = useRef<number>(0);

  useEffect(() => {
    const newTarget = parseFloat(target) || 0;
    if (newTarget === targetValue.current) return;
    startValue.current = parseFloat(displayValue) || 0;
    targetValue.current = newTarget;
    startTime.current = performance.now();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const animate = (now: number) => {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startValue.current + (targetValue.current - startValue.current) * easeOut;
      setDisplayValue(current.toFixed(2));
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
  num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });

function computeWindow(nowLocal = new Date(), range: TimeRange) {
  const end = new Date(nowLocal);
  const start = new Date(end);
  switch (range) {
    case 'day': start.setDate(end.getDate() - 1); break;
    case '3days': start.setDate(end.getDate() - 3); break;
    case 'week': start.setDate(end.getDate() - 7); break;
  }
  return { start, end };
}

async function fetchSingleDeviceKwh(range: TimeRange, deviceId: string): Promise<number> {
  const { start, end } = computeWindow(new Date(), range);
  const params = { start_time: start.toISOString(), end_time: end.toISOString(), device_ids: deviceId };
  const { data } = await api.get<EnergySummaryRow[]>('/telemetry/energy_summary', { params });
  const kwh = data?.[0]?.energyKwh ?? 0;
  return Number(kwh.toFixed(2));
}

const AggregateConsumptionSection: React.FC<AggregateConsumptionSectionProps> = ({
  timeRange = 'day',
  deviceIds,
  className = '',
  devices,
  selectedDeviceId,
  onSelectDevice,
  showDeviceList = false,
  isLoading = false,
}) => {
  const deviceId = deviceIds && deviceIds.length > 0 ? deviceIds[0] : undefined;

  const {
    data: analytics = { topDevices: [], hourlyData: [], totalKwh: 0 },
    isLoading: isAnalyticsLoading,
    error: analyticsError,
  } = useAnalytics(timeRange);

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
      .then(kwh => !cancelled && setSingleDeviceKwh(kwh))
      .catch(e => !cancelled && setSingleError(e.message || 'Failed to load device energy'))
      .finally(() => !cancelled && setIsSingleLoading(false));
    return () => { cancelled = true; };
  }, [deviceId, timeRange]);

  const isSingleDevice = Boolean(deviceId);

  const totalEnergyKwh = useMemo(() => isSingleDevice ? singleDeviceKwh : analytics.totalKwh, [isSingleDevice, analytics.totalKwh, singleDeviceKwh]);
  const animatedValue = useAnimatedCounter(totalEnergyKwh.toFixed(2), 800);
  const loading = isSingleDevice ? isSingleLoading : isAnalyticsLoading;
  const error = isSingleDevice ? (singleError ? new Error(singleError) : null) : analyticsError;

  return (
    <div className={`bg-card rounded-lg border p-4 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium text-foreground">Total Energy Consumption</h3>
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-full bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          {showDeviceList && (
            <>
              <Button
                type="button"
                variant={selectedDeviceId === 'all' ? 'default' : 'outline'}
                onClick={() => onSelectDevice('all')}
                className="h-8 px-2 py-1 text-xs shadow-sm"
                aria-pressed={selectedDeviceId === 'all'}
                title="Show all devices"
              >
                <Layers className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">All Devices</span>
                <span className="sm:hidden">All</span>
              </Button>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success-foreground">
                {devices.length} Devices
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start">
        {loading ? (
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

      {showDeviceList && (
        <div className="mt-4">
          <DeviceListSection
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={onSelectDevice}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  );
};

export default AggregateConsumptionSection;
