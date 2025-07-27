import { useState, useMemo, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Clock, BarChart3, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import TopDevicesChart from '../components/charts/TopDevicesChart';
import DeviceEnergyChart from '../components/charts/DeviceEnergyChart';
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
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-foreground">Something went wrong</h2>
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
    <div className="flex-1 min-h-screen bg-gradient-to-br from-background to-muted/20 p-3 sm:p-4 md:p-6 lg:p-8 pt-4 sm:pt-6">
      {/* Header Section */}
      <header className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="space-y-0.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Energy Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Monitor and analyze your home energy consumption</p>
          </div>
          <div className="w-full sm:w-auto bg-card rounded-lg shadow-sm p-0.5 sm:p-1 border">
            <Tabs 
              value={timeRange} 
              onValueChange={(value) => setTimeRange(value as DashboardTimeRange)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 h-9 sm:h-10 w-full">
                {timeRangeOptions.map((option) => (
                  <TabsTrigger 
                    key={option.value} 
                    value={option.value}
                    className="text-xs sm:text-sm font-medium transition-colors hover:text-foreground px-2 sm:px-3"
                  >
                    <span className="truncate">{option.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Key Metrics */}
        <section className="mb-6 sm:mb-8">
          <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Key Metrics</h2>
          <div className="grid gap-4 sm:gap-6 grid-cols-1 xs:grid-cols-2">
            <StatCard 
              title="Current Usage" 
              value={devices.reduce((sum, d) => sum + (d.current_power || 0), 0).toFixed(2)} 
              unit="W" 
              icon="bolt" 
              description="Total power being used right now"
              isLoading={isLoading}
              className="bg-card hover:shadow-md transition-shadow duration-200 border"
            />
            <StatCard 
              title="Total Today" 
              value={(analyticsData.hourlyData.reduce((sum, h) => sum + (h.averageEnergy || 0), 0) * 24).toFixed(2)} 
              unit="kWh" 
              icon="bolt" 
              description="Energy used so far today"
              isLoading={isLoading}
              className="bg-card hover:shadow-md transition-shadow duration-200 border"
            />
          </div>
        </section>
      </header>

      {/* Main Content */}
      <div className="space-y-6 sm:space-y-8">
        {/* Hourly Summary Section */}
        <section>
          <div className="mb-3 sm:mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">Hourly Analysis</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Breakdown of energy usage throughout the day</p>
          </div>
          
          <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 sm:p-2 rounded-lg bg-secondary/10 text-secondary-foreground">
                  <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <CardTitle className="text-base sm:text-lg">Hourly Energy Consumption</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Average energy usage by hour of day</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-64 sm:h-72 md:h-80">
              <div className="h-full w-full">
                <HourlySummaryChart 
                  data={analyticsData.hourlyData} 
                  isLoading={isLoadingAnalytics}
                  error={analyticsError}
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Device Analysis Section */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          {/* Top Consumers */}
          <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
            <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 sm:p-2 rounded-lg bg-secondary/10 text-secondary-foreground">
                  <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <CardTitle className="text-base sm:text-lg">Top Energy Consumers</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {timeRange === 'day' ? 'Today' : timeRange === '3days' ? 'Last 3 Days' : 'Last 7 Days'}'s highest consumers
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-[280px] sm:min-h-[320px] px-4 pb-4 sm:px-6 sm:pb-6">
              <TopDevicesChart 
                data={devicesWithNames} 
                timeRange={timeRange}
                isLoading={isLoadingAnalytics || isLoadingDevices}
                error={analyticsError}
              />
            </CardContent>
          </Card>

          {/* Device Energy Chart */}
          <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
            <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex flex-col space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base sm:text-lg">Device Energy Usage</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {selectedDeviceId === 'all' 
                        ? 'Combined energy usage across all devices' 
                        : `Detailed view for ${selectedDevice.name}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="w-full sm:w-64">
                  <select
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
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
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-[280px] sm:min-h-[320px] px-4 pb-4 sm:px-6 sm:pb-6">
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
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success-foreground">
                  {devices.length} Devices
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingDevices ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : devices.length > 0 ? (
                <div className="space-y-3">
                  {devices.map((device) => (
                    <div 
                      key={device.id} 
                      className={`flex items-center justify-between p-3 border rounded-lg transition-all cursor-pointer hover:bg-accent/50 ${
                        selectedDeviceId === device.id ? 'ring-2 ring-primary bg-accent/20' : 'hover:border-border'
                      }`}
                      onClick={() => setSelectedDeviceId(device.id)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
                        <div>
                          <p className="font-medium text-sm text-foreground">{device.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{device.type}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm text-foreground">{device.current_power?.toFixed(2) || '0.00'} <span className="text-xs text-muted-foreground">W</span></p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success-foreground">
                          Online
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No devices found. Add a device to get started.</p>
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