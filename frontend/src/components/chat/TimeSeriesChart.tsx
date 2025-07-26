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
} from 'chart.js';
import { format } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  unit: string;
}

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data }) => {
  const chartData = {
    labels: data.map(point => format(new Date(point.timestamp), 'MMM d')),
    datasets: [
      {
        label: `Energy Usage (${data[0]?.unit || ''})`,
        data: data.map(point => point.value),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
          borderDash: [3, 3],
        },
        beginAtZero: true,
      },
    }
  };

  return <Line options={options} data={chartData} />;
};
