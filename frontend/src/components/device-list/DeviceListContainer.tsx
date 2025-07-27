// frontend/src/components/device-list/DeviceListContainer.tsx

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDevices, updateDeviceStatus, type Device } from '../../services/deviceService';
import SearchInput from './SearchInput';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';
import DeviceListItem from './DeviceListItem';

// Map device types to display names and icons
const deviceTypeMap: Record<string, { name: string; icon: React.ReactNode }> = {
  'air-conditioner': {
    name: 'Air Conditioner',
    icon: (
      <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
  },
  'refrigerator': {
    name: 'Refrigerator',
    icon: (
      <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  'television': {
    name: 'Television',
    icon: (
      <svg className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  'washing-machine': {
    name: 'Washing Machine',
    icon: (
      <svg className="h-6 w-6 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  'dishwasher': {
    name: 'Dishwasher',
    icon: (
      <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  'oven': {
    name: 'Oven',
    icon: (
      <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
  },
  other: {
    name: 'Other Device',
    icon: (
      <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
  },
};

// Format power to human-readable string
const formatPower = (watts?: number): string => {
  if (watts === undefined || isNaN(watts)) return '0 W';
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${Math.round(watts)} W`;
};

const DeviceListContainer: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const { data: devices = [], isLoading, isError } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    refetchInterval: 30000,
  });

  const toggleMutation = useMutation({
    mutationFn: (device: Device) => {
      const newStatus = device.status === 'online' ? 'offline' : 'online';
      return updateDeviceStatus(device.id, newStatus);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  const filteredDevices = useMemo(
    () =>
      devices.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.type.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [devices, searchTerm]
  );

  if (isLoading) return <LoadingState />;
  if (isError)   return <ErrorState />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">My Devices</h1>
        <SearchInput value={searchTerm} onChange={setSearchTerm} />
      </div>

      {filteredDevices.length === 0 ? (
        <EmptyState searchTerm={searchTerm} />
      ) : (
        <ul className="divide-y divide-gray-200 bg-white shadow sm:rounded-lg overflow-hidden">
          {filteredDevices.map(device => {
            const info = deviceTypeMap[device.type] || deviceTypeMap.other;
            return (
              <DeviceListItem
                key={device.id}
                device={device}
                onToggle={() => toggleMutation.mutate(device)}
                icon={info.icon}
                formatPower={formatPower}
              />
            );
          })}
        </ul>
      )}

      <div className="flex justify-end">
        <Link
          to="/devices/add"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Device
        </Link>
      </div>
    </div>
  );
};

export default DeviceListContainer;
