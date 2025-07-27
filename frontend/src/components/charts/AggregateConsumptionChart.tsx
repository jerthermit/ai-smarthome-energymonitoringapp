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

export interface AggregateTelemetryData {
  timestamp: string;
  totalEnergy: number;
  deviceCount: number;
}

interface AggregateConsumptionChartProps {
  timeRange: 'day' | '3days' | 'week';
}

const fetchAggregateData = async (timeRange: 'day' | '3days' | 'week'): Promise<AggregateTelemetryData[]> => {
  // This would be replaced with actual API call
  const response = await fetch(`/api/telemetry/aggregate?range=${timeRange}`);
  if (!response.ok) {
    throw new Error('Failed to fetch aggregate data');
  }
  return response.json();
};

const processAggregateData = (data: AggregateTelemetryData[]): ChartData<'line', number[], string> => {
  return {
    labels: data.map(item => new Date(item.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Total Energy (kWh)',
        data: data.map(item => item.totalEnergy),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
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
          return ` ${context.parsed.y.toFixed(2)} kWh`;
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

const AggregateConsumptionChart: React.FC<AggregateConsumptionChartProps> = ({ timeRange }) => {
  const { data, isLoading, error } = useQuery<AggregateTelemetryData[]>({
    queryKey: ['aggregate', timeRange],
    queryFn: () => fetchAggregateData(timeRange),
  });

  if (isLoading) {
    return <Skeleton className="w-full h-full" />;
  }

  if (error || !data) {
    return <div className="text-red-500">Error loading chart data</div>;
  }

  const chartData = processAggregateData(data);

  return (
    <div className="w-full h-full">
      <Line options={chartOptions} data={chartData} />
    </div>
  );
};

export default AggregateConsumptionChart;
