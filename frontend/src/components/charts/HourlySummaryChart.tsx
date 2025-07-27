import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '../ui/skeleton';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface HourlyData {
  hour: string;
  energy: number;
  average: number;
}

const fetchHourlyData = async (): Promise<HourlyData[]> => {
  // This would be replaced with actual API call
  const response = await fetch('/api/telemetry/hourly');
  if (!response.ok) {
    throw new Error('Failed to fetch hourly data');
  }
  return response.json();
};

const processHourlyData = (data: HourlyData[]): ChartData<'bar', number[], string> => {
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  
  return {
    labels: hours,
    datasets: [
      {
        label: "Today's Usage (kWh)",
        data: hours.map(hour => {
          const dataPoint = data.find(d => d.hour === hour);
          return dataPoint ? dataPoint.energy : 0;
        }),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
      {
        label: 'Daily Average (kWh)',
        data: hours.map(hour => {
          const dataPoint = data.find(d => d.hour === hour);
          return dataPoint ? dataPoint.average : 0;
        }),
        type: 'line' as const,
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2,
        borderDash: [5, 5],
        backgroundColor: 'transparent',
        pointBackgroundColor: 'transparent',
        pointBorderColor: 'transparent',
      },
    ],
  };
};

const chartOptions: ChartOptions<'bar'> = {
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
        text: 'Hour of Day',
      },
      ticks: {
        maxRotation: 45,
        minRotation: 45,
      },
    },
  },
};

const HourlySummaryChart: React.FC = () => {
  const { data, isLoading, error } = useQuery<HourlyData[]>({
    queryKey: ['hourly'],
    queryFn: fetchHourlyData,
  });

  if (isLoading) {
    return <Skeleton className="w-full h-full" />;
  }

  if (error || !data) {
    return <div className="text-red-500">Error loading hourly data</div>;
  }

  const chartData = processHourlyData(data);

  return (
    <div className="w-full h-full">
      <Bar options={chartOptions} data={chartData} />
    </div>
  );
};

export default HourlySummaryChart;
