import { useState, useMemo, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Clock, BarChart3, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import TopDevicesChart from '../components/charts/TopDevicesChart';
import DeviceEnergyChart from '../components/charts/DeviceEnergyChart';
import AggregateConsumptionChart from '../components/charts/AggregateConsumptionChart';
import HourlySummaryChart from '../components/charts/HourlySummaryChart';
import { useAnalytics } from '../hooks';
import { StatCard } from '../components/ui/stat-card';
import { useQuery } from '@tanstack/react-query';
import { fetchDevices } from '../services/deviceService';

type DashboardTimeRange = 'day' | '3days' | 'week';
type DeviceChartTimeRange = 'day' | 'week' | 'month';

const timeRangeOptions = [
  { value: 'day' as const, label: 'Today' },
  { value: '3days' as const, label: 'Last 3 Days' },
  { value: 'week' as const, label: 'Last 7 Days' },
];

const Dashboard = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>('week');
  // Convert dashboard time range to device chart time range
  const getDeviceChartTimeRange = useCallback((range: DashboardTimeRange): DeviceChartTimeRange => {
    if (range === '3days') return 'week';
    return range;
  }, []);
  
  // Fetch analytics data
  const { 
    data: analyticsData = { topDevices: [], hourlyData: [] }, 
    isLoading: isLoadingAnalytics, 
    error: analyticsError 
  } = useAnalytics(timeRange as 'day' | 'week');

  // Fetch devices - set all to online for prototype
  const { data: devicesData = [], isLoading: isLoadingDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.map(device => ({
      ...device,
      status: 'online' // Force all devices to be online for prototype
    }))
  });
  
  const devices = devicesData;

  const isLoading = isLoadingAnalytics || isLoadingDevices;
  const error = analyticsError;

  // Map device names for top devices
  const devicesWithNames = useMemo(() => {
    return (analyticsData.topDevices || []).map(device => ({
      ...device,
      name: devices.find(d => d.id === device.deviceId)?.name || device.deviceId
    }));
  }, [analyticsData.topDevices, devices]);

  // Get selected device name
  const selectedDevice = useMemo(() => {
    if (selectedDeviceId === 'all') return { name: 'All Devices' };
    return devices.find(d => d.id === selectedDeviceId) || { name: 'Unknown Device' };
  }, [selectedDeviceId, devices]);

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-8">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-4">
          We couldn't load the dashboard data. Please try again later.
        </p>
        <Button 
          variant="outline" 
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8 pt-6">
      {/* Header Section */}
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Energy Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor and analyze your home energy consumption</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-1 border border-gray-200">
            <Tabs 
              value={timeRange} 
              onValueChange={(value) => setTimeRange(value as DashboardTimeRange)}
              className="w-full md:w-auto"
            >
              <TabsList className="grid grid-cols-3 h-10">
                {timeRangeOptions.map((option) => (
                  <TabsTrigger 
                    key={option.value} 
                    value={option.value}
                    className="text-sm font-medium transition-colors"
                  >
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Key Metrics */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Key Metrics</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <StatCard 
              title="Current Usage" 
              value={devices.reduce((sum, d) => sum + (d.current_power || 0), 0).toFixed(2)} 
              unit="W" 
              icon="bolt" 
              description="Total power being used right now"
              isLoading={isLoading}
              className="bg-white hover:shadow-md transition-shadow duration-200"
            />
            <StatCard 
              title="Total Today" 
              value={(analyticsData.hourlyData.reduce((sum, h) => sum + (h.averageEnergy || 0), 0) * 24).toFixed(2)} 
              unit="kWh" 
              icon="bolt" 
              description="Energy used so far today"
              isLoading={isLoading}
              className="bg-white hover:shadow-md transition-shadow duration-200"
            />
          </div>
        </section>
      </header>

      {/* Main Content */}
      <div className="space-y-8">
        {/* Energy Overview Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Energy Overview</h2>
              <p className="text-sm text-gray-500">Track your home's energy consumption patterns</p>
            </div>
          </div>
          
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-2">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Aggregate Energy Consumption</CardTitle>
                  <CardDescription>Total energy usage across all devices</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-80">
              <AggregateConsumptionChart timeRange={timeRange} />
            </CardContent>
          </Card>
        </section>

        {/* Device Analysis Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Consumers */}
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-green-50 text-green-600">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Top Energy Consumers</CardTitle>
                  <CardDescription>
                    {timeRange === 'day' ? 'Today' : timeRange === '3days' ? 'Last 3 Days' : 'Last 7 Days'}'s highest consumers
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-[320px]">
              <TopDevicesChart 
                data={devicesWithNames} 
                timeRange={timeRange}
                isLoading={isLoadingAnalytics || isLoadingDevices}
                error={analyticsError}
              />
            </CardContent>
          </Card>

          {/* Hourly Summary */}
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Hourly Summary</CardTitle>
                  <CardDescription>Today's energy consumption by hour</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-[320px]">
              <HourlySummaryChart />
            </CardContent>
          </Card>
        </section>

        {/* Device Management Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device Energy Usage */}
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                    <Activity className="h-5 w-5" />
                  </div>
                  <CardTitle>Device Energy Usage</CardTitle>
                </div>
                <select
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                >
                  <option value="all">All Devices</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
              </div>
              <CardDescription>
                {selectedDeviceId === 'all' 
                  ? 'Combined energy usage across all devices' 
                  : `Detailed view for ${selectedDevice.name}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[320px]">
              <DeviceEnergyChart 
                deviceId={selectedDeviceId}
                timeRange={getDeviceChartTimeRange(timeRange)}
                deviceName={selectedDevice.name}
              />
            </CardContent>
          </Card>

          {/* Device List */}
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Connected Devices</CardTitle>
                  <CardDescription>All devices are online in this prototype</CardDescription>
                </div>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {devices.length} Devices
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingDevices ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : devices.length > 0 ? (
                <div className="space-y-3">
                  {devices.map((device) => (
                    <div 
                      key={device.id} 
                      className={`flex items-center justify-between p-3 border border-gray-200 rounded-lg transition-all cursor-pointer hover:bg-gray-50 ${
                        selectedDeviceId === device.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedDeviceId(device.id)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                        <div>
                          <p className="font-medium text-sm text-gray-900">{device.name}</p>
                          <p className="text-xs text-gray-500 capitalize">{device.type}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm text-gray-900">{device.current_power?.toFixed(2) || '0.00'} <span className="text-xs text-gray-500">W</span></p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Online
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No devices found. Add a device to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;