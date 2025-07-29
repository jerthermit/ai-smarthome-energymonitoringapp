// frontend/src/components/dashboard/charts/HourlySummaryChart.tsx

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
import { Skeleton } from '../../ui/skeleton';
import { defaultChartOptions, defaultLineDataset, defaultBarDataset, chartConfig } from './chart-config';
import type { HourlyPoint } from '../../../types/dashboard'; // CHANGED: Import HourlyPoint from types/dashboard

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

interface HourlySummaryChartProps {
  data: HourlyPoint[]; // Use the imported HourlyPoint type
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

const processHourlyData = (data: HourlyPoint[], currentHour: number): ChartDataType => {
  const hours = Array.from({ length: currentHour + 1 }, (_, i) => i);

  const processedData = hours.map(hour => {
    // Ensure we are accessing 'averageEnergy' from the HourlyPoint structure
    const dataPoint = data.find(d => d.hour === hour);
    return dataPoint ? dataPoint.averageEnergy : 0;
  });

  const validDataPoints = data.filter(d => d.hour <= currentHour);
  const avgRaw =
    validDataPoints.length > 0
      ? validDataPoints.reduce((acc, curr) => acc + curr.averageEnergy, 0) / validDataPoints.length
      : 0;
  const average = Number(avgRaw.toFixed(2)); // force 2dp for consistency

  return {
    labels: hours.map(h => h.toString()),
    datasets: [
      {
        ...defaultBarDataset,
        type: 'bar',
        label: 'Energy Usage',
        data: processedData,
        barPercentage: 0.8,
        categoryPercentage: 0.9,
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
      position: 'top',
      labels: {
        ...defaultChartOptions.plugins?.legend?.labels,
        color: chartConfig.colors.foreground,
      },
    },
    tooltip: {
      ...defaultChartOptions.plugins?.tooltip,
      callbacks: {
        ...defaultChartOptions.plugins?.tooltip?.callbacks,
        label: (context: any): string => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} kWh`,
        title: (tooltipItems: any[]): string => {
          const hour = parseInt(tooltipItems[0].label);
          return formatHour(hour);
        },
      },
    } as any,
  },
  scales: {
    x: {
      min: 0,
      max: maxHour,
      ...(defaultChartOptions.scales?.x as any),
      barPercentage: 0.8,
      categoryPercentage: 0.9,
      title: {
        display: true,
        text: 'Time of Day',
        color: chartConfig.colors.muted,
        font: { size: 12 },
      },
      ticks: {
        ...(defaultChartOptions.scales?.x as any)?.ticks,
        maxRotation: 45,
        minRotation: 45,
        callback: (value: string | number): string => {
          const hour = typeof value === 'string' ? parseInt(value) : value;
          return formatHour(hour);
        },
      },
      grid: { display: false },
      border: { display: false },
    },
    y: {
      ...(defaultChartOptions.scales?.y as any),
      title: {
        display: true,
        text: 'Energy (kWh)',
        color: chartConfig.colors.muted,
        font: { size: 12 },
      },
      ticks: {
        ...(defaultChartOptions.scales?.y as any)?.ticks,
        callback: (value: number): string => `${Number(value).toFixed(2)} kWh`, // force 2dp
      },
    },
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

  const chartData = processHourlyData(data, currentHour);
  const options = chartOptions(currentHour);

  // Compute interpretation relative to average
  const barValues = chartData.datasets.find(ds => ds.type === 'bar')?.data as number[];
  const averageValue = chartData.datasets.find(ds => ds.type === 'line')?.data[0] as number;
  const currentUsage = barValues[currentHour] ?? 0;
  let interpretation = '';
  if (averageValue === 0) {
    interpretation = 'no data to compare';
  } else if (currentUsage < averageValue * 0.9) {
    interpretation = 'lower than usual';
  } else if (currentUsage > averageValue * 1.1) {
    interpretation = 'higher than usual';
  } else {
    interpretation = 'about the same as usual';
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 right-2 text-sm italic text-gray-600 bg-white/50 px-2 py-1 rounded">
        {`At ${formatHour(currentHour)}, energy consumption is ${interpretation}.`}
      </div>
      <Chart type="bar" data={chartData} options={options} className="w-full h-full" />
    </div>
  );
};

export default HourlySummaryChart;