import React from 'react';
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
import type { ChartData, ChartOptions } from 'chart.js';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Skeleton } from '../ui/skeleton';
import { chartConfig } from '../dashboard/charts/chart-config';

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

export type TimeRange = 'day' | 'week' | 'month';

export interface DeviceTelemetryData {
  timestamp: string;
  energyWatts: number;
  deviceId: string;
}

interface DeviceEnergyChartProps {
  deviceId: string | 'all';
  timeRange: TimeRange;
  deviceName?: string;
  height?: number | string;
}

const fetchDeviceTelemetry = async (deviceId: string, timeRange: TimeRange): Promise<DeviceTelemetryData[]> => {
  const endDate = new Date();
  const startDate = new Date();
  
  switch (timeRange) {
    case 'day':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  const response = await axios.get('/api/v1/telemetry', {
    params: {
      device_id: deviceId === 'all' ? undefined : deviceId,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      limit: 1000,
    },
  });

  return response.data;
};

const processChartData = (
  data: DeviceTelemetryData[], 
  timeRange: TimeRange,
  deviceName: string = 'All Devices'
): ChartData<'line', number[], string> => {
  // Group data by hour or day based on time range
  const isDaily = timeRange === 'day';
  const buckets: { [key: string]: { sum: number; count: number } } = {};
  
  data.forEach(item => {
    const date = new Date(item.timestamp);
    const key = isDaily 
      ? `${date.getHours()}:00` 
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    if (!buckets[key]) {
      buckets[key] = { sum: 0, count: 0 };
    }
    
    buckets[key].sum += item.energyWatts;
    buckets[key].count++;
  });

  // Convert to chart data format
  const labels = Object.keys(buckets).sort();
  const values = labels.map(key => 
    parseFloat((buckets[key].sum / (buckets[key].count * 1000)).toFixed(2)) // Convert to kWh
  );

  return {
    labels,
    datasets: [
      {
        label: `${deviceName} Energy Usage (kWh)`,
        data: values,
        borderColor: chartConfig.colors.primary,
        backgroundColor: (context: any) => {
          const { chart } = context;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'hsla(267, 100%, 58%, 0.1)';
          
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, 'hsla(267, 100%, 58%, 0.1)');
          gradient.addColorStop(1, 'hsla(267, 100%, 58%, 0.4)');
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
};

const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: chartConfig.colors.muted,
        font: {
          family: 'Inter, system-ui, sans-serif',
          size: 12,
        },
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
        label: (context) => {
          return `${context.dataset.label}: ${context.parsed.y} kWh`;
        }
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: chartConfig.colors.border,
      },
      ticks: {
        color: chartConfig.colors.muted,
      },
      title: {
        display: true,
        text: 'Energy (kWh)',
        color: chartConfig.colors.muted,
      },
    },
    x: {
      grid: {
        color: chartConfig.colors.border,
      },
      ticks: {
        color: chartConfig.colors.muted,
      },
      title: {
        display: true,
        text: 'Time',
        color: chartConfig.colors.muted,
      },
    },
  },
};

const DeviceEnergyChart: React.FC<DeviceEnergyChartProps> = ({ 
  deviceId, 
  timeRange,
  deviceName = 'All Devices',
  height = 300
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['deviceEnergy', deviceId, timeRange],
    queryFn: () => fetchDeviceTelemetry(deviceId, timeRange),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-destructive">
        Error loading chart data
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center p-4 text-muted-foreground">
        No energy data available for this device and time range.
      </div>
    );
  }

  const chartData = processChartData(data, timeRange, deviceName);

  return (
    <div className="w-full h-[400px] p-4">
      <Line data={chartData} options={chartOptions} />
    </div>
  );
};

export default DeviceEnergyChart;
