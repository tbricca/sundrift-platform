import { FavoritesList } from "@/components/favorites/FavoritesList";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Favorites — ${APP_TITLE}` }];
}

export default function FavoritesRoute() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="text-[13px] font-semibold">Favorites</h1>
        <span className="beam-meta">
          Issues, projects, views and cycles you have starred
        </span>
      </header>
      <FavoritesList />
    </div>
  );
}
