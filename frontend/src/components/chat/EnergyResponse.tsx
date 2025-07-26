import React from 'react';
import { TimeSeriesChart } from './TimeSeriesChart';

interface EnergyResponseProps {
  data: any;
}

export const EnergyResponse: React.FC<EnergyResponseProps> = ({ data }) => {
  const { summary, data: usageData, time_series } = data;

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <p className="text-sm text-gray-800">{summary}</p>
      
      {usageData && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-md font-semibold text-gray-900 mb-2">Usage Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Device</p>
              <p className="font-medium text-gray-800">{usageData.device?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-500">Consumption</p>
              <p className="font-medium text-gray-800">{usageData.usage?.value} {usageData.usage?.unit}</p>
            </div>
            <div>
              <p className="text-gray-500">Cost</p>
              <p className="font-medium text-gray-800">${usageData.usage?.cost?.toFixed(2)} {usageData.usage?.currency}</p>
            </div>
            <div>
              <p className="text-gray-500">Time Period</p>
              <p className="font-medium text-gray-800">{new Date(usageData.time_period?.start).toLocaleDateString()} - {new Date(usageData.time_period?.end).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      )}

      {time_series && time_series.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-md font-semibold text-gray-900 mb-2">Energy Trend</h3>
          <div className="h-48">
            <TimeSeriesChart data={time_series} />
          </div>
        </div>
      )}
    </div>
  );
};
