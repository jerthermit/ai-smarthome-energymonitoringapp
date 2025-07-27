import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
// Utility function to merge class names
const cn = (...classes: (string | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};

interface Device {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
  current_power?: number;
}

interface DeviceSelectorProps {
  devices: Device[];
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
  className?: string;
  disabled?: boolean;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  devices,
  selectedDeviceId,
  onSelect,
  className,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedDevice = selectedDeviceId === 'all' 
    ? { name: 'All Devices', status: 'online' as const }
    : devices.find(device => device.id === selectedDeviceId) || { name: 'Select a device', status: 'offline' as const };

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <Button
        variant="outline"
        className="w-full justify-between"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <div className="flex items-center">
          <div className={`h-2 w-2 rounded-full mr-2 ${
            selectedDevice.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
          }`} />
          <span className="truncate">{selectedDevice.name}</span>
        </div>
        <ChevronDown className={cn(
          "ml-2 h-4 w-4 transition-transform",
          isOpen ? "transform rotate-180" : ""
        )} />
      </Button>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-md bg-popover shadow-lg border">
          <div className="py-1 max-h-60 overflow-auto">
            <button
              key="all"
              className={cn(
                "w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center",
                selectedDeviceId === 'all' ? "bg-accent" : ""
              )}
              onClick={() => {
                onSelect('all');
                setIsOpen(false);
              }}
            >
              <div className="h-2 w-2 rounded-full bg-green-500 mr-2" />
              All Devices
            </button>
            
            {devices.map((device) => (
              <button
                key={device.id}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center",
                  selectedDeviceId === device.id ? "bg-accent" : ""
                )}
                onClick={() => {
                  onSelect(device.id);
                  setIsOpen(false);
                }}
              >
                <div className={`h-2 w-2 rounded-full mr-2 ${
                  device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span className="truncate">{device.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceSelector;
