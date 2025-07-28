// frontend/src/components/dashboard/charts/DeviceEnergyChart.tsx
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

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

function paramsForRange(range: TimeRange) {
  if (range === 'day') {
    return { time_range: 'day' as const, resolution_minutes: 60, cutoffMs: Date.now() - 24 * MS_HOUR, granularity: 'hour' as const };
  }
  if (range === '3days') {
    return { time_range: 'week' as const, resolution_minutes: 1440, cutoffMs: Date.now() - 3 * MS_DAY, granularity: 'day' as const };
  }
  return { time_range: 'week' as const, resolution_minutes: 1440, cutoffMs: Date.now() - 7 * MS_DAY, granularity: 'day' as const };
}

/** Integrated energy (Wh) from /telemetry/aggregate, filtered to horizon */
async function fetchEnergySeries(deviceId: string | 'all', range: TimeRange) {
  const { time_range, resolution_minutes, cutoffMs, granularity } = paramsForRange(range);
  const params: Record<string, any> = { time_range, resolution_minutes };
  if (deviceId !== 'all') params.device_ids = deviceId; // comma-separated accepted

  const { data } = await api.get<AggregatePoint[]>('/telemetry/aggregate', { params });
  const points = (data ?? []).filter((pt) => toLocalDate(pt.timestamp).getTime() >= cutoffMs);
  return { points, granularity };
}

function toChartData(
  pts: AggregatePoint[],
  granularity: 'hour' | 'day',
  deviceName?: string
): ChartData<'line', number[], string> {
  const labels = pts.map((p) => (granularity === 'hour' ? fmtHour(toLocalDate(p.timestamp)) : fmtDay(toLocalDate(p.timestamp))));
  const values = pts.map((p) => Number(((p.value ?? 0) / 1000).toFixed(2))); // Wh → kWh
  const label =
    granularity === 'hour'
      ? `Energy per hour (kWh)`
      : `Energy per day (kWh)`;

  return {
    labels,
    datasets: [
      {
        label,
        data: values,
        borderColor: chartConfig.colors.primary,
        backgroundColor: (context) => {
          const { chart } = context as any;
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
            return ` ${typeof val === 'number' ? val.toFixed(2) : val} kWh`;
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
    elements: {
      line: { tension: 0.4, borderWidth: 2 },
      point: { radius: 0, hitRadius: 10, hoverRadius: 5 },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    animation: { duration: 300 },
  };
}

const DeviceEnergyChart: React.FC<DeviceEnergyChartProps> = ({
  deviceId,
  timeRange,
  deviceName = deviceId === 'all' ? 'All Devices' : 'Selected Device',
  height = 300,
  className = '',
}) => {
  // Debug once to confirm this component version is loaded
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[DeviceEnergyChart] mounted v2 — deviceId:', deviceId, 'timeRange:', timeRange);
  }

  const query = useQuery<{ points: AggregatePoint[]; granularity: 'hour' | 'day' }, Error>({
    queryKey: ['deviceEnergyAggregate', deviceId, timeRange],
    queryFn: () => fetchEnergySeries(deviceId, timeRange),
    // Force a refetch so you immediately see the new behavior/labels
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const granularity: 'hour' | 'day' = query.data?.granularity ?? (timeRange === 'day' ? 'hour' : 'day');
  const points: AggregatePoint[] = query.data?.points ?? [];

  const chartData = useMemo(() => toChartData(points, granularity, deviceName), [points, granularity, deviceName]);
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

  if (!points.length) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-muted-foreground ${className}`} style={{ height }}>
        No energy data available for this selection.
      </div>
    );
  }

  return (
    <div className={`w-full p-4 ${className}`} style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default DeviceEnergyChart;