import React, { useState } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon } from 'lucide-react';
import { CalendarDays as CalendarDaysIcon } from 'lucide-react';
import { CalendarRange as CalendarRangeIcon } from 'lucide-react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../utils';
import EnergyUsageChart from '../components/charts/EnergyUsageChart';
import TopDevicesChart from '../components/charts/TopDevicesChart';
import HourlyUsageChart from '../components/charts/HourlyUsageChart';
import { useEnergyData, useAnalytics } from '../hooks';
import type { TimeRange } from '../hooks/useEnergyData';
import { StatCard } from '../components/ui/stat-card';

type TimeRangeOption = {
  value: TimeRange;
  label: string;
  icon: React.ReactNode;
};

const timeRanges: TimeRangeOption[] = [
  { 
    value: 'day' as const, 
    label: 'Today', 
    icon: <CalendarIcon className="h-4 w-4" /> 
  },
  { 
    value: 'week' as const, 
    label: 'This Week', 
    icon: <CalendarDaysIcon className="h-4 w-4" /> 
  },
  { 
    value: 'month' as const, 
    label: 'This Month', 
    icon: <CalendarRangeIcon className="h-4 w-4" /> 
  },
];

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  
  // Fetch data using our custom hooks
  const { 
    data: energyData, 
    error: energyError, 
    isLoading: isLoadingEnergy
  } = useEnergyData(timeRange);
  
  const { 
    data: analyticsData, 
    isLoading: isLoadingAnalytics, 
    error: analyticsError 
  } = useAnalytics(timeRange);

  const isLoading = isLoadingEnergy || isLoadingAnalytics;
  const error = energyError || analyticsError;
  const selectedRange = timeRanges.find(range => range.value === timeRange) || timeRanges[1];

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader className="text-destructive">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Error Loading Dashboard</h2>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error.message || 'An error occurred while loading dashboard data.'}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Energy Dashboard</h1>
          <p className="text-muted-foreground">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        
        <Tabs 
          value={timeRange} 
          onValueChange={(value) => setTimeRange(value as TimeRange)}
          className="w-full md:w-auto"
        >
          <TabsList className="grid w-full grid-cols-3 md:w-auto">
            {timeRanges.map((range) => (
              <TabsTrigger 
                key={range.value} 
                value={range.value}
                className="flex items-center gap-2"
              >
                {range.icon}
                <span className="hidden sm:inline">{range.label}</span>
                <span className="sm:hidden">{range.label.split(' ').map(w => w[0]).join('')}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Consumption" 
          value={(analyticsData?.totalConsumption || 0).toFixed(2)} 
          unit="kWh" 
          icon="bolt" 
          isLoading={isLoading}
          trend={5} // Example trend value
        />
        <StatCard 
          title="Average Daily" 
          value={(analyticsData?.averageDaily || 0).toFixed(2)} 
          unit="kWh/day" 
          icon="lineChart" 
          isLoading={isLoading}
          trend={-2} // Example trend value
        />
        <StatCard 
          title="Cost Estimate" 
          value={(analyticsData?.estimatedCost || 0).toFixed(2)} 
          unit="$" 
          icon="dollarSign" 
          isLoading={isLoading}
          trend={3} // Example trend value
        />
        <StatCard 
          title="CO₂ Emissions" 
          value={(analyticsData?.carbonFootprint || 0).toFixed(2)} 
          unit="kg" 
          icon="cloud" 
          isLoading={isLoading}
          trend={-1} // Example trend value
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Energy Usage Chart */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Energy Usage Overview</CardTitle>
            <CardDescription>
              {selectedRange.label}'s energy consumption trends
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <EnergyUsageChart 
              data={energyData || []} 
              timeRange={timeRange} 
              isLoading={isLoadingEnergy}
              error={energyError}
            />
          </CardContent>
        </Card>

        {/* Top Devices */}
        <Card className="col-span-3 lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Energy Consumers</CardTitle>
            <CardDescription>Devices with highest energy consumption</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <TopDevicesChart 
              data={analyticsData?.topDevices || []} 
              isLoading={isLoadingAnalytics}
              error={analyticsError}
            />
          </CardContent>
        </Card>

        {/* Hourly Usage */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Hourly Usage Pattern</CardTitle>
            <CardDescription>Energy consumption throughout the day</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <HourlyUsageChart 
              data={analyticsData?.hourlyData || []} 
              timeRange={timeRange}
              isLoading={isLoadingAnalytics}
              error={analyticsError}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;