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
// Import types from the centralized dashboard types file
import type { TimeRange, AggregatePoint } from '../../../types/dashboard';

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

// Removed local AggregatePoint type definition:
// type AggregatePoint = {
//   timestamp: string;   // bucket start (UTC ISO)
//   value: number;       // Wh in the bucket
//   device_count: number;
// };

type Granularity = 'hour' | 'day';

interface DeviceEnergyChartProps {
  deviceId: string | 'all';
  timeRange: TimeRange; // 'day' | '3days' | 'week'
  deviceName?: string;
  height?: number | string;
  className?: string;
}

/* ---------------- Helpers ---------------- */
const MS_DAY = 86_400_000;

const getClientTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Singapore';

const toLocalDate = (iso: string) => new Date(iso);

const startOfLocalDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const localDayKeyFromISO = (iso: string) => localDayKey(toLocalDate(iso));

const fmtHour = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });

const fmtDay = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });

/* ---------------- Data fetching (canonical backend ranges) ---------------- */
async function fetchEnergySeries(
  deviceId: string | 'all',
  range: TimeRange
): Promise<{ points: AggregatePoint[]; granularity: Granularity }> {
  // Ask backend to apply the canonical windowing & timezone alignment.
  const tz = getClientTimeZone();
  const params: Record<string, string> = {
    range, // 'day' | '3days' | 'week'
    tz,
    ...(deviceId !== 'all' ? { device_ids: deviceId } : {}),
  };

  const { data } = await api.get<AggregatePoint[]>('/telemetry/aggregate', { params });
  const points = (data ?? []).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const granularity: Granularity = range === 'day' ? 'hour' : 'day';
  return { points, granularity };
}

/* ---------------- Transform to Chart.js ---------------- */
function toChartData(
  pts: AggregatePoint[],
  granularity: Granularity,
  _deviceName: string | undefined,
  timeRange: TimeRange
): ChartData<'line', number[], string> {
  const labels: string[] = [];
  const values: number[] = [];

  if (granularity === 'day') {
    // Render exact LAST N FULL DAYS ending yesterday (exclude today), filling missing days with 0s.
    const days = timeRange === '3days' ? 3 : 7;
    const byKey = new Map<string, AggregatePoint>();
    for (const p of pts) byKey.set(localDayKeyFromISO(p.timestamp), p);

    const today = startOfLocalDay();
    for (let i = days; i >= 1; i--) {
      const d = new Date(today.getTime() - i * MS_DAY);
      labels.push(fmtDay(d));
      const key = localDayKey(d);
      const valWh = byKey.get(key)?.value ?? 0;
      values.push(Number(((valWh / 1000) || 0).toFixed(2)));
    }
  } else {
    // Hourly for current day from midnight → now, fill missing hours with 0s.
    const start = startOfLocalDay();
    const now = new Date();
    const currentHour = now.getHours();

    const byHour = new Map<string, AggregatePoint>();
    for (const p of pts) byHour.set(fmtHour(toLocalDate(p.timestamp)), p);

    for (let hr = 0; hr <= currentHour; hr++) {
      const d = new Date(start);
      d.setHours(hr, 0, 0, 0);
      const lab = fmtHour(d);
      labels.push(lab);
      const valWh = byHour.get(lab)?.value ?? 0;
      values.push(Number(((valWh / 1000) || 0).toFixed(2)));
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
          const { chartArea, ctx } = context.chart;
          if (!chartArea) return 'hsla(267, 100%, 58%, 0.10)';
          const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          g.addColorStop(0, 'hsla(267, 100%, 58%, 0.10)');
          g.addColorStop(1, 'hsla(267, 100%, 58%, 0.40)');
          return g;
        },
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHitRadius: 10,
        pointBackgroundColor: chartConfig.colors.background,
        pointBorderColor: chartConfig.colors.primary,
        pointHoverBackgroundColor: chartConfig.colors.primary,
        pointHoverBorderColor: chartConfig.colors.background,
        pointBorderWidth: 2,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  };
}

/* ---------------- Chart options ---------------- */
function buildChartOptions(granularity: Granularity): ChartOptions<'line'> {
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

/* ---------------- Component ---------------- */
const DeviceEnergyChart: React.FC<DeviceEnergyChartProps> = ({
  deviceId,
  timeRange,
  deviceName = deviceId === 'all' ? 'All Devices' : 'Selected Device',
  height = 300,
  className = '',
}) => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[DeviceEnergyChart] mounted v8 — deviceId:', deviceId, 'timeRange:', timeRange);
  }

  const query = useQuery<{ points: AggregatePoint[]; granularity: Granularity }, Error>({
    queryKey: ['deviceEnergyAggregate', deviceId, timeRange, getClientTimeZone()],
    queryFn: () => fetchEnergySeries(deviceId, timeRange),
    refetchInterval: timeRange === 'day' ? 60_000 : 300_000, // today: 1m; multi-day: 5m
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const granularity: Granularity =
    query.data?.granularity ?? (timeRange === 'day' ? 'hour' : 'day');
  const points: AggregatePoint[] = query.data?.points ?? [];

  const chartData = useMemo(
    () => toChartData(points, granularity, deviceName, timeRange),
    [points, granularity, deviceName, timeRange]
  );
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