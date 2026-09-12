"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatNPR } from "@/lib/utils";

/**
 * The portfolio allocation donut.
 *
 * Its own module so `vault-client.jsx` can dynamic-import it: recharts is the
 * single largest dependency in the app and this is the only thing on the
 * portfolio page that needs it, so it should not be in the bundle that renders
 * the page's numbers.
 */
export function AllocationChart({ data, colors }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={42}
          outerRadius={70}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => formatNPR(v)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
