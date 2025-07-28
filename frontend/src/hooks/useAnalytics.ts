// frontend/src/hooks/useAnalytics.ts
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export type TimeRange = 'day' | '3days' | 'week';

type EnergySummaryRow = {
  deviceId: string;   // from backend alias
  energyKwh: number;  // kWh over [start,end)
};

type TelemetryRow = {
  deviceId: string;
  timestamp: string;   // ISO8601 UTC
  energyWatts: number; // instantaneous power (W)
};

type TopDevice = { deviceId: string; totalEnergy: number; name?: string }; // totalEnergy in kWh
type HourlyPoint = { hour: number; averageEnergy: number }; // here: kWh per local hour (name kept for compatibility)

const MAX_GAP_SECONDS = 15 * 60; // 15 minutes, match backend integration

function computeWindow(nowLocal = new Date(), range: TimeRange) {
  const end = new Date(nowLocal);
  const start = new Date(end);
  switch (range) {
    case 'day':
      start.setDate(end.getDate() - 1);
      break;
    case '3days':
      start.setDate(end.getDate() - 3);
      break;
    case 'week':
      start.setDate(end.getDate() - 7);
      break;
  }
  return { start, end };
}

/** Local "today" window [00:00 local → now local] */
function todayLocalWindow(nowLocal = new Date()) {
  const end = new Date(nowLocal);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

async function fetchEnergySummary(range: TimeRange): Promise<EnergySummaryRow[]> {
  const { start, end } = computeWindow(new Date(), range);
  const params = {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };
  const { data } = await api.get<EnergySummaryRow[]>('/telemetry/energy_summary', { params });
  return data;
}

/** Fetch raw telemetry for "today" (local midnight → now) under 10k cap. */
async function fetchTelemetryForToday(): Promise<TelemetryRow[]> {
  const { start, end } = todayLocalWindow(new Date());
  const params = {
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    limit: '10000', // backend cap
  };
  const { data } = await api.get<TelemetryRow[]>('/telemetry', { params });
  return data;
}

/**
 * Integrate energy across all devices and distribute by local hour bins (0..currentHour).
 * Step-hold previous reading per device, cap gaps to MAX_GAP_SECONDS, and proportionally
 * distribute interval energy across overlapping hour bins.
 *
 * Returns HourlyPoint[] where `averageEnergy` is actually kWh for that hour (kept field name for compatibility).
 */
function computeHourlyKwhToday(rows: TelemetryRow[], nowLocal = new Date()): HourlyPoint[] {
  const { start: dayStart, end: dayEnd } = todayLocalWindow(nowLocal);
  const currentHour = nowLocal.getHours();
  const hourStarts: number[] = [];
  for (let h = 0; h <= currentHour; h++) {
    const d = new Date(dayStart);
    d.setHours(d.getHours() + h);
    hourStarts.push(d.getTime());
  }
  // Build bin boundaries
  const hourEnds: number[] = hourStarts.map((s, idx) => {
    if (idx === hourStarts.length - 1) return Math.min(dayEnd.getTime(), s + 3600_000);
    return hourStarts[idx + 1];
  });

  // Accumulator for kWh per bin
  const kwhBins: number[] = Array(hourStarts.length).fill(0);

  // Group by device to apply step-hold per device
  const byDevice: Record<string, TelemetryRow[]> = {};
  for (const r of rows) (byDevice[r.deviceId] ||= []).push(r);

  for (const arr of Object.values(byDevice)) {
    // Sort ascending by timestamp
    arr.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (arr.length < 2) continue;

    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const curr = arr[i];

      // Original interval [prev.ts, curr.ts)
      const prevTs = new Date(prev.timestamp).getTime();
      const currTs = new Date(curr.timestamp).getTime();
      if (!isFinite(prevTs) || !isFinite(currTs) || currTs <= prevTs) continue;

      // Clip interval to today's window
      let segStart = Math.max(prevTs, dayStart.getTime());
      let segEnd = Math.min(currTs, dayEnd.getTime());
      if (segEnd <= segStart) continue;

      // Apply gap cap relative to the original previous timestamp
      const maxEndByGap = prevTs + MAX_GAP_SECONDS * 1000;
      segEnd = Math.min(segEnd, maxEndByGap);
      if (segEnd <= segStart) continue;

      const powerW = prev.energyWatts;

      // Distribute energy across overlapping hour bins
      for (let h = 0; h < hourStarts.length; h++) {
        const binStart = hourStarts[h];
        const binEnd = hourEnds[h];
        if (segStart >= binEnd || segEnd <= binStart) continue; // no overlap
        const overlapMs = Math.min(segEnd, binEnd) - Math.max(segStart, binStart);
        if (overlapMs <= 0) continue;

        const overlapKwh = (powerW * (overlapMs / 1000)) / 3600 / 1000; // W*s -> Wh -> kWh
        kwhBins[h] += overlapKwh;
      }
    }
  }

  // Round to 2 decimals per hour, build {hour, averageEnergy} (kWh) points
  return kwhBins.map((kwh, h) => ({
    hour: h,
    averageEnergy: Number(kwh.toFixed(2)),
  }));
}

export const useAnalytics = (timeRange: TimeRange = 'week') => {
  return useQuery({
    queryKey: ['analytics', timeRange],
    queryFn: async (): Promise<{
      topDevices: TopDevice[];
      hourlyData: HourlyPoint[]; // kWh per hour for today (local)
      totalKwh: number;
    }> => {
      // Accurate per-device kWh for the selected window from backend,
      // and integrated kWh per local hour for today from raw telemetry.
      const [summary, todayRows] = await Promise.all([
        fetchEnergySummary(timeRange),
        fetchTelemetryForToday(),
      ]);

      const topDevices: TopDevice[] = summary
        .map((row) => ({
          deviceId: row.deviceId,
          totalEnergy: Number((row.energyKwh ?? 0).toFixed(2)),
        }))
        .sort((a, b) => b.totalEnergy - a.totalEnergy);

      const totalKwh = Number(
        summary.reduce((acc, r) => acc + (r.energyKwh ?? 0), 0).toFixed(2)
      );

      const hourlyData = computeHourlyKwhToday(todayRows);

      return { topDevices, hourlyData, totalKwh };
    },
    staleTime: 10_000,
  });
};

export default useAnalytics;