import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { Button } from "@/components/ui/button";

type Related = { keyword: string; difficulty: number; volume: number };
type Serp = {
  name: string;
  position: number;
  traffic: number;
  domainRating: number;
};

export function meta() {
  return [{ title: "Opportunity research — SEO" }];
}

export default function ReportRoute() {
  const { id = "" } = useParams();
  const report = useActionQuery("get-research", { id });
  const save = useActionMutation("update-research", { method: "PUT" });
  const data = report.data;
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (typeof data?.suggestedResponse === "string") {
      setDraft(data.suggestedResponse);
    }
  }, [data?.suggestedResponse]);

  if (report.isLoading) {
    return (
      <div className="desk min-h-full px-6 py-8">
        <div className="mx-auto h-64 max-w-3xl animate-pulse rounded-xl bg-stone-200/70" />
      </div>
    );
  }

  if (!data?.keyword) {
    return (
      <div className="desk min-h-full px-6 py-8">
        <p className="text-sm text-stone-600">That research report is not in the catalog.</p>
        <Link to="/research" className="mt-3 inline-block text-sm underline">
          Back to research
        </Link>
      </div>
    );
  }

  const related = (data.related ?? []) as Related[];
  const serp = (data.serp ?? []) as Serp[];

  return (
    <div className="desk min-h-full px-6 py-8">
      <article className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
              Opportunity research
            </p>
            <h1 className="mt-1 text-2xl font-semibold capitalize text-stone-900">
              {data.keyword}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {data.country} · {data.researchedAt} · volume {Number(data.volume).toLocaleString()} · KD {data.keywordDifficulty}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            Research ready
          </span>
        </header>
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Suggested response</h2>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                sendToAgentChat({
                  openSidebar: true,
                  message: `Answer this SEO request for ${data.keyword} (${data.id}). Question: ${data.request}`,
                  context: `Research id ${data.id}. Use get-research before writing. Keep the answer in Sundrift's calm travel voice.`,
                })
              }
            >
              Answer this SEO request
            </Button>
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="The suggested response is still being written."
            className="mt-3 min-h-28 w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
          />
          <Button
            type="button"
            className="mt-3"
            disabled={save.isPending}
            onClick={() => save.mutate({ id, suggestedResponse: draft })}
          >
            {save.isPending ? "Saving…" : "Save response"}
          </Button>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Full report</h2>
          <p className="mt-1 text-xs text-stone-500">{data.sourceLabel}</p>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-800">
            {data.fullReport}
          </div>
          {related.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Related terms
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {related.map((term) => (
                  <li key={term.keyword} className="flex justify-between gap-3">
                    <span>{term.keyword}</span>
                    <span className="text-stone-500">
                      KD {term.difficulty} · {term.volume.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {serp.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                SERP snapshot
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {serp.map((row) => (
                  <li key={row.name} className="flex justify-between gap-3">
                    <span>
                      {row.position}. {row.name}
                    </span>
                    <span className="text-stone-500">
                      traffic {row.traffic.toLocaleString()} · DR {row.domainRating}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        <Link to="/audit-log" className="text-sm text-stone-600 underline">
          Open the audit log
        </Link>
      </article>
    </div>
  );
}
