import type { ChartOptions, ScriptableContext } from 'chart.js';
import type { CSSProperties, ReactNode } from 'react';
import React from 'react';

// Interface for chart component props
interface ChartComponentProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown; // For additional props
}

// Default chart options
const defaultChartOptions: ChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: 'hsl(0, 0%, 50%)', // muted-foreground
        font: {
          family: 'Inter, system-ui, sans-serif',
          size: 12,
        },
        padding: 20,
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: 'hsl(0, 0%, 100%)', // popover
      titleColor: 'hsl(219, 79%, 26%)', // foreground
      bodyColor: 'hsl(0, 0%, 50%)', // muted-foreground
      borderColor: 'hsl(219, 20%, 90%)', // border
      borderWidth: 1,
      padding: 12,
      usePointStyle: true,
      callbacks: {
        label: (context: any) => {
          const label = context.dataset.label || '';
          const value = context.parsed?.y ?? context.parsed;
          return `${label}: ${value} kWh`;
        },
      },
    } as const,
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: 'hsl(0, 0%, 50%)', // muted-foreground
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'hsl(219, 20%, 90%)', // border
      },
      ticks: {
        color: 'hsl(0, 0%, 50%)', // muted-foreground
        callback: function (value: string | number) {
          return `${value} kWh`;
        },
      },
    } as const,
  },
} as const;

// Default line chart dataset options
const defaultLineDataset = {
  borderWidth: 2,
  pointRadius: 0,
  pointHoverRadius: 4,
  pointBackgroundColor: 'hsl(219, 34%, 98%)', // background
  pointBorderWidth: 2,
  borderColor: 'hsl(267, 100%, 58%)', // secondary
  backgroundColor: (context: ScriptableContext<'line'>) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'hsla(267, 100%, 58%, 0.1)';
    
    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, 'hsla(267, 100%, 58%, 0.1)');
    gradient.addColorStop(1, 'hsla(267, 100%, 58%, 0.4)');
    return gradient;
  },
  tension: 0.3,
  fill: true,
};

// Chart.js configuration
export const chartConfig = {
  // Theme colors in HSL format for Chart.js
  colors: {
    primary: 'hsl(219, 79%, 26%)',
    secondary: 'hsl(267, 100%, 58%)',
    background: 'hsl(219, 34%, 98%)',
    foreground: 'hsl(219, 79%, 26%)',
    muted: 'hsl(0, 0%, 50%)',
    border: 'hsl(219, 20%, 90%)',
    card: 'hsl(0, 0%, 100%)',
    popover: 'hsl(0, 0%, 100%)',
    accent: 'hsl(0, 0%, 98%)',
    destructive: 'hsl(0, 84.2%, 60.2%)',
  },
};

// Default bar chart dataset options
const defaultBarDataset = {
  borderWidth: 0,
  borderRadius: 4,
  borderSkipped: false,
  backgroundColor: (context: ScriptableContext<'bar'>) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'hsla(267, 100%, 58%, 0.7)'; // secondary with opacity
    
    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, 'hsla(267, 100%, 58%, 0.2)');
    gradient.addColorStop(1, 'hsla(267, 100%, 58%, 0.8)');
    return gradient;
  },
  hoverBackgroundColor: (context: ScriptableContext<'bar'>) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'hsl(267, 100%, 58%)'; // secondary
    
    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, 'hsla(267, 100%, 58%, 0.3)');
    gradient.addColorStop(1, 'hsla(267, 100%, 58%, 1)');
    return gradient;
  },
  maxBarThickness: 32,
};

// Loading component for chart placeholders
const ChartLoading: React.FC<ChartComponentProps> = ({ 
  className = '',
  ...props 
}) => (
  <div 
    className={`flex items-center justify-center h-full min-h-[300px] text-muted-foreground ${className}`}
    {...props}
  >
    <div className="animate-pulse flex flex-col items-center gap-2">
      <div className="h-4 w-32 bg-muted rounded" />
      <div className="h-4 w-48 bg-muted rounded" />
      <div className="h-40 w-full bg-muted rounded mt-4" />
    </div>
  </div>
);

// Error component for chart errors
interface ChartErrorProps extends ChartComponentProps {
  error: Error | null;
}

const ChartError: React.FC<ChartErrorProps> = ({ 
  error, 
  className = '',
  ...props 
}) => (
  <div 
    className={`flex items-center justify-center h-full min-h-[300px] text-destructive ${className}`}
    {...props}
  >
    <div className="text-center p-4">
      <p className="font-medium">Failed to load chart data</p>
      {error?.message && (
        <p className="text-sm text-muted-foreground mt-1">
          {error.message}
        </p>
      )}
    </div>
  </div>
);

// Empty state component for charts
interface ChartEmptyProps extends ChartComponentProps {
  message?: string;
}

const ChartEmpty: React.FC<ChartEmptyProps> = ({ 
  message = 'No data available',
  className = '',
  ...props 
}) => (
  <div 
    className={`flex items-center justify-center h-full min-h-[300px] text-muted-foreground ${className}`}
    {...props}
  >
    <p>{message}</p>
  </div>
);

export {
  defaultChartOptions,
  defaultLineDataset,
  defaultBarDataset,
  ChartLoading,
  ChartError,
  ChartEmpty,
};

export type {
  ChartComponentProps,
  ChartErrorProps,
  ChartEmptyProps,
};
