import { SavedViewList } from "@/components/views/SavedViewList";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Views — ${APP_TITLE}` }];
}

export default function ViewsRoute() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="text-[13px] font-semibold">Views</h1>
        <span className="beam-meta">Saved issue queries</span>
      </header>
      <SavedViewList />
    </div>
  );
}
