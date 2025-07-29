# System Design: Optimising Real-time Analytics and Alerts

## System Design Question
In a high-throughput smart home energy monitoring system handling millions of telemetry data points per hour from thousands of devices, the Analytics Service is a bottleneck when generating real-time aggregations and alerts. It queries PostgreSQL directly for each request, and response times degrade during peak hours.

Simply put, analytics requests hit raw PostgreSQL for every read. With millions of telemetry points per hour across thousands of devices, on-the-fly group-bys and scans cause high latency during peak hours.

**Task**  
Design and describe a solution to optimise performance and scalability. Provide pseudo-code for key components and explain the architectural decisions.

## Objectives
- P95 read latency ≤ 200 ms at peak  
- Dashboard freshness within 30–60 seconds  
- Alert end-to-end ≤ 10 seconds  
- No changes to the existing write path

## Design Summary
Keep writes in TimescaleDB. Serve reads from precomputed time buckets using Timescale **continuous aggregates** instead of raw rows. Optionally put a short **TTL cache** in front of those reads. **Alerts reuse the same aggregates** with cooldowns. If growth demands, add **streaming** and an **OLAP** store. External APIs remain unchanged.

## Rollout Plan
	1.	Add continuous aggregate views and refresh policies.
	2.	Optionally enable a short TTL cache in Analytics.
	3.	Implement polling alerts with cooldowns using the aggregates.
	4.	Add streaming and OLAP only if metrics justify it. Write path unchanged.

## Operations and Guardrails
	•	Timescale chunk interval: start at 1 day. Reduce to 12 hours if daily volume warrants.
	•	Monitor p95 latency, CA policy lag, Redis hit rate (if enabled), alert volume per rule.
	•	If cache is enabled: TTL 30–60 seconds + 10–20 percent jitter.
	•	Include fresh_as_of in responses so the UI shows recency.

## Trade-offs and Risks
	•	Freshness is roughly 1 minute. For sub-second alerts, move alert evaluation to streaming.
	•	Cache may serve up to 60 seconds of stale data. The fresh_as_of stamp keeps it transparent.
	•	Heavy ad hoc analytics can be offloaded to ClickHouse later. Timescale remains the source of truth.

### High-level Flow
devices -> Telemetry API -> Timescale hypertable (raw)
-> continuous aggregates (1m, 5m, 1h)
Analytics API -> [optional Redis TTL cache] -> client
Alerts worker -> evaluate rules on latest bucket -> notify

## Architectural Decisions and Rationale
1) **Timescale continuous aggregates**  
   - Precompute 1m, 5m, 1h buckets so reads are small range scans rather than heavy group-bys.  
   - Incremental refresh policies balance freshness and cost.

2) **Short TTL cache (optional)**  
   - Dashboards repeat identical queries. A 30–60 s TTL cuts load and hides small CA refresh lag.  
   - If Redis is unavailable, fall back to the CA view directly. The service still works.

3) **Alerts reuse aggregates**  
   - Poll the 1m or 5m CA tables and apply threshold rules with per-rule cooldown.  
   - One source of truth. No duplicate compute on raw data.

4) **Scale-up path only when needed**  
   - Kafka/Redpanda for ingest, stream windows compute for sub-second alerts.  
   - ClickHouse for very heavy ad hoc analytics.  
   - Timescale remains the system of record.

## Data Model Assumptions
Note: Adjust names to telemetry schema.
- `telemetry(ts timestamptz, device_id uuid, household_id uuid, power_w double precision, energy_wh double precision)`
- Hypertable on `ts`
- Index at least `(ts, device_id)` and `household_id`

