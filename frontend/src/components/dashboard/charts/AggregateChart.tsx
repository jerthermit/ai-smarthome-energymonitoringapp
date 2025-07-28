import React from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart } from 'recharts';
import { Skeleton } from '../../../components/ui/skeleton';

interface AggregateChartProps {
  data: Array<{
    timestamp: string;
    value: number;
  }>;
  isLoading?: boolean;
  className?: string;
}

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
  } catch {
    return '';
  }
};

const AggregateChart: React.FC<AggregateChartProps> = ({
  data = [],
  isLoading = false,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div className={`h-64 ${className}`}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`h-64 flex items-center justify-center text-gray-500 ${className}`}>
        No data available
      </div>
    );
  }

  return (
    <div className={`h-64 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatDate}
            tick={{ fontSize: 12, fill: '#6b7280' }}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: '#6b7280' }}
            width={40}
          />
          <Tooltip 
            labelFormatter={formatDate}
            formatter={(value: number) => [`${value.toFixed(2)} W`, 'Power Usage']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AggregateChart;
