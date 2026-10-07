import { useActionMutation } from "@agent-native/core/client/hooks";
import { IconLoader2 } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

const STEPS = [
  {
    title: "Preparing campaign",
    description: "Understanding the campaign details and product category",
  },
  {
    title: "Gathering workspace data",
    description: "Checking the seeded Analytics snapshot and past campaigns",
  },
  {
    title: "Building campaign plan",
    description: "Combining the financial model with the Sundrift catalog",
  },
];

type BuildState = {
  name?: string;
  campaignKeywords?: string;
  description?: string;
};

export function meta() {
  return [{ title: "Campaign Planner - Building campaign" }];
}

export default function CampaignBuildRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as BuildState;
  const name = state.name?.trim() ?? "";
  const campaignKeywords = state.campaignKeywords?.trim() ?? "";
  const description = state.description?.trim() ?? "";
  const started = useRef(false);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const create = useActionMutation("create-campaign");

  useEffect(() => {
    if (!name || !campaignKeywords || !description) {
      navigate("/new-campaign", { replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;
    const timers = STEPS.map((_, index) =>
      window.setTimeout(() => setStep(index + 1), 400 * (index + 1)),
    );
    create.mutate(
      { name, campaignKeywords, description },
      {
        onSuccess: (result) => {
          setStep(STEPS.length);
          setReady(true);
          window.setTimeout(() => {
            if (result?.id) navigate(`/campaign/${result.id}`, { replace: true });
          }, 700);
        },
      },
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [campaignKeywords, create, description, name, navigate]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <p className="text-muted-foreground text-sm">{campaignKeywords}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ready ? "Campaign ready" : "Building your campaign"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {ready
            ? "Opening the completed campaign…"
            : "Pulling together the seeded product snapshot and campaign history."}
        </p>
      </div>
      <ol className="grid gap-3" aria-live="polite">
        {STEPS.map((item, index) => (
          <li key={item.title} className="flex items-start gap-3">
            {index < step ? (
              <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">
                ✓
              </span>
            ) : (
              <IconLoader2 className="text-muted-foreground mt-0.5 size-5 animate-spin" />
            )}
            <span>
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="text-muted-foreground block text-sm">{item.description}</span>
            </span>
          </li>
        ))}
      </ol>
      {create.isError ? (
        <div className="text-sm">
          <p className="text-destructive">
            {create.error?.message ?? "The campaign could not be built."}
          </p>
          <Link to="/new-campaign" className="mt-2 inline-block font-medium underline">
            Return to campaign settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
