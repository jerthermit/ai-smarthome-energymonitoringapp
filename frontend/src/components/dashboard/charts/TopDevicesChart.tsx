import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, type ChartOptions } from 'chart.js';
import { 
  defaultBarDataset,
  ChartLoading, 
  ChartError, 
  ChartEmpty,
  type ChartComponentProps,
  chartConfig
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
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return chartConfig.colors.primary;
          
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, chartConfig.colors.primary.replace(')', ', 0.5)'));
          gradient.addColorStop(1, chartConfig.colors.primary.replace(')', ', 0.1)'));
          return gradient;
        },
        borderColor: chartConfig.colors.primary,
        borderWidth: 1,
        borderRadius: 4,
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
          color: chartConfig.colors.muted,
          font: {
            family: 'Inter, system-ui, sans-serif',
            size: 12,
          },
          padding: 20,
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: title,
        color: chartConfig.colors.foreground,
        font: {
          size: 16,
          weight: 500,
          family: 'Inter, system-ui, sans-serif',
        },
        padding: { bottom: 16 },
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
          color: chartConfig.colors.border,
        },
        ticks: {
          color: chartConfig.colors.muted,
          font: {
            family: 'Inter, system-ui, sans-serif',
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: chartConfig.colors.border,
        },
        ticks: {
          color: chartConfig.colors.muted,
          font: {
            family: 'Inter, system-ui, sans-serif',
          },
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
