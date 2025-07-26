import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Legend
);

// Define the chart data type
type ChartDataType = ChartData<'line', number[], string>;

// Mock data - replace with actual API call
const fetchEnergyData = async (): Promise<ChartDataType> => {
  // Rest of your fetchEnergyData function remains the same
  return new Promise((resolve) => {
    setTimeout(() => {
      const labels = [];
      const data = [];
      
      // Generate data for the last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        data.push(Math.floor(Math.random() * 100) + 50);
      }
      
      resolve({
        labels,
        datasets: [
          {
            label: 'Energy Usage (kWh)',
            data,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            tension: 0.4,
          },
        ],
      });
    }, 500);
  });
};

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('week');
  
  const { data: chartData, isLoading } = useQuery<ChartDataType>({
    queryKey: ['energyData', timeRange],
    queryFn: fetchEnergyData,
  });

  // Rest of your component remains the same
  // ...

  // Update the Line component's options type
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

  return (
    <div className="space-y-6">
      {/* ... rest of your JSX ... */}
      <div className="h-80">
        {chartData && (
          <Line
            data={chartData}
            options={chartOptions}
          />
        )}
      </div>
      {/* ... rest of your JSX ... */}
    </div>
  );
};

export default Dashboard;