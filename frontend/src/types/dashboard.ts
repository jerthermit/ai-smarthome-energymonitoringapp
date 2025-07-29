// frontend/src/types/dashboard.ts

// Shared types for the dashboard

export type TimeRange = 'day' | '3days' | 'week';

// Type guard to check if a string is a valid TimeRange
export const isTimeRange = (value: string): value is TimeRange => {
  return ['day', '3days', 'week'].includes(value);
};

export interface DashboardTimeRangeOption {
  value: TimeRange;
  label: string;
  telemetryRange: 'day' | 'week' | 'month'; // 'month' is not currently used but kept for potential future expansion
  days: number;
}

export const TIME_RANGE_OPTIONS: DashboardTimeRangeOption[] = [
  { value: 'day', label: 'Today', telemetryRange: 'day', days: 1 },
  { value: '3days', label: '3 Days', telemetryRange: 'week', days: 3 },
  { value: 'week', label: '7 Days', telemetryRange: 'week', days: 7 },
];

/**
 * Represents a single point of aggregated energy data over a time bucket.
 * Used for both daily and hourly time series.
 */
export type AggregatePoint = {
  timestamp: string;   // ISO8601 UTC string (bucket start)
  value: number;       // Energy value (e.g., Wh in the bucket)
  device_count?: number; // Optional: count of devices contributing to this aggregate
};

/**
 * Represents hourly energy consumption data, typically for charting daily patterns.
 * Energy is usually in kWh.
 */
export type HourlyPoint = {
  hour: number;        // Local hour (0-23)
  averageEnergy: number; // Energy value (e.g., kWh for that hour)
};

/**
 * Represents a top energy-consuming device with its total energy usage.
 * Energy is usually in kWh.
 */
export type TopDevice = {
  deviceId: string;
  totalEnergy: number; // Total energy in kWh over a period
  name?: string;       // Friendly name of the device, if available
};