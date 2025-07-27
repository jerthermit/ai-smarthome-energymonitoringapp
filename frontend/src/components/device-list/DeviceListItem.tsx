// frontend/src/components/device-list/DeviceListItem.tsx

import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

interface Device {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
  current_power?: number;
  updated_at: string;
}

interface DeviceListItemProps {
  device: Device;
  onToggle: () => void;
  icon: React.ReactNode;
  formatPower: (watts?: number) => string;
}

const DeviceListItem: React.FC<DeviceListItemProps> = ({
  device,
  onToggle,
  icon,
  formatPower,
}) => {
  const lastUpdated = new Date(device.updated_at);

  return (
    <li className="hover:bg-gray-50">
      <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center space-x-4 min-w-0">
          <div className="flex-shrink-0">{icon}</div>
          <div className="ml-4 min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-600 truncate">
              {device.name}
            </p>
            <p className="text-sm text-gray-500 truncate">
              Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="ml-4 flex-shrink-0 flex items-center space-x-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
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
          <p className="text-sm font-medium text-gray-900">
            {formatPower(device.current_power)}
          </p>
          <Link
            to={`/devices/${device.id}`}
            className="text-blue-600 hover:text-blue-800"
            title="View details"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        </div>
      </div>
    </li>
  );
};

export default DeviceListItem;