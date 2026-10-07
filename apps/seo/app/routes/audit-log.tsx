import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconMail, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AuditRow = {
  id: string;
  channel: string;
  team: string;
  requestedAt: string;
  summary: string;
  detail: string;
  status: string;
  researchId: string | null;
};

export function meta() {
  return [{ title: "Audit log — SEO" }];
}

export default function AuditLogRoute() {
  const list = useActionQuery("list-audit-log", {});
  const update = useActionMutation("update-audit-entry", { method: "PUT" });
  const complete = useActionMutation("complete-audit-entries");
  const importMail = useActionMutation("import-mailbox-requests");
  const prepare = useActionMutation("prepare-audit-delivery");
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const entries = (list.data?.entries ?? []) as AuditRow[];
  const requestId = params.get("requestId");
  const active = useMemo(
    () => entries.find((entry) => entry.id === requestId) ?? null,
    [entries, requestId],
  );

  async function send(entry: AuditRow, channel: "email" | "slack" | "clipboard") {
    const result = await prepare.mutateAsync({ id: entry.id, channel });
    if (channel === "clipboard" && result?.body) {
      await navigator.clipboard.writeText(String(result.body));
    }
    if (channel === "email" && result?.mailto) {
      window.location.href = String(result.mailto);
    }
    setNotice(String(result?.message ?? ""));
  }

  return (
    <div className="desk min-h-full px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
              Sundrift SEO
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-900">Audit log</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={importMail.isPending}
              onClick={() => importMail.mutate({})}
            >
              <IconMail className="size-4" />
              Import mailbox
            </Button>
            <Button
              type="button"
              disabled={selected.length === 0 || complete.isPending}
              onClick={() =>
                complete.mutate(
                  { ids: selected },
                  { onSuccess: () => setSelected([]) },
                )
              }
            >
              Complete selected ({selected.length})
            </Button>
          </div>
        </header>
        {notice ? <p className="text-sm text-stone-600">{notice}</p> : null}
        {list.isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-stone-200/70" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
                    onClick={() => setParams({ requestId: entry.id })}
                  >
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(entry.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, entry.id]
                              : current.filter((id) => id !== entry.id),
                          )
                        }
                        aria-label={`Select ${entry.summary}`}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{entry.requestedAt}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {entry.channel} / {entry.team}
                    </td>
                    <td className="px-3 py-2">{entry.summary}</td>
                    <td className="px-3 py-2 capitalize">{entry.status}</td>
                    <td
                      className="px-3 py-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            update.mutate({ id: entry.id, status: "complete" })
                          }
                        >
                          Complete
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="ghost">
                              Send
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => send(entry, "email")}>
                              Email
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => send(entry, "slack")}>
                              Slack
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => send(entry, "clipboard")}>
                              Copy
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${entry.summary}`}
                          onClick={() => update.mutate({ id: entry.id, deleted: true })}
                        >
                          <IconTrash className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {active ? (
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-stone-500">
              {active.channel} / {active.team} · {active.requestedAt}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{active.summary}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-700">{active.detail}</p>
            {active.researchId ? (
              <Link
                to={`/reports/${active.researchId}`}
                className="mt-3 inline-block text-sm underline"
              >
                Open research report
              </Link>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
