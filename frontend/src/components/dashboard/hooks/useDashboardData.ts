// frontend/src/components/dashboard/hooks/useDashboardData.ts

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDevices, type Device as RawDevice } from '../../../services/deviceService';
import useAnalytics from '../../../hooks/useAnalytics';

type DashboardTimeRange = 'day' | '3days' | 'week';
type DeviceChartTimeRange = 'day' | 'week' | 'month';
type DeviceWithStatus = RawDevice & { status: 'online' };

const mapToDeviceChartRange = (
  range: DashboardTimeRange
): DeviceChartTimeRange => (range === '3days' ? 'week' : range);

export default function useDashboardData() {
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>('week');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');

  const chartTimeRange = useCallback(
    (): DeviceChartTimeRange => mapToDeviceChartRange(timeRange),
    [timeRange]
  );

  const {
    data: analyticsData = { topDevices: [], hourlyData: [] },
    isLoading: isLoadingAnalytics,
    error,
  } = useAnalytics(timeRange === 'day' ? 'day' : 'week');

  const {
    data: devicesData = [],
    isLoading: isLoadingDevices,
  } = useQuery<RawDevice[], Error, DeviceWithStatus[]>({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) =>
      data.map((device) => ({
        ...device,
        status: 'online', // force online for prototype
      })),
  });

  const devices = devicesData;
  const isLoading = isLoadingAnalytics || isLoadingDevices;

  const devicesWithNames = useMemo(
    () =>
      analyticsData.topDevices.map((device) => ({
        ...device,
        name:
          devices.find((d) => d.id === device.deviceId)?.name ||
          device.deviceId,
      })),
    [analyticsData.topDevices, devices]
  );

  const selectedDevice = useMemo(() => {
    if (selectedDeviceId === 'all') {
      return { name: 'All Devices' };
    }
    return (
      devices.find((d) => d.id === selectedDeviceId) || {
        name: 'Unknown Device',
      }
    );
  }, [selectedDeviceId, devices]);

  return {
    timeRange,
    setTimeRange,
    selectedDeviceId,
    setSelectedDeviceId,
    chartTimeRange,
    analyticsData,
    devices,
    devicesWithNames,
    selectedDevice,
    isLoading,
    error,
  };
}