// frontend/src/components/dashboard/sections/DeviceEnergySection.tsx

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { Clock } from 'lucide-react';
import DeviceEnergyChart from '../../../components/charts/DeviceEnergyChart';

interface Device {
  id: string;
  name: string;
}

interface DeviceEnergySectionProps {
  devices: Device[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  timeRange: 'day' | 'week' | 'month';
  selectedDeviceName: string;
}

const DeviceEnergySection: React.FC<DeviceEnergySectionProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  timeRange,
  selectedDeviceName,
}) => (
  <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
    <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-col space-y-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <CardTitle className="text-base sm:text-lg">Device Energy Usage</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {selectedDeviceId === 'all'
                ? 'Combined energy usage across all devices'
                : `Detailed view for ${selectedDeviceName}`}
            </CardDescription>
          </div>
        </div>
        <div className="w-full sm:w-64">
          <select
            className="w-full rounded-md border bg-background px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            value={selectedDeviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
          >
            <option value="all">All Devices</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </CardHeader>
    <CardContent className="flex-1 min-h-[280px] sm:min-h-[320px] px-4 pb-4 sm:px-6 sm:pb-6">
      <DeviceEnergyChart
        deviceId={selectedDeviceId}
        timeRange={timeRange}
        deviceName={selectedDeviceName}
      />
    </CardContent>
  </Card>
);

export default DeviceEnergySection;