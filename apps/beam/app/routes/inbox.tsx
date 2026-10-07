import { InboxList } from "@/components/inbox/InboxList";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Inbox — ${APP_TITLE}` }];
}

export default function InboxRoute() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="text-[13px] font-semibold">Inbox</h1>
        <span className="beam-meta">
          Assignments, mentions, comments and project updates
        </span>
      </header>
      <InboxList />
    </div>
  );
}
