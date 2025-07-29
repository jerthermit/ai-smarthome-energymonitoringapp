import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
  type ChartData,
} from 'chart.js';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '../../ui/skeleton';
import { chartConfig } from './chart-config';
import api from '../../../services/api';
import type { TimeRange } from '../../../types/dashboard';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type AggregatePoint = {
  timestamp: string;   // bucket start (UTC ISO)
  value: number;       // Wh in the bucket
  device_count: number;
};

interface DeviceEnergyChartProps {
  deviceId: string | 'all';
  timeRange: TimeRange; // 'day' | '3days' | 'week'
  deviceName?: string;
  height?: number | string;
  className?: string;
}

/* ---------------- Helpers ---------------- */
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
const toLocalDate = (iso: string) => new Date(iso);
const fmtHour = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });

// Determine cutoff and granularity (calendar-aligned for multi-day ranges)
function paramsForRange(range: TimeRange) {
  if (range === 'day') {
    return {
      time_range: 'day' as const,
      resolution_minutes: 60,
      cutoffMs: Date.now() - 24 * MS_HOUR,
      granularity: 'hour' as const,
    };
  }
  // Align multi-day to calendar days
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = range === '3days' ? 3 : 7;
  const cutoff = new Date(startOfToday);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return {
    time_range: 'week' as const,
    resolution_minutes: 1440,
    cutoffMs: cutoff.getTime(),
    granularity: 'day' as const,
  };
}

// Fetch aggregate series and filter by cutoff
async function fetchEnergySeries(deviceId: string | 'all', range: TimeRange) {
  const { time_range, resolution_minutes, cutoffMs, granularity } = paramsForRange(range);
  const params: Record<string, any> = { time_range, resolution_minutes };
  if (deviceId !== 'all') params.device_ids = deviceId;
  const { data } = await api.get<AggregatePoint[]>('/telemetry/aggregate', { params });
  const points = (data ?? []).filter(pt => toLocalDate(pt.timestamp).getTime() >= cutoffMs);
  return { points, granularity };
}

// Convert points to Chart.js data, aligning calendar days or sliding hours
function toChartData(
  pts: AggregatePoint[],
  granularity: 'hour' | 'day',
  _deviceName: string | undefined,
  timeRange: TimeRange
): ChartData<'line', number[], string> {
  const labels: string[] = [];
  const values: number[] = [];

  if (granularity === 'day') {
    // For multi-day, show exactly N calendar days ending today
    const days = timeRange === '3days' ? 3 : 7;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const label = fmtDay(d);
      labels.push(label);
      const match = pts.find(pt => fmtDay(toLocalDate(pt.timestamp)) === label);
      const value = match ? Number(((match.value ?? 0) / 1000).toFixed(2)) : 0;
      values.push(value);
    }
  } else {
    // Sliding hourly window since midnight
    const currentHour = new Date().getHours();
    for (let hr = 0; hr <= currentHour; hr++) {
      const d = new Date();
      d.setHours(hr, 0, 0, 0);
      const label = fmtHour(d);
      labels.push(label);
      const match = pts.find(pt => fmtHour(toLocalDate(pt.timestamp)) === label);
      const value = match ? Number(((match.value ?? 0) / 1000).toFixed(2)) : 0;
      values.push(value);
    }
  }

  const labelText = granularity === 'hour' ? 'Energy per hour (kWh)' : 'Energy per day (kWh)';
  return {
    labels,
    datasets: [
      {
        label: labelText,
        data: values,
        borderColor: chartConfig.colors.primary,
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'hsla(267, 100%, 58%, 0.10)';
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, 'hsla(267, 100%, 58%, 0.10)');
          gradient.addColorStop(1, 'hsla(267, 100%, 58%, 0.40)');
          return gradient;
        },
        borderWidth: 2,
        pointBackgroundColor: chartConfig.colors.background,
        pointBorderColor: chartConfig.colors.primary,
        pointHoverBackgroundColor: chartConfig.colors.primary,
        pointHoverBorderColor: chartConfig.colors.background,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHitRadius: 10,
        pointBorderWidth: 2,
        fill: true,
        tension: 0.3,
      },
    ],
  };
}

// Build Chart.js options (custom tooltip for ongoing)
function buildChartOptions(granularity: 'hour' | 'day'): ChartOptions<'line'> {
  const xTitle = granularity === 'hour' ? 'Hour' : 'Day';
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: chartConfig.colors.muted,
          font: { family: 'Inter, system-ui, sans-serif', size: 12 },
          padding: 20,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: chartConfig.colors.card,
        titleColor: chartConfig.colors.foreground,
        bodyColor: chartConfig.colors.muted,
        borderColor: chartConfig.colors.border,
        borderWidth: 1,
        padding: 12,
        usePointStyle: true,
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y;
            let label = ` ${val.toFixed(2)} kWh`;
            // For daily view, mark the last bar as ongoing
            if (granularity === 'day' && ctx.dataIndex === ctx.dataset.data.length - 1) {
              label += ' (ongoing)';
            }
            return label;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: chartConfig.colors.border },
        ticks: { color: chartConfig.colors.muted },
        title: { display: true, text: 'Energy (kWh)', color: chartConfig.colors.muted },
      },
      x: {
        grid: { color: chartConfig.colors.border, display: false },
        ticks: { color: chartConfig.colors.muted, maxRotation: 45, minRotation: 45 },
        title: { display: true, text: xTitle, color: chartConfig.colors.muted },
      },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    animation: { duration: 300 },
  };
}

// Main component
const DeviceEnergyChart: React.FC<DeviceEnergyChartProps> = ({
  deviceId,
  timeRange,
  deviceName = deviceId === 'all' ? 'All Devices' : 'Selected Device',
  height = 300,
  className = '',
}) => {
  if (import.meta.env.DEV) console.debug('[DeviceEnergyChart] mounted v2 — deviceId:', deviceId, 'timeRange:', timeRange);

  const query = useQuery<{ points: AggregatePoint[]; granularity: 'hour' | 'day' }, Error>({
    queryKey: ['deviceEnergyAggregate', deviceId, timeRange],
    queryFn: () => fetchEnergySeries(deviceId, timeRange),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const granularity: 'hour' | 'day' = query.data?.granularity ?? (timeRange === 'day' ? 'hour' : 'day');
  const points: AggregatePoint[] = query.data?.points ?? [];

  const chartData = useMemo(() => toChartData(points, granularity, deviceName, timeRange), [points, granularity, deviceName, timeRange]);
  const options = useMemo(() => buildChartOptions(granularity), [granularity]);

  if (query.isLoading) {
    return (
      <div className={`w-full h-full ${className}`} style={{ height }}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }
  if (query.error) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-destructive ${className}`} style={{ height }}>
        Error loading chart data
      </div>
    );
  }
  if (!points.length && granularity === 'hour') {
    return (
      <div className={`w-full h-full flex items-center justify-center text-muted-foreground ${className}`} style={{ height }}>
        No energy data available for this selection.
      </div>
    );
  }

  return (
    <div className={`w-full p-4 ${className}`} style={{ height }}>
      <Line data={chartData} options={options} className="w-full h-full" />
    </div>
  );
};

export default DeviceEnergyChart;