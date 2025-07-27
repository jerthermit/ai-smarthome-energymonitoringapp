// frontend/src/components/dashboard/sections/DeviceListSection.tsx

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';

interface Device {
  id: string;
  name: string;
  type: string;
  current_power?: number;
}

interface DeviceListSectionProps {
  devices: Device[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  isLoading: boolean;
}

const DeviceListSection: React.FC<DeviceListSectionProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  isLoading,
}) => (
  <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Connected Devices</CardTitle>
          <CardDescription>All devices are online in this prototype</CardDescription>
        </div>
        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success-foreground">
          {devices.length} Devices
        </div>
      </div>
    </CardHeader>
    <CardContent>
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
              className={`flex items-center justify-between p-3 border rounded-lg transition-all cursor-pointer hover:bg-accent/50 ${
                selectedDeviceId === device.id ? 'ring-2 ring-primary bg-accent/20' : 'hover:border-border'
              }`}
              onClick={() => onSelectDevice(device.id)}
            >
              <div className="flex items-center space-x-3">
                <div className="h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
                <div>
                  <p className="font-medium text-sm text-foreground">{device.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{device.type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium text-sm text-foreground">
                  {device.current_power?.toFixed(2) || '0.00'}{' '}
                  <span className="text-xs text-muted-foreground">W</span>
                </p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success-foreground">
                  Online
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No devices found. Add a device to get started.</p>
        </div>
      )}
    </CardContent>
  </Card>
);

export default DeviceListSection;