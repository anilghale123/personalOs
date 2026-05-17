"use client";

import * as React from "react";
import { Plus, Repeat, CalendarClock, Coins } from "lucide-react";
import { formatNPR, formatNumber, formatDate, toDateKey } from "@/lib/utils";
import { useVaultStore } from "@/features/vault/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Months elapsed (inclusive) between a start date and today. */
function monthsSince(startDate) {
  const s = new Date(startDate);
  const now = new Date();
  return Math.max(
    1,
    (now.getFullYear() - s.getFullYear()) * 12 +
      (now.getMonth() - s.getMonth()) +
      1
  );
}

export function SipManager({ initialSips }) {
  const { sips, setSips, addSIP } = useVaultStore();

  React.useEffect(() => {
    setSips(initialSips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSips = sips.filter((s) => s.isActive !== false);
  const monthlyCommitment = activeSips.reduce(
    (sum, s) => sum + (s.monthlyAmount || 0),
    0
  );
  const projected = sips.reduce(
    (sum, s) => sum + (s.monthlyAmount || 0) * monthsSince(s.startDate),
    0
  );
  const invested = sips.reduce(
    (sum, s) =>
      sum +
      (s.installments || []).reduce(
        (a, i) => a + (i.amountInvested || 0),
        0
      ),
    0
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Monthly Commitment"
          value={formatNPR(monthlyCommitment)}
          icon={Repeat}
        />
        <StatCard
          label="Invested to Date"
          value={formatNPR(invested)}
          icon={Coins}
        />
        <StatCard
          label="Projected (by plan)"
          value={formatNPR(projected)}
          hint="monthlyAmount × months active"
          icon={CalendarClock}
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          Systematic Investment Plans
        </h2>
        <AddSipDialog onAdd={addSIP} />
      </div>

      {sips.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No SIPs yet"
          description="Set up a recurring investment plan to track your installments and units."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sips.map((sip) => {
            const sipInvested = (sip.installments || []).reduce(
              (a, i) => a + (i.amountInvested || 0),
              0
            );
            const units = (sip.installments || []).reduce(
              (a, i) => a + (i.unitsPurchased || 0),
              0
            );
            return (
              <Card key={sip._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{sip.fundName}</p>
                      <p className="text-xs text-muted-foreground">
                        Since {formatDate(sip.startDate)}
                        {sip.ticker ? ` · ${sip.ticker}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        sip.isActive === false ? "secondary" : "success"
                      }
                    >
                      {sip.isActive === false ? "Paused" : "Active"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Monthly
                      </p>
                      <p className="font-medium tabular-nums">
                        {formatNumber(sip.monthlyAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Invested
                      </p>
                      <p className="font-medium tabular-nums">
                        {formatNumber(sipInvested)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Units
                      </p>
                      <p className="font-medium tabular-nums">
                        {formatNumber(units)}
                      </p>
                    </div>
                  </div>
                  {sip.isOptimistic ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Saving…
                    </p>
                  ) : (
                    <AddInstallmentDialog sipId={sip._id} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddSipDialog({ onAdd }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    fundName: "",
    ticker: "",
    monthlyAmount: "",
    startDate: toDateKey(),
  });

  function submit() {
    if (!form.fundName.trim() || !form.monthlyAmount) return;
    onAdd({
      fundName: form.fundName.trim(),
      ticker: form.ticker.trim() || undefined,
      monthlyAmount: Number(form.monthlyAmount),
      startDate: form.startDate,
    });
    setForm({
      fundName: "",
      ticker: "",
      monthlyAmount: "",
      startDate: toDateKey(),
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New SIP
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New SIP</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sip-fund">Fund name</Label>
            <Input
              id="sip-fund"
              placeholder="e.g. NMB Saral Bachat Fund-E"
              value={form.fundName}
              onChange={(e) =>
                setForm({ ...form, fundName: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sip-amount">Monthly amount (NPR)</Label>
              <Input
                id="sip-amount"
                type="number"
                placeholder="1000"
                value={form.monthlyAmount}
                onChange={(e) =>
                  setForm({ ...form, monthlyAmount: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sip-ticker">Ticker (optional)</Label>
              <Input
                id="sip-ticker"
                placeholder="NMBSF"
                value={form.ticker}
                onChange={(e) =>
                  setForm({ ...form, ticker: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sip-start">Start date</Label>
            <Input
              id="sip-start"
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm({ ...form, startDate: e.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Create SIP</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddInstallmentDialog({ sipId }) {
  const { setSips } = useVaultStore();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    date: toDateKey(),
    amountInvested: "",
    navAtPurchase: "",
  });

  async function submit() {
    if (!form.amountInvested) return;
    setSaving(true);
    try {
      const res = await fetch("/api/vault/sip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _id: sipId,
          installment: {
            date: form.date,
            amountInvested: Number(form.amountInvested),
            navAtPurchase: Number(form.navAtPurchase) || 0,
          },
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSips(
          useVaultStore
            .getState()
            .sips.map((s) => (s._id === sipId ? updated : s))
        );
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="mt-3 w-full">
          <Plus className="h-4 w-4" />
          Log installment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log installment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="inst-date">Date</Label>
            <Input
              id="inst-date"
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm({ ...form, date: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inst-amt">Amount</Label>
              <Input
                id="inst-amt"
                type="number"
                value={form.amountInvested}
                onChange={(e) =>
                  setForm({ ...form, amountInvested: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-nav">NAV / unit</Label>
              <Input
                id="inst-nav"
                type="number"
                value={form.navAtPurchase}
                onChange={(e) =>
                  setForm({ ...form, navAtPurchase: e.target.value })
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
