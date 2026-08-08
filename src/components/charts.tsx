"use client";

import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/constants";

// Recharts diagramok — halvány, Notion-os megjelenéssel.

const PALETTE_HEX: Record<string, string> = {
  red: "#E03E3E", orange: "#D9730D", yellow: "#DFAB01", green: "#0F7B6C",
  blue: "#0B6E99", purple: "#6940A5", pink: "#AD1A72", gray: "#787774",
};

export function MonthlyBarChart({ data, baseCurrency, categories }: {
  data: Record<string, string | number>[]; // { month: "2026. jan", [categoryName]: minorAmount }
  baseCurrency: Currency;
  categories: { name: string; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => `${Math.round(v / 100 / 1000)}e`}
          width={40}
        />
        <Tooltip
          formatter={(value) => formatMoney(Number(value), baseCurrency)}
          contentStyle={{
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 8, fontSize: 13,
          }}
          cursor={{ fill: "var(--bg-hover)" }}
        />
        {categories.map((c) => (
          <Bar
            key={c.name} dataKey={c.name} stackId="a"
            fill={PALETTE_HEX[c.color] ?? PALETTE_HEX.gray}
            radius={[0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, baseCurrency }: {
  data: { name: string; value: number; color: string }[];
  baseCurrency: Currency;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data} dataKey="value" nameKey="name"
          innerRadius={55} outerRadius={85} paddingAngle={2} strokeWidth={0}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={PALETTE_HEX[d.color] ?? PALETTE_HEX.gray} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatMoney(Number(value), baseCurrency)}
          contentStyle={{
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 8, fontSize: 13,
          }}
        />
        <Legend
          verticalAlign="bottom"
          iconSize={8}
          formatter={(v) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
