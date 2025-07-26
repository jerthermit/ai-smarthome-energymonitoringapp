import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Device } from '../services/deviceService';
import { fetchDevices, updateDeviceStatus } from '../services/deviceService';
import { formatDistanceToNow } from 'date-fns';

// Map device types to display names and icons
const deviceTypeMap = {
  'air-conditioner': {
    name: 'Air Conditioner',
    icon: (
      <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    )
  },
  'refrigerator': {
    name: 'Refrigerator',
    icon: (
      <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )
  },
  'television': {
    name: 'Television',
    icon: (
      <svg className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )
  },
  'washing-machine': {
    name: 'Washing Machine',
    icon: (
      <svg className="h-6 w-6 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )
  },
  'dishwasher': {
    name: 'Dishwasher',
    icon: (
      <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )
  },
  'oven': {
    name: 'Oven',
    icon: (
      <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    )
  },
  'other': {
    name: 'Other Device',
    icon: (
      <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    )
  }
};

// Format power to human-readable format
const formatPower = (watts?: number): string => {
  if (watts === undefined || isNaN(watts)) return '0 W';
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${Math.round(watts)} W`;
};

const DeviceList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();
  
  // Fetch devices
  const { data: devices = [], isLoading, isError } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Toggle device status
  const { mutate: toggleDeviceStatus } = useMutation({
    mutationFn: async (device: Device) => {
      const newStatus = device.status === 'online' ? 'offline' : 'online';
      return updateDeviceStatus(device.id, newStatus);
    },
    onSuccess: () => {
      // Invalidate and refetch devices to update the UI
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  // Filter devices based on search term
  const filteredDevices = devices.filter((device) =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get device type info with fallback
  const getDeviceInfo = (type: string) => {
    return deviceTypeMap[type as keyof typeof deviceTypeMap] || deviceTypeMap.other;
  };

  // Loading and error states
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading devices</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>Failed to load device list. Please try again later.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <h1 className="text-2xl font-bold text-gray-900">My Devices</h1>
        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search devices..."
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <ul className="divide-y divide-gray-200">
          {filteredDevices.length > 0 ? (
            filteredDevices.map((device) => {
              const deviceInfo = getDeviceInfo(device.type);
              const lastUpdated = new Date(device.updated_at);
              
              return (
                <li key={device.id} className="hover:bg-gray-50">
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center min-w-0">
                        <div className="flex-shrink-0">
                          {deviceInfo.icon}
                        </div>
                        <div className="ml-4 min-w-0 flex-1">
                          <div className="flex items-center">
                            <p className="text-sm font-medium text-blue-600 truncate">
                              {device.name}
                            </p>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleDeviceStatus(device);
                              }}
                              className={`ml-2 relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                device.status === 'online' ? 'bg-blue-600' : 'bg-gray-200'
                              }`}
                              role="switch"
                              aria-checked={device.status === 'online'}
                            >
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  device.status === 'online' ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                          <p className="text-sm text-gray-500">
                            {deviceInfo.name} • Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0 flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {formatPower(device.current_power)}
                          </p>
                          <p className="text-xs text-gray-500">
                            Current
                          </p>
                        </div>
                        <Link 
                          to={`/devices/${device.id}`}
                          className="text-blue-600 hover:text-blue-800"
                          title="View details"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="px-4 py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {searchTerm ? 'No matching devices found' : 'No devices registered'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? 'Try a different search term.' : 'Get started by adding your first device.'}
              </p>
            </li>
          )}
        </ul>
      </div>

      <div className="flex justify-end">
        <Link
          to="/devices/add"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Device
        </Link>
      </div>
    </div>
  );
};

export default DeviceList;
