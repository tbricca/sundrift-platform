import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@/components/ui/button";

type Simulation = {
  baselineSessions: number;
  simulatedSessions: number;
  baselineConversionPct: number;
  simulatedConversionPct: number;
  baselineAov: number;
  simulatedAov: number;
  baselineRevenue: number;
  simulatedRevenue: number;
};

type Campaign = {
  id: string;
  name: string;
  productName: string;
  productSessions: number;
  productConversionPct: number;
  productAov: number;
  referenceDays: number;
  windowDays: number;
  sessionLiftPct: number;
  conversionLiftPp: number;
  aovLiftPct: number;
  status: string;
  comparableLabel: string;
  badge: string;
  notes: string;
  simulation: Simulation | null;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function meta() {
  return [{ title: "Financial modeling — Campaign Planner" }];
}

export default function CampaignRoute() {
  const { id = "" } = useParams();
  const query = useActionQuery("get-campaign", { id });
  const update = useActionMutation("update-campaign", { method: "PUT" });
  const campaign = query.data?.campaign as Campaign | undefined;
  const [windowDays, setWindowDays] = useState(180);
  const [sessionLift, setSessionLift] = useState(12.4);
  const [conversionLift, setConversionLift] = useState(1.6);
  const [aovLift, setAovLift] = useState(3.9);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign) return;
    setWindowDays(campaign.windowDays);
    setSessionLift(campaign.sessionLiftPct);
    setConversionLift(campaign.conversionLiftPp);
    setAovLift(campaign.aovLiftPct);
    setHydratedId(campaign.id);
  }, [campaign?.id]);

  useEffect(() => {
    if (!campaign || hydratedId !== campaign.id) return;
    const unchanged =
      windowDays === campaign.windowDays &&
      Math.abs(sessionLift - campaign.sessionLiftPct) < 0.05 &&
      Math.abs(conversionLift - campaign.conversionLiftPp) < 0.05 &&
      Math.abs(aovLift - campaign.aovLiftPct) < 0.05;
    if (unchanged) return;
    const timer = window.setTimeout(() => {
      update.mutate({
        id,
        windowDays,
        sessionLiftPct: sessionLift,
        conversionLiftPp: conversionLift,
        aovLiftPct: aovLift,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [windowDays, sessionLift, conversionLift, aovLift, campaign, hydratedId, id]);

  const live = useMemo(() => {
    if (!campaign) return null;
    const baseSessions = Math.round(
      campaign.productSessions * (windowDays / campaign.referenceDays),
    );
    const simulatedSessions = Math.round(baseSessions * (1 + sessionLift / 100));
    const simulatedConversionPct =
      Math.round((campaign.productConversionPct + conversionLift) * 100) / 100;
    const simulatedAov =
      Math.round(campaign.productAov * (1 + aovLift / 100) * 100) / 100;
    const baselineRevenue =
      Math.round(
        baseSessions *
          (campaign.productConversionPct / 100) *
          campaign.productAov *
          100,
      ) / 100;
    const simulatedRevenue =
      Math.round(
        simulatedSessions * (simulatedConversionPct / 100) * simulatedAov * 100,
      ) / 100;
    return {
      baselineSessions: baseSessions,
      simulatedSessions,
      baselineConversionPct: campaign.productConversionPct,
      simulatedConversionPct,
      baselineAov: campaign.productAov,
      simulatedAov,
      baselineRevenue,
      simulatedRevenue,
    };
  }, [campaign, windowDays, sessionLift, conversionLift, aovLift]);

  if (query.isLoading) {
    return (
      <div className="desk min-h-full px-6 py-8">
        <div className="mx-auto h-80 max-w-3xl animate-pulse rounded-xl bg-stone-200/70" />
      </div>
    );
  }

  if (!campaign || !live) {
    return (
      <div className="desk px-6 py-8">
        <p className="text-sm">That campaign is not seeded.</p>
        <Link to="/campaigns" className="mt-2 inline-block text-sm underline">
          All campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="desk min-h-full px-6 py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
              Financial modeling
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-900">
              Revenue simulator
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {campaign.productName} · Last {windowDays} days
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                sendToAgentChat({
                  openSidebar: true,
                  message: `Research campaigns similar to ${campaign.name}. Use get-campaign-simulation for ${campaign.id} and stay with Sundrift travel products.`,
                })
              }
            >
              Research similar campaigns
            </Button>
            <Button
              type="button"
              disabled={campaign.status === "complete" || update.isPending}
              onClick={() => update.mutate({ id, status: "complete" })}
            >
              {campaign.status === "complete" ? "Complete" : "Mark Complete"}
            </Button>
          </div>
        </header>
        <p className="w-fit rounded-full bg-stone-200 px-3 py-1 text-xs text-stone-700">
          {campaign.badge}
        </p>
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Live workspace data</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-stone-500">Sessions</dt>
              <dd className="font-medium">{live.baselineSessions.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Conversion</dt>
              <dd className="font-medium">{live.baselineConversionPct.toFixed(2)}%</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">AOV</dt>
              <dd className="font-medium">{money(live.baselineAov)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-500">{campaign.notes}</p>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Comparable campaign</h2>
          <p className="mt-1 text-sm">{campaign.comparableLabel}</p>
          <p className="mt-2 text-sm text-emerald-700">
            Sessions +{sessionLift.toFixed(1)}% · conversion +{conversionLift.toFixed(1)}pp · AOV +{aovLift.toFixed(1)}%
          </p>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <label className="block text-sm">
            Projection window (days)
            <input
              type="number"
              min={1}
              max={365}
              value={windowDays}
              onChange={(event) => setWindowDays(Number(event.target.value) || 1)}
              className="mt-1 h-9 w-28 rounded-md border border-stone-200 px-2"
            />
          </label>
          <Slider
            label="Sessions lift %"
            value={sessionLift}
            min={0}
            max={40}
            step={0.1}
            onChange={setSessionLift}
          />
          <Slider
            label="Conversion lift (percentage points)"
            value={conversionLift}
            min={0}
            max={5}
            step={0.1}
            onChange={setConversionLift}
          />
          <Slider
            label="AOV lift %"
            value={aovLift}
            min={0}
            max={20}
            step={0.1}
            onChange={setAovLift}
          />
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-stone-100 pt-4 text-sm">
            <div>
              <p className="text-xs text-stone-500">Baseline revenue</p>
              <p className="text-lg">{money(live.baselineRevenue)}</p>
              <p className="text-xs text-stone-500">
                {live.baselineSessions.toLocaleString()} sessions · {live.baselineConversionPct.toFixed(2)}% · {money(live.baselineAov)}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Projected revenue</p>
              <p className="text-lg text-emerald-700">{money(live.simulatedRevenue)}</p>
              <p className="text-xs text-stone-500">
                {live.simulatedSessions.toLocaleString()} sessions · {live.simulatedConversionPct.toFixed(2)}% · {money(live.simulatedAov)}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-4 block text-sm">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-stone-500">{value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}
