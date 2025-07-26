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

import type { TelemetryData } from '../../hooks/useEnergyData';

type TimeRange = 'day' | 'week' | 'month';

interface EnergyUsageChartProps {
  data: TelemetryData[];
  timeRange: TimeRange;
  isLoading: boolean;
  error: Error | null;
}

// Function to group data by time period and calculate average energy usage
const processChartData = (
  data: TelemetryData[], 
  timeRange: TimeRange
): ChartData<'line', number[], string> => {
  console.group('=== processChartData ===');
  console.log('Input data:', data);
  const dateBuckets: { [key: string]: { sum: number; count: number } } = {};
  const today = new Date();
  let daysToShow: number;
  let dateFormat: Intl.DateTimeFormatOptions;

  // Set up time range parameters
  switch (timeRange) {
    case 'day':
      daysToShow = 1;
      dateFormat = { hour: '2-digit', hour12: true };
      break;
    case 'week':
      daysToShow = 7;
      dateFormat = { weekday: 'short' };
      break;
    case 'month':
    default:
      daysToShow = 30;
      dateFormat = { day: 'numeric', month: 'short' };
  }

  // Initialize time periods
  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dateBuckets[dateStr] = { sum: 0, count: 0 };
  }
  
  // Process each data point
  data.forEach(item => {
    const date = new Date(item.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    if (dateBuckets[dateStr]) {
      dateBuckets[dateStr].sum += item.energyWatts / 1000; // Convert to kWh
      dateBuckets[dateStr].count++;
    }
  });
  
  // Calculate averages and format for chart
  const labels = Object.keys(dateBuckets).map(dateStr => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', dateFormat);
  });
  
  const chartData = Object.values(dateBuckets).map(period => (
    period.count > 0 ? parseFloat((period.sum / period.count).toFixed(2)) : 0
  ));
  
  const result = {
    labels,
    datasets: [
      {
        label: 'Average Energy Usage (kWh)',
        data: chartData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.4,
      },
    ],
  };

  console.log('Processed chart data:', result);
  console.groupEnd();
  return result;
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
        label: function(context) {
          return `${context.dataset.label}: ${context.parsed.y} kWh`;
        }
      }
    }
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'kWh'
      },
      beginAtZero: true
    }
  }
};

export const EnergyUsageChart = ({
  data,
  timeRange,
  isLoading,
  error
}: EnergyUsageChartProps) => {
  console.group('=== EnergyUsageChart Props ===');
  console.log('Props:', { data, timeRange, isLoading, error });
  
  const chartData = processChartData(data, timeRange);
  
  React.useEffect(() => {
    console.log('Chart data updated:', chartData);
    return () => {
      console.groupEnd();
    };
  }, [chartData]);

  if (isLoading) {
    console.log('Rendering loading state');
    return (
      <div className="flex items-center justify-center h-80">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    console.error('Error in EnergyUsageChart:', error);
    return (
      <div className="text-red-500 text-center p-4">
        Error loading energy data. Please try again later.
      </div>
    );
  }

  return <Line data={chartData} options={chartOptions} />;
};

export default EnergyUsageChart;
