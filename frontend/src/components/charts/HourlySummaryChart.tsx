import React from 'react';
import { Chart } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Skeleton } from '../ui/skeleton';
import { defaultChartOptions, defaultLineDataset, defaultBarDataset, chartConfig } from '../dashboard/charts/chart-config';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface HourlyDataPoint {
  hour: number;
  averageEnergy: number;
}

interface HourlySummaryChartProps {
  data: HourlyDataPoint[];
  isLoading: boolean;
  error: Error | null;
  currentHour?: number; // Current hour (0-23)
}

type ChartDatasetType = {
  type: 'bar' | 'line';
  label: string;
  data: number[];
  [key: string]: any;
};

type ChartDataType = Omit<ChartData<'bar' | 'line', number[], string>, 'datasets'> & {
  datasets: ChartDatasetType[];
};

const processHourlyData = (data: HourlyDataPoint[], currentHour: number): ChartDataType => {
  // Create array of hours from 0 up to current hour
  const hours = Array.from({ length: currentHour + 1 }, (_, i) => i);
  
  const processedData = hours.map(hour => {
    const dataPoint = data.find(d => d.hour === hour);
    return dataPoint ? dataPoint.averageEnergy : 0;
  });
  
  // Calculate average only for hours that have passed
  const validDataPoints = data.filter(d => d.hour <= currentHour);
  const average = validDataPoints.length > 0 
    ? validDataPoints.reduce((acc, curr) => acc + curr.averageEnergy, 0) / validDataPoints.length 
    : 0;

  const chartData: ChartDataType = {
    labels: hours.map(h => h.toString()),
    datasets: [
      {
        ...defaultBarDataset,
        type: 'bar',
        label: 'Energy Usage',
        data: processedData,
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
      },
      {
        ...defaultLineDataset,
        type: 'line',
        label: 'Average',
        data: Array(hours.length).fill(average),
        borderColor: chartConfig.colors.secondary,
        borderDash: [5, 5],
        backgroundColor: 'transparent',
        pointRadius: 0,
      },
    ],
  };

  return chartData;
};

// Format hour to 12-hour format with AM/PM
const formatHour = (hour: number): string => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
};

const chartOptions = (maxHour: number): ChartOptions<'bar' | 'line'> => ({
  ...defaultChartOptions,
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    ...defaultChartOptions.plugins,
    legend: {
      ...defaultChartOptions.plugins?.legend,
      position: 'top' as const,
      labels: {
        ...defaultChartOptions.plugins?.legend?.labels,
        color: chartConfig.colors.foreground,
      }
    },
    tooltip: {
      ...defaultChartOptions.plugins?.tooltip,
      callbacks: {
        ...defaultChartOptions.plugins?.tooltip?.callbacks,
        label: function(context: any) {
          return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} kWh`;
        },
        title: function(tooltipItems: any[]) {
          const hour = parseInt(tooltipItems[0].label);
          return formatHour(hour);
        }
      }
    } as any,
  },
  scales: {
    x: {
      min: 0,
      max: maxHour,
      ...(defaultChartOptions.scales?.x as any),
      title: {
        display: true,
        text: 'Time of Day',
        color: chartConfig.colors.muted,
        font: {
          size: 12
        }
      },
      ticks: {
        ...(defaultChartOptions.scales?.x as any)?.ticks,
        maxRotation: 45,
        minRotation: 45,
        callback: function(this: any, value: string | number) {
          const hour = typeof value === 'string' ? parseInt(value) : value;
          return formatHour(hour);
        }
      },
      grid: {
        display: false
      },
      border: {
        display: false
      }
    },
    y: {
      ...(defaultChartOptions.scales?.y as any),
      title: {
        display: true,
        text: 'Energy (kWh)',
        color: chartConfig.colors.muted,
        font: {
          size: 12
        }
      },
      ticks: {
        ...(defaultChartOptions.scales?.y as any)?.ticks,
        callback: function(this: any, value: string | number) {
          return `${value} kWh`;
        }
      }
    }
  },
});

const HourlySummaryChart: React.FC<HourlySummaryChartProps> = ({
  data = [],
  isLoading,
  error,
  currentHour = new Date().getHours(),
}) => {

  if (isLoading) {
    return <Skeleton className="h-full w-full" />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Error loading chart data
      </div>
    );
  }
  
  const options = chartOptions(currentHour);

  const chartData = processHourlyData(data, currentHour);

  return (
    <div className="w-full h-full">
      <Chart
        type="bar"
        data={chartData}
        options={options}
        className="h-full w-full"
      />
    </div>
  );
};

export default HourlySummaryChart;
