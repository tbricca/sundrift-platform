import { useActionQuery } from "@agent-native/core/client/hooks";
import { IconArrowRight, IconLoader2, IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Stages = {
  marketResearch: boolean;
  financialModeling: boolean;
  brandMessaging: boolean;
  seo: boolean;
  buildPrototypes: boolean;
  reviewDesign: boolean;
  deploy: boolean;
};

type CampaignRow = {
  id: string;
  name: string;
  campaignKeywords: string;
  category: string;
  description: string;
  status: string;
  workflowStatus: string;
  stages: Stages;
};

const STAGE_COLUMNS: Array<{ key: keyof Stages; label: string }> = [
  { key: "marketResearch", label: "Market research" },
  { key: "financialModeling", label: "Financial model" },
  { key: "brandMessaging", label: "Brand messaging" },
  { key: "seo", label: "SEO" },
  { key: "buildPrototypes", label: "Build prototypes" },
  { key: "reviewDesign", label: "Review design" },
  { key: "deploy", label: "Deploy" },
];

export function meta() {
  return [
    { title: "Campaign Planner - Campaigns" },
    {
      name: "description",
      content: "Track active campaigns across the planning and design workflow.",
    },
  ];
}

function StageMark({ complete, label }: { complete: boolean; label: string }) {
  return (
    <span
      title={complete ? `${label}: Complete` : `${label}: Not complete`}
      aria-label={complete ? `${label}: Complete` : `${label}: Not complete`}
      className={
        complete
          ? "inline-flex size-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white"
          : "border-border text-muted-foreground inline-flex size-5 items-center justify-center rounded-full border text-[10px]"
      }
    >
      {complete ? "✓" : ""}
    </span>
  );
}

export default function CampaignsRoute() {
  const list = useActionQuery("list-campaigns", {});
  const campaigns = (list.data?.campaigns ?? []) as CampaignRow[];
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stageFilters, setStageFilters] = useState<Record<string, string>>({});
  const categories = useMemo(
    () => Array.from(new Set(campaigns.map((campaign) => campaign.category))).sort(),
    [campaigns],
  );
  const activeCount = campaigns.filter((campaign) => campaign.status !== "complete").length;
  const completedCount = campaigns.filter((campaign) => campaign.status === "complete").length;
  const filtered = campaigns.filter((campaign) => {
    const haystack = `${campaign.name} ${campaign.campaignKeywords} ${campaign.description}`
      .toLocaleLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLocaleLowerCase())) return false;
    if (category !== "all" && campaign.category !== category) return false;
    return STAGE_COLUMNS.every((stage) => {
      const filter = stageFilters[stage.key] ?? "any";
      if (filter === "any") return true;
      return filter === "complete"
        ? campaign.stages[stage.key]
        : !campaign.stages[stage.key];
    });
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 p-4 lg:px-8 lg:py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track planning and delivery progress across every campaign.
          </p>
        </div>
        <Button asChild>
          <Link to="/new-campaign">
            <IconPlus className="size-4" />
            New campaign
          </Link>
        </Button>
      </div>
      {list.isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
          <IconLoader2 className="size-4 animate-spin" />
          Loading campaigns…
        </div>
      ) : list.isError ? (
        <p className="text-destructive text-sm">
          {list.error?.message ?? "Failed to load campaigns."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total campaigns", campaigns.length],
              ["Active campaigns", activeCount],
              ["Deployed", list.data?.statusCounts?.deployed ?? 0],
              ["Completed", completedCount],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <CardContent className="px-4 py-3">
                  <p className="text-2xl font-semibold tabular-nums">{value}</p>
                  <p className="text-muted-foreground text-xs">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {campaigns.length === 0 ? (
            <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center">
              <p className="text-sm font-medium">No campaigns yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Create a campaign to start the checklist.
              </p>
            </div>
          ) : (
            <div className="border-border overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">
                      <span className="block">Campaign</span>
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Filter campaigns"
                        aria-label="Filter campaigns"
                        className="mt-2 h-8"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium" colSpan={7}>
                      Research and planning
                    </th>
                    <th className="px-3 py-2 font-medium">
                      <span className="block">Category</span>
                      <select
                        value={category}
                        aria-label="Filter category"
                        onChange={(event) => setCategory(event.target.value)}
                        className="border-input bg-background mt-2 h-8 rounded-md border px-2 text-xs"
                      >
                        <option value="all">All</option>
                        {categories.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-3 py-2 font-medium">Open</th>
                  </tr>
                  <tr className="text-muted-foreground text-[11px]">
                    <th />
                    {STAGE_COLUMNS.map((stage) => (
                      <th key={stage.key} className="px-2 py-1 font-medium">
                        <span className="block">{stage.label}</span>
                        <select
                          aria-label={`Filter ${stage.label}`}
                          value={stageFilters[stage.key] ?? "any"}
                          onChange={(event) =>
                            setStageFilters((current) => ({
                              ...current,
                              [stage.key]: event.target.value,
                            }))
                          }
                          className="border-input bg-background mt-1 h-7 rounded border px-1"
                        >
                          <option value="any">Any</option>
                          <option value="complete">Complete</option>
                          <option value="incomplete">Not complete</option>
                        </select>
                      </th>
                    ))}
                    <th />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-muted-foreground px-3 py-8 text-center">
                        No campaigns match these filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((campaign) => (
                      <tr key={campaign.id} className="border-border border-t">
                        <td className="px-3 py-3">
                          <Link to={`/campaign/${campaign.id}`} className="font-medium hover:underline">
                            {campaign.name}
                          </Link>
                          <p className="text-muted-foreground text-xs">{campaign.campaignKeywords}</p>
                        </td>
                        {STAGE_COLUMNS.map((stage) => (
                          <td key={stage.key} className="px-2 py-3">
                            <StageMark
                              complete={campaign.stages[stage.key]}
                              label={stage.label}
                            />
                          </td>
                        ))}
                        <td className="text-muted-foreground px-3 py-3">{campaign.category}</td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/campaign/${campaign.id}`}
                            aria-label={`Open ${campaign.name}`}
                            className="text-muted-foreground hover:text-foreground inline-flex"
                          >
                            <IconArrowRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