## Pseudo-SQL: Continuous Aggregates and Policies
```sql
-- 1) Device-level 1 minute rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS ca_device_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', ts) AS bucket,
  device_id,
  sum(energy_wh) AS energy_wh_sum,
  avg(power_w)  AS power_w_avg,
  max(power_w)  AS power_w_max
FROM telemetry
GROUP BY bucket, device_id;

CREATE INDEX IF NOT EXISTS idx_ca_device_1m_bucket_device
  ON ca_device_1m(bucket, device_id);

SELECT add_continuous_aggregate_policy(
  'ca_device_1m',
  start_offset => INTERVAL '2 hours',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '30 seconds'
);

-- 2) Household-level 5 minute rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS ca_household_5m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', ts) AS bucket,
  household_id,
  sum(energy_wh) AS energy_wh_sum,
  avg(power_w)  AS power_w_avg
FROM telemetry
GROUP BY bucket, household_id;

CREATE INDEX IF NOT EXISTS idx_ca_household_5m_bucket_household
  ON ca_household_5m(bucket, household_id);

SELECT add_continuous_aggregate_policy(
  'ca_household_5m',
  start_offset => INTERVAL '1 day',
  end_offset   => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '2 minutes'
);

-- 3) Device-level hourly rollup for top-N queries
CREATE MATERIALIZED VIEW IF NOT EXISTS ca_device_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', ts) AS bucket,
  device_id,
  sum(energy_wh) AS energy_wh_sum
FROM telemetry
GROUP BY bucket, device_id;

CREATE INDEX IF NOT EXISTS idx_ca_device_1h_bucket_device
  ON ca_device_1h(bucket, device_id);

SELECT add_continuous_aggregate_policy(
  'ca_device_1h',
  start_offset => INTERVAL '7 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '10 minutes'
);

## Pseudo-code: Analytics Read Path (cache-first, CA fallback)
# analytics_service.py (pseudo)
import json, random
from datetime import datetime, timezone

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def cache_key(scope, sid, start, end, step, metric):
    # Example: agg:energy_wh_sum:household:abc:2025-07-29T00:00Z:2025-07-30T00:00Z:5m
    return f"agg:{metric}:{scope}:{sid}:{start.isoformat()}:{end.isoformat()}:{step}"

class Cache:
    def __init__(self, client=None, ttl=60):
        self.client = client  # None means cache disabled
        self.ttl = ttl
    def get(self, k):
        return None if self.client is None else self.client.get(k)
    def set(self, k, v, ttl=None):
        if self.client is None: return
        self.client.set(k, v, ex=ttl or self.ttl)

class Repo:
    def __init__(self, db):
        self.db = db
    async def fetch(self, table, where, params, select_cols):
        sql = f"SELECT bucket, {select_cols} FROM {table} WHERE {where} ORDER BY bucket ASC"
        return await self.db.fetch_all(sql, params)

class Analytics:
    def __init__(self, cache: Cache, repo: Repo):
        self.cache, self.repo = cache, repo

    async def energy_by_household(self, household_id, start, end, step="5m"):
        metric = "energy_wh_sum"
        key = cache_key("household", household_id, start, end, step, metric)
        hit = self.cache.get(key)
        if hit:
            return json.loads(hit)

        table = "ca_household_5m" if step == "5m" else "ca_device_1h"
        rows = await self.repo.fetch(
            table=table,
            where="household_id = :hid AND bucket >= :start AND bucket < :end",
            params={"hid": household_id, "start": start, "end": end},
            select_cols=metric,
        )
        out = {
            "fresh_as_of": now_iso(),
            "series": [{"t": r['bucket'], "v": float(r[metric])} for r in rows],
        }
        ttl = 60 + random.randint(0, 12)  # jitter to reduce stampede risk
        self.cache.set(key, json.dumps(out), ttl=ttl)
        return out

## Pseudo-code: Top Devices Last 24 Hours
async def top_devices_24h(repo: Repo, household_id: str, limit: int = 5):
    rows = await repo.fetch(
        table="ca_device_1h",
        where="bucket >= NOW() - INTERVAL '24 hours' AND device_id IN (SELECT id FROM devices WHERE household_id = :hid)",
        params={"hid": household_id},
        select_cols="device_id, energy_wh_sum",
    )
    totals = {}
    for r in rows:
        d = r["device_id"]
        totals[d] = totals.get(d, 0.0) + float(r["energy_wh_sum"])
    return sorted(
        [{"device_id": d, "energy_wh": v} for d, v in totals.items()],
        key=lambda x: x["energy_wh"],
        reverse=True
    )[:limit]

## Pseudo-code: Alerts Worker (polling, cooldown, reuse CA)
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import operator

@dataclass
class Rule:
    id: str
    scope: str          # "device" or "household"
    scope_id: str
    metric: str         # "power_w_avg" or "energy_wh_sum"
    window: str         # "1m" or "5m"
    op: str             # ">", ">=", "<", "<="
    value: float
    cooldown_sec: int = 300

class AlertsWorker:
    def __init__(self, repo: Repo, notifier, state: dict):
        self.repo, self.notifier, self.state = repo, notifier, state

    async def run_once(self, rules: list[Rule], now: datetime | None = None):
        now = now or datetime.now(timezone.utc)
        start = now - timedelta(minutes=5)
        for r in rules:
            table = "ca_device_1m" if (r.window == "1m" and r.scope == "device") else "ca_household_5m"
            rows = await self.repo.fetch(
                table=table,
                where=f"{r.scope}_id = :sid AND bucket >= :start AND bucket < :end",
                params={"sid": r.scope_id, "start": start, "end": now},
                select_cols=r.metric,
            )
            if not rows:
                continue
            latest = float(rows[-1][r.metric])
            if self._trip(r, latest, now):
                await self.notifier.send(r, latest, rows[-1]["bucket"])
                self.state[r.id] = now

    def _trip(self, r: Rule, val: float, now: datetime) -> bool:
        last = self.state.get(r.id)
        if last and (now - last).total_seconds() < r.cooldown_sec:
            return False
        ops = {">": operator.gt, ">=": operator.ge, "<": operator.lt, "<=": operator.le}
        return ops[r.op](val, r.value)

## API Sketch (unchanged externally)
# FastAPI pseudo
@router.get("/analytics/households/{household_id}/energy")
async def energy(household_id: str, start: datetime, end: datetime, step: str = "5m"):
    return await analytics.energy_by_household(household_id, start, end, step)

@router.get("/analytics/households/{household_id}/top-devices")
async def top_devices(household_id: str, limit: int = 5):
    return await top_devices_24h(repo, household_id, limit)