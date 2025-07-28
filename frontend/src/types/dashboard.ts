// Shared types for the dashboard

export type TimeRange = 'day' | '3days' | 'week';

// Type guard to check if a string is a valid TimeRange
export const isTimeRange = (value: string): value is TimeRange => {
  return ['day', '3days', 'week'].includes(value);
};

export interface DashboardTimeRangeOption {
  value: TimeRange;
  label: string;
  telemetryRange: 'day' | 'week' | 'month';
  days: number;
}

export const TIME_RANGE_OPTIONS: DashboardTimeRangeOption[] = [
  { value: 'day', label: 'Today', telemetryRange: 'day', days: 1 },
  { value: '3days', label: '3 Days', telemetryRange: 'week', days: 3 },
  { value: 'week', label: '7 Days', telemetryRange: 'week', days: 7 },
];
