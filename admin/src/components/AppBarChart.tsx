"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { shouldRefreshRevenue } from "@/lib/revenue-refresh";

type RevenuePoint = { month: string; total: number; successful: number };

const chartConfig = {
  total: {
    label: "Total",
    color: "#ef4444", // red-500
  },
  successful: {
    label: "Successful",
    color: "#f97316", // orange-500
  },
} satisfies ChartConfig;

async function fetchRevenue(): Promise<RevenuePoint[]> {
  const res = await fetch("/api/dashboard/revenue", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

const AppBarChart = () => {
  const [chartData, setChartData] = useState<RevenuePoint[]>([]);
  const lastFetchedAt = useRef(0);

  const load = useCallback(async () => {
    const data = await fetchRevenue();
    lastFetchedAt.current = Date.now();
    setChartData(data);
  }, []);

  useEffect(() => {
    void load();

    const refreshWhenActive = () => {
      if (
        document.visibilityState === 'visible' &&
        shouldRefreshRevenue(lastFetchedAt.current, Date.now())
      ) {
        void load();
      }
    };

    window.addEventListener('focus', refreshWhenActive);
    document.addEventListener('visibilitychange', refreshWhenActive);

    return () => {
      window.removeEventListener('focus', refreshWhenActive);
      document.removeEventListener('visibilitychange', refreshWhenActive);
    };
  }, [load]);

  return (
    <div className="">
      <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(value) => String(value).slice(0, 3)}
          />
          <YAxis tickLine={false} tickMargin={10} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="total" fill="var(--color-total)" radius={4} />
          <Bar dataKey="successful" fill="var(--color-successful)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  );
};

export default AppBarChart;
