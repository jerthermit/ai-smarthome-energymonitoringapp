// frontend/src/components/dashboard/sections/DeviceEnergySection.tsx

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Clock, Layers } from 'lucide-react';
import DeviceEnergyChart from '../charts/DeviceEnergyChart';
import DeviceListSection from './DeviceListSection';
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
  /** Align with dashboard tabs: 'day' | '3days' | 'week' */
  timeRange: TimeRange;
  selectedDeviceName: string;
  showDeviceList?: boolean;
  isLoading?: boolean;
}

const DeviceEnergySection: React.FC<DeviceEnergySectionProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  timeRange,
  selectedDeviceName,
  showDeviceList = false,
  isLoading = false,
}) => (
  <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
    <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center justify-between">
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
        {showDeviceList && (
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success-foreground">
            {devices.length} Devices
          </div>
        )}
      </div>
    </CardHeader>

    <CardContent className="flex-1 flex flex-col gap-6">
      {/* Chart + "Show All Devices" button */}
      <div className="relative h-64">
        <Button
          type="button"
          onClick={() => onSelectDevice('all')}
          variant={selectedDeviceId === 'all' ? 'default' : 'outline'}
          className="absolute right-2 -top-3 md:-top-4 z-10 h-8 px-2 py-1 text-xs shadow-sm"
          aria-pressed={selectedDeviceId === 'all'}
          aria-label="Show all devices on chart"
          title="Show all devices on chart"
        >
          <Layers className="h-3.5 w-3.5 mr-1.5" />
          <span className="hidden sm:inline">Show All Devices</span>
          <span className="sm:hidden">All</span>
        </Button>

        <DeviceEnergyChart
          deviceId={selectedDeviceId}
          timeRange={timeRange}
          deviceName={selectedDeviceName}
          height={300}
        />
      </div>

      {showDeviceList && (
        <div className="mt-2">
          <DeviceListSection
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={onSelectDevice}
            isLoading={isLoading}
          />
        </div>
      )}
    </CardContent>
  </Card>
);

export default DeviceEnergySection;