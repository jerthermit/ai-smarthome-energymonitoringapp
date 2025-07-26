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
  type ChartOptions,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface TopDevicesChartProps {
  data: Array<{ deviceId: string; totalEnergy: number }>;
  isLoading: boolean;
  error: Error | null;
}

const TopDevicesChart: React.FC<TopDevicesChartProps> = ({
  data,
  isLoading,
  error,
}) => {
  if (isLoading) return <div>Loading top devices...</div>;
  if (error) return <div>Error loading top devices: {error.message}</div>;
  if (!data.length) return <div>No device data available</div>;

  const chartData = {
    labels: data.map(item => `Device ${item.deviceId.slice(0, 6)}`),
    datasets: [
      {
        label: 'Energy Consumption (kWh)',
        data: data.map(item => item.totalEnergy),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Top 3 Devices by Energy Consumption',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Total Energy (kWh)',
        },
      },
    },
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <Bar data={chartData} options={options} />
    </div>
  );
};

export default TopDevicesChart;
