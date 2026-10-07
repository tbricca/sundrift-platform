import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ResearchRow = {
  id: string;
  keyword: string;
  country: string;
  request: string;
  researchedAt: string;
  volume: number;
  keywordDifficulty: number;
};

const COUNTRIES = ["US", "CA", "GB", "AU", "DE"];

export function meta() {
  return [{ title: "Research — SEO" }];
}

export default function ResearchRoute() {
  const navigate = useNavigate();
  const list = useActionQuery("list-research", {});
  const start = useActionMutation("start-research");
  const [request, setRequest] = useState(
    "What's the competition like for linen travel shirts?",
  );
  const [keyword, setKeyword] = useState("linen travel shirts");
  const [country, setCountry] = useState("US");
  const rows = (list.data?.research ?? []) as ResearchRow[];

  return (
    <div className="desk min-h-full px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header>
          <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
            Sundrift SEO
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">Research</h1>
        </header>
        <form
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            start.mutate(
              { keyword, country, request },
              {
                onSuccess: (result) => {
                  const id = result?.research?.id;
                  if (id) navigate(`/reports/${id}`);
                },
              },
            );
          }}
        >
          <label className="block text-sm font-medium text-stone-800">
            Request description
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <label className="block text-sm font-medium text-stone-800">
              Product keyword
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Country
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-sm"
              >
                {COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={start.isPending || !keyword.trim()}>
              <IconSearch className="size-4" />
              Start research
            </Button>
          </div>
        </form>
        <section>
          <h2 className="text-sm font-semibold text-stone-800">Past research</h2>
          {list.isLoading ? (
            <div className="mt-3 h-24 animate-pulse rounded-lg bg-stone-200/70" />
          ) : (
            <ul className="mt-3 divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/reports/${row.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-stone-50"
                  >
                    <span>
                      <span className="block text-sm font-medium text-stone-900">
                        {row.keyword}
                      </span>
                      <span className="block text-xs text-stone-500">
                        {row.request}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-stone-500">
                      {row.country} · {row.researchedAt} · vol {row.volume.toLocaleString()} · KD {row.keywordDifficulty}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
