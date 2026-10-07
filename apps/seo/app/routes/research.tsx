import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconArrowRight, IconClock, IconLoader2, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResearchRow = {
  id: string;
  keyword: string;
  country: string;
  summary: string;
  createdAt: string;
  reportKind: string;
};

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "MX", label: "Mexico" },
];

export function meta() {
  return [
    { title: "SEO - SEO opportunity research" },
    {
      name: "description",
      content: "Conduct and save Ahrefs-style SEO opportunity research.",
    },
  ];
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ResearchRoute() {
  const navigate = useNavigate();
  const list = useActionQuery("list-research", {});
  const start = useActionMutation("start-research");
  const [request, setRequest] = useState("");
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("US");
  const rows = (list.data?.research ?? []) as ResearchRow[];
  const keywordReady = keyword.trim().length >= 2;

  return (
    <div className="seo-home mx-auto flex min-h-full w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section aria-labelledby="generate-report-heading" className="max-w-xl">
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle id="generate-report-heading" className="text-base">
              Conduct research
            </CardTitle>
            <CardDescription>
              Research is saved automatically when it completes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                const nextKeyword = keyword.trim();
                if (nextKeyword.length < 2) return;
                const nextRequest =
                  request.trim().length >= 5
                    ? request.trim()
                    : `Research the SEO opportunity for "${nextKeyword}".`;
                start.mutate(
                  { keyword: nextKeyword, country, request: nextRequest },
                  {
                    onSuccess: (result) => {
                      const id = result?.reportId ?? result?.research?.id;
                      if (id) navigate(`/reports/${id}`);
                    },
                  },
                );
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="description">Request description</Label>
                <textarea
                  id="description"
                  data-tour="seo-request-description"
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="What do you need to learn from this research?"
                  maxLength={500}
                  className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="keyword">Product keyword</Label>
                <div className="relative">
                  <IconSearch className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    id="keyword"
                    data-tour="seo-keyword-input"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="e.g. linen travel shirts"
                    className="pl-9"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="country">Country code</Label>
                <select
                  id="country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                >
                  {COUNTRIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                data-tour="seo-research-submit"
                className="w-full"
                disabled={start.isPending || !keywordReady}
              >
                {start.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <IconLoader2 className="size-4 animate-spin" />
                    Researching catalog…
                  </span>
                ) : (
                  <>
                    Start research
                    <IconArrowRight className="size-4" />
                  </>
                )}
              </Button>
              {start.isError ? (
                <p role="alert" className="text-destructive text-sm leading-5">
                  {start.error?.message ?? "Could not complete the research."}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="saved-reports-heading" className="grid min-w-0 gap-4">
        <div className="border-border flex items-end justify-between gap-4 border-b pb-4">
          <div>
            <h2 id="saved-reports-heading" className="text-lg font-semibold">
              Past research
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Reopen completed research without running a live keyword pull.
            </p>
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {rows.length} saved
          </span>
        </div>
        {list.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Loading research…
          </div>
        ) : list.isError ? (
          <p role="alert" className="text-destructive py-8 text-sm">
            {list.error?.message ?? "Could not load past research."}
          </p>
        ) : rows.length ? (
          <div className="border-border bg-card min-w-0 max-w-full divide-y overflow-hidden rounded-lg border">
            {rows.map((row) => (
              <Link
                key={row.id}
                to={`/reports/${row.id}`}
                className="hover:bg-muted/50 group flex min-w-0 max-w-full items-center gap-4 px-4 py-4 sm:px-5"
              >
                <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <IconClock className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 max-w-full truncate text-sm font-medium capitalize">
                      {row.keyword}
                    </h3>
                    <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase">
                      {row.country}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-sm">{row.summary}</p>
                </div>
                <div className="hidden shrink-0 items-center gap-3 sm:flex">
                  <time className="text-muted-foreground text-xs">{formatDate(row.createdAt)}</time>
                  <IconArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border-border rounded-lg border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-medium">No research yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Your first research project will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
