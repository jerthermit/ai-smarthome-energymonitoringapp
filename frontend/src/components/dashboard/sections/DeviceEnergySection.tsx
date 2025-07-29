// frontend/src/components/dashboard/sections/DeviceEnergySection.tsx

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { Clock } from 'lucide-react';
import DeviceEnergyChart from '../charts/DeviceEnergyChart';
import type { TimeRange } from '../../../types/dashboard';

interface Device {
  id: string;
  name: string;
  type: string;
  current_power?: number | null;
}

interface DeviceEnergySectionProps {
  devices: Device[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  timeRange: TimeRange;
  selectedDeviceName: string;
  showDeviceList?: boolean;
  isLoading?: boolean;
}

const rangeLabel = (r: TimeRange) => (r === 'day' ? 'Today' : r === '3days' ? 'Last 3 Days' : 'Last 7 Days');

const DeviceEnergySection: React.FC<DeviceEnergySectionProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  timeRange,
  selectedDeviceName,
}) => (
  <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
    <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center space-x-2">
        <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
          <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="text-left">
          <CardTitle className="text-base sm:text-lg text-left">Device Energy Usage</CardTitle>
          <CardDescription className="text-xs sm:text-sm text-left">
            {selectedDeviceId === 'all'
              ? `Combined energy usage across all devices — ${rangeLabel(timeRange)}`
              : `${selectedDeviceName} — ${rangeLabel(timeRange)}`}
          </CardDescription>
        </div>
      </div>
    </CardHeader>

    <CardContent className="flex-1">
      <div className="relative h-64">
        <DeviceEnergyChart
          deviceId={selectedDeviceId}
          timeRange={timeRange}
          deviceName={selectedDeviceName}
          height={300}
        />
      </div>
    </CardContent>
  </Card>
);

export default DeviceEnergySection;