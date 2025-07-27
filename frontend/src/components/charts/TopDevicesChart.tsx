import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, type ChartOptions } from 'chart.js';
import { 
  defaultBarDataset,
  ChartLoading, 
  ChartError, 
  ChartEmpty,
  type ChartComponentProps
} from './chart-config';

// Register only the necessary ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface TopDevicesChartProps extends Omit<ChartComponentProps, 'children'> {
  data: Array<{ deviceId: string; totalEnergy: number; name?: string }>;
  isLoading: boolean;
  error: Error | null;
  maxItems?: number;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

const TopDevicesChart: React.FC<TopDevicesChartProps> = (props) => {
  const {
    data = [],
    isLoading = false,
    error = null,
    maxItems = 5,
    title = 'Top Energy Consuming Devices',
    className = '',
    style = {},
  } = props;
  // Handle loading and error states


  if (isLoading) return <ChartLoading className={className} style={style} />;
  if (error) return <ChartError error={error} className={className} style={style} />;
  if (!data || !data.length) return <ChartEmpty message="No device data available" className={className} style={style} />;

  // Sort and limit the number of devices shown
  const sortedData = [...data]
    .sort((a, b) => b.totalEnergy - a.totalEnergy)
    .slice(0, maxItems);

  const chartData = {
    labels: sortedData.map(item => item.name || `Device ${item.deviceId.slice(0, 6)}`),
    datasets: [
      {
        ...defaultBarDataset,
        label: 'Energy Consumption (kWh)',
        data: sortedData.map(item => Number(item.totalEnergy.toFixed(2))),
      },
    ],
  };

  // Create a new options object with proper typing
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            family: 'var(--font-sans)',
            size: 12,
          },
          padding: 20,
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: title,
        font: {
          size: 16,
          weight: 500,
        },
        padding: { bottom: 16 },
      },
      tooltip: {
        backgroundColor: 'hsl(var(--popover))',
        titleColor: 'hsl(var(--foreground))',
        bodyColor: 'hsl(var(--muted-foreground))',
        borderColor: 'hsl(var(--border))',
        borderWidth: 1,
        padding: 12,
        usePointStyle: true,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value} kWh`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'hsl(var(--border))',
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          callback: (value) => `${value} kWh` as string,
        },
      },
    },
  };

  return (
    <div className={`h-[400px] w-full ${className}`} style={style}>
      <Bar 
        options={options} 
        data={chartData} 
        fallbackContent={<div>Loading chart data...</div>}
      />
    </div>
  );
};

export default TopDevicesChart;
