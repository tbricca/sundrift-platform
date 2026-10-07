import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link } from "react-router";

type CampaignCard = {
  id: string;
  name: string;
  productName: string;
  status: string;
  simulation: {
    simulatedRevenue: number;
    simulatedSessions: number;
  } | null;
};

export function meta() {
  return [{ title: "Campaigns — Campaign Planner" }];
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CampaignsRoute() {
  const list = useActionQuery("list-campaigns", {});
  const campaigns = (list.data?.campaigns ?? []) as CampaignCard[];

  return (
    <div className="desk min-h-full px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
          Sundrift
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-stone-900">Campaigns</h1>
        {list.isLoading ? (
          <div className="mt-6 h-32 animate-pulse rounded-xl bg-stone-200/70" />
        ) : (
          <ul className="mt-6 divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  to={`/campaign/${campaign.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-stone-50"
                >
                  <span>
                    <span className="block text-sm font-medium">{campaign.name}</span>
                    <span className="block text-xs text-stone-500">
                      {campaign.productName} · {campaign.status}
                    </span>
                  </span>
                  <span className="text-sm text-emerald-700">
                    {campaign.simulation
                      ? money(campaign.simulation.simulatedRevenue)
                      : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
