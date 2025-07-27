import React, { useEffect, useState } from 'react';
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
import type { ChartData, ChartOptions, ScriptableContext } from 'chart.js';
import { chartConfig } from './chart-config';
import { useEnergyData } from '../../hooks/useEnergyData';
import type { TelemetryData, TimeRange } from '../../hooks/useEnergyData';

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

interface EnergyUsageChartProps {
  deviceId?: string;
  timeRange: TimeRange;
  height?: number | string;
  className?: string;
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
        borderColor: chartConfig.colors.secondary,
        backgroundColor: (context: ScriptableContext<'line'>) => {
          const { chart } = context;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'hsla(267, 100%, 58%, 0.1)';
          
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, 'hsla(267, 100%, 58%, 0.1)');
          gradient.addColorStop(1, 'hsla(267, 100%, 58%, 0.4)');
          return gradient;
        },
        borderWidth: 2,
        pointBackgroundColor: chartConfig.colors.background,
        pointBorderColor: chartConfig.colors.secondary,
        pointHoverBackgroundColor: chartConfig.colors.secondary,
        pointHoverBorderColor: chartConfig.colors.background,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHitRadius: 10,
        pointBorderWidth: 2,
        tension: 0.3,
        fill: true,
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
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
    },
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: 'Energy Usage (W)',
      },
    },
  },
  elements: {
    line: {
      tension: 0.4,
      borderWidth: 2,
    },
    point: {
      radius: 0,
      hitRadius: 10,
      hoverRadius: 5,
    },
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
  },
  animation: {
    duration: 1000
  }
};

// Connection status indicator component
const ConnectionStatus: React.FC<{ isConnected: boolean; lastUpdated: Date }> = ({
  isConnected,
  lastUpdated
}) => {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    if (!lastUpdated) return;
    
    const updateTimeAgo = () => {
      const seconds = Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000);
      
      if (seconds < 60) {
        setTimeAgo('just now');
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        setTimeAgo(`${minutes}m ago`);
      } else {
        const hours = Math.floor(seconds / 3600);
        setTimeAgo(`${hours}h ago`);
      }
    };
    
    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 30000);
    
    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div className="absolute right-2 top-2 flex items-center space-x-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md text-xs">
      <div className="flex items-center">
        <span className="mr-1 text-muted-foreground">Status:</span>
        <span 
          className={`inline-block w-2 h-2 rounded-full mr-1 ${
            isConnected ? 'bg-green-500' : 'bg-yellow-500'
          }`} 
        />
        <span className="font-medium">
          {isConnected ? 'Live' : 'Polling'}
        </span>
      </div>
      {lastUpdated && (
        <span className="text-muted-foreground text-xs">
          Updated {timeAgo}
        </span>
      )}
    </div>
  );
};

const EnergyUsageChart: React.FC<EnergyUsageChartProps> = ({
  deviceId,
  timeRange,
  height = 400,
  className = ''
}) => {
  const { 
    data: telemetryData = [], 
    isLoading, 
    error,
    isUsingWebSocket = false,
    lastUpdated = new Date()
  } = useEnergyData(timeRange, { deviceId, realtime: true });
  
  const chartData = processChartData(telemetryData, timeRange);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading energy data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-destructive">
          <p className="font-medium">Error loading energy data</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`} style={{ height }}>
      <ConnectionStatus isConnected={isUsingWebSocket} lastUpdated={lastUpdated} />
      <div className="h-full w-full">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default EnergyUsageChart;
