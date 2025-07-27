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
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
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
    },
    tooltip: {
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
      title: {
        display: true,
        text: 'Energy (kWh)',
      },
    },
    x: {
      title: {
        display: true,
        text: 'Time',
      },
    },
  },
};

const DeviceEnergyChart: React.FC<DeviceEnergyChartProps> = ({ 
  deviceId, 
  timeRange,
  deviceName = 'All Devices' 
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['deviceEnergy', deviceId, timeRange],
    queryFn: () => fetchDeviceTelemetry(deviceId, timeRange),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return <Skeleton className="w-full h-[400px]" />;
  }

  if (error) {
    return (
      <div className="text-center p-4 text-destructive">
        Error loading energy data: {error instanceof Error ? error.message : 'Unknown error'}
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
