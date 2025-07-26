import { useState } from 'react';
import { format } from 'date-fns';
import EnergyUsageChart from '../components/charts/EnergyUsageChart';
import TopDevicesChart from '../components/charts/TopDevicesChart';
import HourlyUsageChart from '../components/charts/HourlyUsageChart';
import { useEnergyData, useAnalytics } from '../hooks';
import type { TimeRange } from '../hooks/useEnergyData';

console.log('Dashboard component mounted!');

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  
  // Fetch data using our custom hooks
  const { data: energyData, isLoading: isLoadingEnergy, error: energyError } = useEnergyData(timeRange);
  const { data: analyticsData, isLoading: isLoadingAnalytics, error: analyticsError } = useAnalytics(timeRange);

  // Loading and error states
  const isLoading = isLoadingEnergy || isLoadingAnalytics;
  const error = energyError || analyticsError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">
                Error loading dashboard data: {error.message}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Energy Dashboard</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex space-x-2">
          {(['day', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                timeRange === range
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart - Full width on mobile, 2/3 on larger screens */}
        <div className="lg:col-span-2">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Energy Usage Overview
            </h2>
            <div className="h-80">
              <EnergyUsageChart 
                data={energyData || []} 
                timeRange={timeRange} 
                isLoading={isLoadingEnergy}
                error={energyError}
              />
            </div>
          </div>
        </div>

        {/* Top Devices */}
        <div className="lg:col-span-1">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 h-full">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Top Energy Consumers
            </h2>
            <div className="h-80">
              <TopDevicesChart 
                data={analyticsData?.topDevices || []} 
                isLoading={isLoadingAnalytics}
                error={analyticsError}
              />
            </div>
          </div>
        </div>

        {/* Hourly Usage */}
        <div className="lg:col-span-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Daily Usage Pattern
            </h2>
            <div className="h-96">
              <HourlyUsageChart 
                data={analyticsData?.hourlyData || []}
                isLoading={isLoadingAnalytics}
                error={analyticsError}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;