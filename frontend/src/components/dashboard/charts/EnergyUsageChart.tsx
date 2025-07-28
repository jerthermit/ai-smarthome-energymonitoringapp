// frontend/src/components/dashboard/charts/EnergyUsageChart.tsx
import React, { useEffect, useState } from 'react';
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
} from 'chart.js';
import type { ChartData, ChartOptions, ScriptableContext } from 'chart.js';
import { chartConfig } from './chart-config';
import { useTelemetryData } from '../../../hooks/useTelemetryData';
import type { TelemetryData } from '../../../hooks/useTelemetryData';
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

interface EnergyUsageChartProps {
  deviceId?: string;
  timeRange: TimeRange; // 'day' | '3days' | 'week'
  height?: number | string;
  className?: string;
}

/** ----- Time helpers (LOCAL timezone) ----- */
const startOfHourLocal = (d: Date) => {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
};

const startOfDayLocal = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addHoursLocal = (d: Date, hours: number) => {
  const x = new Date(d);
  x.setHours(x.getHours() + hours);
  return x;
};

const addDaysLocal = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const fmtHourLabel = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });

const fmtDayShort = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const fmtWeekdayShort = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short' });

/**
 * Build local-time buckets and compute average power (kW) per bucket.
 * - day: 24 hourly buckets (last 24h)
 * - 3days: 3 daily buckets (today and previous 2 days)
 * - week: 7 daily buckets (today and previous 6 days)
 */
function processChartData(
  data: TelemetryData[],
  timeRange: TimeRange
): ChartData<'line', number[], string> {
  const now = new Date(); // local
  let bucketStarts: Date[] = [];
  let labels: string[] = [];

  if (timeRange === 'day') {
    const endHour = startOfHourLocal(now);
    const startHour = addHoursLocal(endHour, -23); // inclusive → 24 buckets
    for (let i = 0; i < 24; i++) {
      const h = addHoursLocal(startHour, i);
      bucketStarts.push(h);
      labels.push(fmtHourLabel(h));
    }
  } else if (timeRange === '3days') {
    const endDay = startOfDayLocal(now);
    const startDay = addDaysLocal(endDay, -2); // today + prev 2 days
    for (let i = 0; i < 3; i++) {
      const d = addDaysLocal(startDay, i);
      bucketStarts.push(d);
      labels.push(`${fmtWeekdayShort(d)} ${d.getDate()}`);
    }
  } else {
    // week
    const endDay = startOfDayLocal(now);
    const startDay = addDaysLocal(endDay, -6); // today + prev 6 days
    for (let i = 0; i < 7; i++) {
      const d = addDaysLocal(startDay, i);
      bucketStarts.push(d);
      labels.push(`${fmtWeekdayShort(d)} ${d.getDate()}`);
    }
  }

  // Prepare sum/count arrays
  const sums: number[] = Array(bucketStarts.length).fill(0);
  const counts: number[] = Array(bucketStarts.length).fill(0);

  // Given a timestamp (UTC string), find its local bucket index
  const getBucketIndex = (ts: string): number => {
    const t = new Date(ts); // parsed as UTC; JS handles local offsets in get*
    if (timeRange === 'day') {
      // Hourly buckets: index based on hour offset from start
      const start = bucketStarts[0];
      const diffMs = t.getTime() - start.getTime();
      return Math.floor(diffMs / (60 * 60 * 1000));
    } else {
      // Daily buckets: index based on day offset from start
      const start = bucketStarts[0];
      const tDay = startOfDayLocal(t);
      const diffMs = tDay.getTime() - start.getTime();
      return Math.floor(diffMs / (24 * 60 * 60 * 1000));
    }
  };

  // Aggregate instantaneous power readings into average power per bucket (kW)
  for (const item of data) {
    const idx = getBucketIndex(item.timestamp);
    if (idx < 0 || idx >= bucketStarts.length) continue;
    // Convert W → kW before averaging
    sums[idx] += item.energyWatts / 1000;
    counts[idx] += 1;
  }

  const series = sums.map((sum, i) => {
    const c = counts[i];
    return c > 0 ? parseFloat((sum / c).toFixed(3)) : 0;
  });

  const dataset = {
    label: 'Average Power (kW)',
    data: series,
    borderColor: chartConfig.colors.secondary,
    backgroundColor: (context: ScriptableContext<'line'>) => {
      const { chart } = context;
      const { ctx, chartArea } = chart;
      if (!chartArea) return 'hsla(267, 100%, 58%, 0.1)';
      const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
      gradient.addColorStop(0, 'hsla(267, 100%, 58%, 0.10)');
      gradient.addColorStop(1, 'hsla(267, 100%, 58%, 0.40)');
      return gradient;
    },
    borderWidth: 2,
    pointBackgroundColor: chartConfig.colors.background,
    pointBorderColor: chartConfig.colors.secondary,
    pointHoverBackgroundColor: chartConfig.colors.secondary,
    pointHoverBorderColor: chartConfig.colors.background,
    pointRadius: 0,
    pointHoverRadius: 6,
    pointHitRadius: 10,
    pointBorderWidth: 2,
    tension: 0.3,
    fill: true,
  };

  return { labels, datasets: [dataset] };
}

const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
    tooltip: {
      mode: 'index',
      intersect: false,
      callbacks: {
        label: (ctx) => {
          const v = ctx.parsed.y;
          return ` ${v?.toFixed?.(3) ?? v} kW`;
        },
      },
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Power (kW)' },
    },
  },
  elements: {
    line: { tension: 0.4, borderWidth: 2 },
    point: { radius: 0, hitRadius: 10, hoverRadius: 5 },
  },
  interaction: { mode: 'nearest', axis: 'x', intersect: false },
  animation: { duration: 300 },
};

// Connection status indicator component
const ConnectionStatus: React.FC<{ isConnected: boolean; lastUpdated: Date }> = ({
  isConnected,
  lastUpdated
}) => {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    if (!lastUpdated) return;

    const updateTimeAgo = () => {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 60) setTimeAgo('just now');
      else if (seconds < 3600) setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
      else setTimeAgo(`${Math.floor(seconds / 3600)}h ago`);
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 30000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div className="absolute right-2 top-2 flex items-center space-x-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md text-xs">
      <div className="flex items-center">
        <span className="mr-1 text-muted-foreground">Status:</span>
        <span
          className={`inline-block w-2 h-2 rounded-full mr-1 ${
            isConnected ? 'bg-green-500' : 'bg-yellow-500'
          }`}
        />
        <span className="font-medium">
          {isConnected ? 'Live' : 'Polling'}
        </span>
      </div>
      {lastUpdated && (
        <span className="text-muted-foreground text-xs">
          Updated {timeAgo}
        </span>
      )}
    </div>
  );
};

const EnergyUsageChart: React.FC<EnergyUsageChartProps> = ({
  deviceId,
  timeRange,
  height = 400,
  className = ''
}) => {
  const {
    data: telemetryData = [],
    isLoading,
    error,
    isUsingWebSocket = false,
    lastUpdated = new Date()
  } = useTelemetryData(timeRange, { deviceId, realtime: true });

  const chartData = processChartData(telemetryData, timeRange);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading energy data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-destructive">
          <p className="font-medium">Error loading energy data</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`} style={{ height }}>
      <ConnectionStatus isConnected={isUsingWebSocket} lastUpdated={lastUpdated} />
      <div className="h-full w-full">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default EnergyUsageChart;