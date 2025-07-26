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
  type ChartOptions,
} from 'chart.js';

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

interface HourlyDataPoint {
  hour: number;
  averageEnergy: number;
}

interface HourlyUsageChartProps {
  data: HourlyDataPoint[];
  isLoading: boolean;
  error: Error | null;
}

const HourlyUsageChart: React.FC<HourlyUsageChartProps> = ({
  data,
  isLoading,
  error,
}) => {
  if (isLoading) return <div>Loading hourly data...</div>;
  if (error) return <div>Error loading hourly data: {error.message}</div>;
  if (!data.length) return <div>No hourly data available</div>;

  // Sort data by hour
  const sortedData = [...data].sort((a, b) => a.hour - b.hour);

  const chartData = {
    labels: sortedData.map(item => {
      const hour = item.hour % 12 || 12;
      const ampm = item.hour < 12 ? 'AM' : 'PM';
      return `${hour} ${ampm}`;
    }),
    datasets: [
      {
        label: 'Average Energy Usage (kWh)',
        data: sortedData.map(item => item.averageEnergy),
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Average Hourly Energy Usage',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Average Energy (kWh)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Hour of Day',
        },
      },
    },
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default HourlyUsageChart;
