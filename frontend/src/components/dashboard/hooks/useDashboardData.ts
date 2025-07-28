// frontend/src/components/dashboard/hooks/useDashboardData.ts

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDevices, type Device as RawDevice } from '../../../services/deviceService';
import useAnalytics from '../../../hooks/useAnalytics';
import type { TimeRange } from '../../../types/dashboard';

type DeviceWithStatus = RawDevice & { status: 'online' };

export default function useDashboardData(timeRange: TimeRange) {
  // Selected device (persisted here so all sections can read it)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');

  // Analytics (kWh totals + hourly) driven by the dashboard's timeRange
  const {
    data: analyticsData = { topDevices: [], hourlyData: [], totalKwh: 0 },
    isLoading: isLoadingAnalytics,
    error,
  } = useAnalytics(timeRange);

  // Devices list
  const {
    data: devices = [],
    isLoading: isLoadingDevices,
  } = useQuery<RawDevice[], Error, DeviceWithStatus[]>({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (rows) =>
      rows.map((d) => ({
        ...d,
        status: 'online', // prototype: treat all as online
      })),
  });

  // Top devices with friendly names
  const devicesWithNames = useMemo(
    () =>
      (analyticsData.topDevices ?? []).map((t) => ({
        ...t,
        name: devices.find((d) => d.id === t.deviceId)?.name || t.deviceId,
      })),
    [analyticsData.topDevices, devices]
  );

  // Selected device object (for display)
  const selectedDevice = useMemo(() => {
    if (selectedDeviceId === 'all') return { name: 'All Devices' };
    return devices.find((d) => d.id === selectedDeviceId) || { name: 'Unknown Device' };
  }, [selectedDeviceId, devices]);

  const isLoading = isLoadingAnalytics || isLoadingDevices;

  return {
    // selection
    selectedDeviceId,
    setSelectedDeviceId,
    selectedDevice,

    // data
    analyticsData,
    devices,
    devicesWithNames,

    // status
    isLoading,
    error,
  };
}