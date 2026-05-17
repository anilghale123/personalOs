"use client";

import * as React from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Layers,
  Upload,
  Repeat,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn, formatNPR, formatNumber, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#db2777",
];

export function VaultClient({ portfolio, transactions }) {
  const totals = portfolio.reduce(
    (acc, p) => {
      acc.invested += p.totalInvested;
      acc.current += p.currentValue;
      return acc;
    },
    { invested: 0, current: 0 }
  );
  const pnl = totals.current - totals.invested;
  const pnlPct =
    totals.invested > 0 ? (pnl / totals.invested) * 100 : 0;

  const pieData = portfolio
    .filter((p) => p.currentValue > 0)
    .map((p) => ({ name: p.ticker, value: p.currentValue }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Invested"
          value={formatNPR(totals.invested)}
          icon={Wallet}
        />
        <StatCard
          label="Current Value"
          value={formatNPR(totals.current)}
          icon={Layers}
        />
        <StatCard
          label="Total P&L"
          value={formatNPR(pnl)}
          hint={`${pnl >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
          icon={pnl >= 0 ? TrendingUp : TrendingDown}
          tone={pnl >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Holdings"
          value={portfolio.length}
          hint={`${transactions.length} transactions`}
          icon={Layers}
        />
      </div>

      {portfolio.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Your vault is empty"
          description="Import a broker CSV to populate your portfolio, or add a SIP to start tracking."
        >
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/portfolio/import">
                <Upload className="h-4 w-4" />
                Import CSV
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/portfolio/sip">
                <Repeat className="h-4 w-4" />
                Manage SIPs
              </Link>
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Holdings</CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href="/portfolio/import">
                  <Upload className="h-4 w-4" />
                  Import
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-6 py-2 font-medium">Ticker</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Units
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        LTP
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Value
                      </th>
                      <th className="px-6 py-2 text-right font-medium">
                        P&L
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.map((p) => (
                      <tr
                        key={p.ticker}
                        className="border-b last:border-0"
                      >
                        <td className="px-6 py-3 font-medium">
                          {p.ticker}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatNumber(p.totalUnits)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                          {p.lastPrice ? formatNumber(p.lastPrice) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatNumber(p.currentValue)}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 tabular-nums",
                              p.pnl >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-destructive"
                            )}
                          >
                            {p.pnl >= 0 ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            )}
                            {p.pnlPercent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={42}
                          outerRadius={70}
                          paddingAngle={2}
                        >
                          {pieData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v) => formatNPR(v)}
                          contentStyle={{
                            fontSize: 12,
                            borderRadius: 8,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {pieData.map((d, i) => (
                      <div
                        key={d.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{
                              background:
                                PIE_COLORS[i % PIE_COLORS.length],
                            }}
                          />
                          {d.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {(
                            (d.value / totals.current) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No priced holdings yet. Run the NEPSE scraper.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {transactions.slice(0, 12).map((t) => (
              <div
                key={t._id}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-accent/50"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={t.type === "BUY" ? "success" : "destructive"}
                  >
                    {t.type}
                  </Badge>
                  <span className="font-medium">{t.ticker}</span>
                  <span className="text-muted-foreground">
                    {formatNumber(t.quantity)} @{" "}
                    {formatNumber(t.pricePerUnit)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {formatNPR(t.totalAmount)}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {formatDate(t.transactionDate)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
