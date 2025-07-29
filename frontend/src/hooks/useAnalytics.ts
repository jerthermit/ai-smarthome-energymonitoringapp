// frontend/src/hooks/useAnalytics.ts

import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export type TimeRange = 'day' | '3days' | 'week';

type EnergySummaryRow = {
  deviceId: string;   // from backend alias
  energyKwh: number;  // kWh over canonical window
};

type AggregatePoint = {
  timestamp: string;  // ISO8601 UTC (bucket start)
  value: number;      // Wh in the bucket
};

type TopDevice = { deviceId: string; totalEnergy: number; name?: string }; // totalEnergy in kWh
type HourlyPoint = { hour: number; averageEnergy: number }; // kWh per local hour (name kept for compatibility)

/* ---------------- Canonical, backend-driven windows ----------------
   - day   => [today 00:00, now) hourly (60m)
   - 3days => [today 00:00-3d, today 00:00) daily (exclude today)
   - week  => [today 00:00-7d, today 00:00) daily (exclude today)
-------------------------------------------------------------------- */

const getClientTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Singapore';

/** Per-device totals in kWh for the selected canonical range (backend computes window). */
async function fetchEnergySummary(range: TimeRange, tz: string): Promise<EnergySummaryRow[]> {
  const { data } = await api.get<EnergySummaryRow[]>('/telemetry/energy_summary', {
    params: { range, tz },
  });
  return data ?? [];
}

/** Today’s hourly aggregate (backend computes [today 00:00, now) in local tz). */
async function fetchTodayAggregate(tz: string): Promise<AggregatePoint[]> {
  const { data } = await api.get<AggregatePoint[]>('/telemetry/aggregate', {
    params: { range: 'day', tz },
  });
  return (data ?? []).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/** Convert aggregate points (Wh) to HourlyPoint[] (kWh) indexed by local hour 0..currentHour, filling gaps with 0. */
function toHourlyKwhToday(points: AggregatePoint[], nowLocal = new Date()): HourlyPoint[] {
  const currentHour = nowLocal.getHours();
  // Map hour -> kWh
  const byHour = new Map<number, number>();

  for (const p of points) {
    const d = new Date(p.timestamp); // UTC -> we only need local hour for labeling
    const hour = d.getHours();
    const kwh = (p.value ?? 0) / 1000;
    byHour.set(hour, Number(kwh.toFixed(2)));
  }

  const out: HourlyPoint[] = [];
  for (let h = 0; h <= currentHour; h++) {
    out.push({ hour: h, averageEnergy: byHour.get(h) ?? 0 });
  }
  return out;
}

export const useAnalytics = (timeRange: TimeRange = 'week') => {
  const tz = getClientTimeZone();

  return useQuery({
    queryKey: ['analytics', timeRange, tz],
    queryFn: async (): Promise<{
      topDevices: TopDevice[];
      hourlyData: HourlyPoint[]; // kWh per hour for today (local)
      totalKwh: number;
    }> => {
      // Both calls rely on canonical server windows & timezone alignment.
      const [summary, todayAgg] = await Promise.all([
        fetchEnergySummary(timeRange, tz),
        fetchTodayAggregate(tz),
      ]);

      const topDevices: TopDevice[] = (summary ?? [])
        .map((row) => ({
          deviceId: row.deviceId,
          totalEnergy: Number((row.energyKwh ?? 0).toFixed(2)),
        }))
        .sort((a, b) => b.totalEnergy - a.totalEnergy);

      const totalKwh = Number(
        (summary ?? []).reduce((acc, r) => acc + (r.energyKwh ?? 0), 0).toFixed(2)
      );

      const hourlyData = toHourlyKwhToday(todayAgg);

      return { topDevices, hourlyData, totalKwh };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
};

export default useAnalytics;