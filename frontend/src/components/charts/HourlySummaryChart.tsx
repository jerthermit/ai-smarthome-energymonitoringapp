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

const processHourlyData = (data: HourlyDataPoint[]): ChartDataType => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  return {
    labels: hours.map(h => `${h}:00`),
    datasets: [
      {
        type: 'bar',
        label: "Today's Usage (kWh)",
        data: hours.map(hour => {
          const dataPoint = data.find(d => d.hour === hour);
          return dataPoint ? dataPoint.averageEnergy : 0;
        }),
        backgroundColor: 'hsl(var(--primary))',
        borderColor: 'hsl(var(--primary))',
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 12,
      },
      {
        type: 'line',
        label: 'Average (kWh)',
        data: hours.map(hour => {
          // Calculate average of all data points for this hour
          const hourData = data.filter(d => d.hour === hour);
          const sum = hourData.reduce((acc, curr) => acc + curr.averageEnergy, 0);
          return hourData.length > 0 ? sum / hourData.length : 0;
        }),
        borderColor: 'hsl(var(--muted-foreground))',
        borderWidth: 2,
        borderDash: [5, 5],
        pointBackgroundColor: 'hsl(var(--muted-foreground))',
        pointBorderColor: 'hsl(var(--background))',
        pointBorderWidth: 1,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ],
  };
};

const chartOptions: ChartOptions<'bar' | 'line'> = {
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

const HourlySummaryChart: React.FC<HourlySummaryChartProps> = ({ data = [], isLoading, error }) => {

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center text-destructive">
        Error loading hourly data
      </div>
    );
  }

  const chartData = processHourlyData(data);

  // Extend the base options with type-specific settings
  const mergedOptions: ChartOptions<'bar' | 'line'> = {
    ...chartOptions,
    responsive: true,
    maintainAspectRatio: false,
  };

  return (
    <div className="w-full h-full">
      <Chart
        type="bar"
        data={{
          ...chartData,
          datasets: chartData.datasets
        }}
        options={mergedOptions}
      />
    </div>
  );
};

export default HourlySummaryChart;
