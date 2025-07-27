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
        color: 'hsl(var(--muted-foreground))',
        font: {
          family: 'var(--font-sans)',
          size: 12,
        },
        padding: 20,
        usePointStyle: true,
      },
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
  pointBackgroundColor: 'hsl(var(--background))',
  pointBorderWidth: 2,
  borderColor: 'hsl(var(--primary))',
  backgroundColor: 'hsl(var(--primary) / 0.1)',
  tension: 0.3,
  fill: true,
};

// Helper function to convert CSS variable to RGB
const getCssVar = (varName: string) => {
  if (typeof window === 'undefined') return 'rgba(59, 130, 246, 1)'; // Fallback color
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue(varName).trim();
};

// Default bar chart dataset options
const defaultBarDataset = {
  borderWidth: 0,
  borderRadius: 4,
  borderSkipped: false,
  backgroundColor: (context: ScriptableContext<'bar'>) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return getCssVar('--primary');
    
    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    // Use hardcoded colors as fallbacks that match your theme
    try {
      const primaryColor = getCssVar('--primary');
      gradient.addColorStop(0, primaryColor.replace(')', ' / 0.2)'));
      gradient.addColorStop(1, primaryColor);
    } catch (e) {
      // Fallback colors if there's an error parsing the CSS variable
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 1)');
    }
    return gradient;
  },
  hoverBackgroundColor: () => {
    try {
      return getCssVar('--primary');
    } catch (e) {
      return 'rgba(59, 130, 246, 1)';
    }
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
