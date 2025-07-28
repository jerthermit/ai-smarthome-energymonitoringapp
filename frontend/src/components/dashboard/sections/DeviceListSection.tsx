// frontend/src/components/dashboard/sections/DeviceListSection.tsx

import React, { type SVGProps, type ComponentType } from 'react';
import {
  Plug,
  Lightbulb,
  Monitor,
  Tv,
  Fan,
  Flame,
  Droplets,
  Thermometer,
  Cpu,
} from 'lucide-react';

interface Device {
  id: string;
  name: string;
  type: string;
  current_power?: number | null;
}

interface DeviceListSectionProps {
  devices: Device[];
  selectedDeviceId: string;
  onSelectDevice: (id: string) => void;
  isLoading: boolean;
}

// Generic icon component type for lucide icons
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Map device name/type to a themed lucide icon
function pickIcon(name: string, type: string): IconComponent {
  const s = `${name} ${type}`.toLowerCase();

  if (s.includes('heater')) return Flame;                            // water/space heater
  if (s.includes('water') || s.includes('pump')) return Droplets;
  if (s.includes('ac') || s.includes('aircon') || s.includes('air con')) return Fan;
  if (s.includes('fridge') || s.includes('freez')) return Thermometer; // cold appliance
  if (s.includes('light') || s.includes('lamp')) return Lightbulb;
  if (s.includes('pc') || s.includes('computer') || s.includes('server')) return Monitor;
  if (s.includes('tv') || s.includes('television')) return Tv;
  if (s.includes('cpu') || s.includes('gpu')) return Cpu;

  return Plug; // default
}

const DeviceListSection: React.FC<DeviceListSectionProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  isLoading,
}) => {
  // One-line, horizontally scrollable strip.
  // Centered relative to the card when content is <= width; scrolls when wider.
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-full flex flex-nowrap justify-center gap-2 py-1">
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <div
                key={`s-${i}`}
                className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-border bg-muted/40 animate-pulse"
              />
            ))
          : devices.map((device) => {
              const isSelected = selectedDeviceId === device.id;
              const hasPower =
                typeof device.current_power === 'number' && isFinite(device.current_power as number);
              const Icon = pickIcon(device.name, device.type);

              // Safe native tooltip text
              const parts = [device.name, device.type];
              if (hasPower) parts.push(`${(device.current_power as number).toFixed(2)} W`);
              const hoverTitle = parts.filter(Boolean).join(' • ');

              return (
                <div
                  key={device.id}
                  role="option"
                  aria-selected={isSelected}
                  title={hoverTitle}
                  className={[
                    'group relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl border transition-all',
                    'bg-card hover:bg-accent/40',
                    isSelected ? 'ring-2 ring-primary bg-accent/30 border-primary' : 'border-border',
                    'focus-within:ring-2 focus-within:ring-ring',
                    'cursor-pointer',
                  ].join(' ')}
                  onClick={() => onSelectDevice(device.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectDevice(device.id);
                    }
                  }}
                >
                  {/* PERFECT center: absolute fill + flex center */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary/10">
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-primary" aria-hidden="true" />
                    </div>
                  </div>

                  {/* Status dot (top-right) */}
                  <span
                    className="absolute top-1.5 right-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />

                  {/* Hover overlay: device name */}
                  <span
                    className={[
                      'pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-1',
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                      'rounded-md border border-border bg-card/90 backdrop-blur-sm',
                      'text-[10px] font-medium text-foreground px-2 py-0.5',
                      'text-center shadow-sm max-w-[7rem] truncate',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {device.name}
                  </span>

                  {/* Subtle corner accent for selection/hover */}
                  <span
                    className={[
                      'pointer-events-none absolute -top-px -right-px h-3 w-3 rounded-bl-lg',
                      isSelected ? 'bg-primary/60' : 'bg-transparent group-hover:bg-primary/30',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                </div>
              );
            })}
      </div>
    </div>
  );
};

export default DeviceListSection;