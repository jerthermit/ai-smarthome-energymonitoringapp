// frontend/src/components/dashboard/sections/DeviceEnergySection.tsx

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { Clock } from 'lucide-react';
import DeviceEnergyChart from '../../../components/charts/DeviceEnergyChart';

interface Device {
  id: string;
  name: string;
  type: string;
  current_power?: number;
}

interface DeviceEnergySectionProps {
  devices: Device[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  timeRange: 'day' | 'week' | 'month';
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
      <div className="flex flex-col space-y-3">
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
    <CardContent className="flex-1 flex flex-col gap-6">
      <div className="h-64">
        <DeviceEnergyChart
          deviceId={selectedDeviceId}
          timeRange={timeRange}
          height={300}
        />
      </div>
      {showDeviceList && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-3">Connected Devices</h3>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : devices.length > 0 ? (
            <div className="space-y-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className={`flex items-center justify-between p-3 border rounded-lg transition-all cursor-pointer ${
                    selectedDeviceId === device.id ? 'bg-accent/50 border-primary' : 'hover:bg-accent/20'
                  }`}
                  onClick={() => onSelectDevice(device.id)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">{device.name}</h4>
                      <p className="text-xs text-muted-foreground">{device.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {device.current_power ? `${device.current_power.toFixed(2)} W` : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedDeviceId === device.id ? 'Selected' : 'Click to view'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No devices found
            </p>
          )}
        </div>
      )}
    </CardContent>
  </Card>
);

export default DeviceEnergySection;