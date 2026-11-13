'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from './api';
import type { AnalyticsData } from '@/lib/types';

const DF_YELLOW = '#FFD60A';
const DF_LINE = '#262626';
const DF_MUTE = '#8A8A8A';
const PENDING_BLUE = '#60a5fa';
const ARRIVED_GREEN = '#4ade80';

// Rounded-top rectangle path helper
function roundedTopPath(x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, h);
  return `M${x + cr},${y} H${x + w - cr} Q${x + w},${y} ${x + w},${y + cr} V${y + h} H${x} V${y + cr} Q${x},${y} ${x + cr},${y}Z`;
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-df-line bg-df-panel p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-df-mute">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, suffix = '' }: { active?: boolean; payload?: { value: number }[]; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-df-line bg-df-ink px-3 py-2 text-xs text-white shadow-lg">
      <p className="font-medium">{label}</p>
      <p className="text-df-yellow">{Number(payload[0].value).toFixed(4)} {suffix}</p>
    </div>
  );
}

export function AnalyticsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justReceived, setJustReceived] = useState<Set<string>>(new Set());
  const prevDataRef = useRef<AnalyticsData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const next = await api<AnalyticsData>('/api/analytics');

      // Detect items whose pending delivery just resolved (hollow bar collapsed into solid)
      if (prevDataRef.current) {
        const arrived = new Set<string>();
        for (const prev of prevDataRef.current.inventoryLevels) {
          const curr = next.inventoryLevels.find((x) => x.itemName === prev.itemName);
          if (curr && prev.pendingStock > 0 && curr.pendingStock === 0 && curr.currentStock > prev.currentStock) {
            arrived.add(curr.itemName);
          }
        }
        if (arrived.size > 0) {
          setJustReceived(arrived);
          setTimeout(() => setJustReceived(new Set()), 3500);
        }
      }

      prevDataRef.current = next;
      setData(next);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Fetch on mount and whenever the parent triggers a manual refresh
  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Auto-poll every 30 s to pick up DB changes even without a manual UI action
  useEffect(() => {
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (error) return (
    <section className="card">
      <p className="eyebrow">Analytics</p>
      <p className="hint mt-2 text-sm text-orange-400">{error}</p>
    </section>
  );

  if (!data) return (
    <section className="card">
      <p className="eyebrow">Analytics</p>
      <p className="hint mt-2 text-sm animate-pulse">Loading charts…</p>
    </section>
  );

  const hasMonthly = data.monthlySpend.length > 0;
  const hasItems = data.itemSpend.length > 0;
  const hasLevels = data.inventoryLevels.length > 0;
  const hasPending = data.inventoryLevels.some((x) => x.pendingStock > 0);

  return (
    <section className="card" aria-labelledby="analytics-h">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2 id="analytics-h" className="card-title">Treasury overview</h2>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-df-mute">Total out (6 mo)</p>
            <p className="text-lg font-semibold text-df-yellow">{data.summary.totalOutRlusd.toFixed(2)} RLUSD</p>
          </div>
          <div>
            <p className="text-xs text-df-mute">Total in (6 mo)</p>
            <p className="text-lg font-semibold text-white">{data.summary.totalInRlusd.toFixed(2)} RLUSD</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-1 lg:grid-cols-3">

        {/* Chart 1: Monthly spend */}
        <ChartCard title="Monthly spend" hint="RLUSD out per month (last 6 months)">
          {hasMonthly ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.monthlySpend} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <XAxis dataKey="month" tick={{ fill: DF_MUTE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: DF_MUTE, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<CustomTooltip suffix="RLUSD" />} cursor={{ fill: DF_LINE }} />
                <Bar dataKey="amountRlusd" radius={[3, 3, 0, 0]} fill={DF_YELLOW} fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-df-mute py-6 text-center">No spending data yet</p>
          )}
        </ChartCard>

        {/* Chart 2: Per-item spend */}
        <ChartCard title="Spend by item" hint="Cumulative RLUSD spent per item">
          {hasItems ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.itemSpend} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <XAxis dataKey="itemName" tick={{ fill: DF_MUTE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: DF_MUTE, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<CustomTooltip suffix="RLUSD" />} cursor={{ fill: DF_LINE }} />
                <Bar dataKey="amountRlusd" radius={[3, 3, 0, 0]} fill={DF_YELLOW} fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-df-mute py-6 text-center">No item data yet</p>
          )}
        </ChartCard>

        {/* Chart 3: Inventory levels — solid current stock + hollow pending delivery */}
        <ChartCard title="Inventory levels" hint="Current stock vs minimum threshold">
          {hasLevels ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.inventoryLevels} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <XAxis dataKey="itemName" tick={{ fill: DF_MUTE, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: DF_MUTE, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const item = data.inventoryLevels.find((x) => x.itemName === label);
                    type PEntry = { dataKey: string; value: number };
                    const entries = (payload as unknown as PEntry[]);
                    const solidVal = Number(entries.find((p) => p.dataKey === 'currentStock')?.value ?? 0);
                    const pendingVal = Number(entries.find((p) => p.dataKey === 'pendingStock')?.value ?? 0);
                    return (
                      <div className="rounded border border-df-line bg-df-ink px-3 py-2 text-xs text-white shadow-lg">
                        <p className="font-medium">{label}</p>
                        <p className="text-df-yellow">In stock: {solidVal} {item?.unit}</p>
                        {pendingVal > 0 && <p className="text-blue-400">On order: +{pendingVal} {item?.unit}</p>}
                        <p className="text-neutral-400">Min: {item?.minimumThreshold} {item?.unit}</p>
                        <p className={`mt-0.5 ${solidVal < (item?.minimumThreshold ?? 0) ? 'text-orange-400' : 'text-green-400'}`}>
                          {solidVal < (item?.minimumThreshold ?? 0) ? 'Below threshold' : 'OK'}
                          {pendingVal > 0 ? ' · Delivery pending' : ''}
                        </p>
                      </div>
                    );
                  }}
                  cursor={{ fill: DF_LINE }}
                />

                {/* Solid bar: units physically in hand */}
                <Bar
                  dataKey="currentStock"
                  stackId="inv"
                  shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { currentStock: number; minimumThreshold: number; pendingStock: number; itemName: string } }) => {
                    const { x = 0, y = 0, width = 0, height = 0, payload: p } = props;
                    if (height <= 0 || width <= 0) return null;
                    const hasPending = (p?.pendingStock ?? 0) > 0;
                    const isArrived = justReceived.has(p?.itemName ?? '');
                    const fill = isArrived ? ARRIVED_GREEN : ((p?.currentStock ?? 0) < (p?.minimumThreshold ?? 0) ? '#fb923c' : '#22c55e');
                    // Flat top when pending bar sits above; rounded top when it's the topmost bar
                    return hasPending
                      ? <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.85} />
                      : <path d={roundedTopPath(x, y, width, height, 3)} fill={fill} fillOpacity={0.85} />;
                  }}
                />

                {/* Hollow dashed bar: units ordered but not yet physically received */}
                <Bar
                  dataKey="pendingStock"
                  stackId="inv"
                  shape={(props: { x?: number; y?: number; width?: number; height?: number }) => {
                    const { x = 0, y = 0, width = 0, height = 0 } = props;
                    if (height <= 0 || width <= 0) return null;
                    return (
                      <path
                        d={roundedTopPath(x, y, width, height, 3)}
                        fill="transparent"
                        stroke={PENDING_BLUE}
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-df-mute py-6 text-center">No inventory data yet</p>
          )}
        </ChartCard>
      </div>

      {hasLevels && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-df-mute">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-green-500" />Above threshold</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-orange-400" />Below threshold</span>
          {hasPending && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm border border-dashed" style={{ borderColor: PENDING_BLUE }} />
              Pending delivery
            </span>
          )}
          {justReceived.size > 0 && (
            <span className="flex items-center gap-1.5 font-medium text-green-400 animate-pulse">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              Stock arrived: {Array.from(justReceived).join(', ')}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
