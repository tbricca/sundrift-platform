import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { IconArrowRight } from "@tabler/icons-react";

export function PlaceholderPage({
  title,
  description,
  prompt,
}: {
  title: string;
  description: string;
  prompt: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-[13px] font-semibold">{title}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-dashed border-border">
            <span className="size-2.5 rounded-full bg-primary/60" />
          </div>
          <h2 className="mt-4 text-base font-semibold">{title}</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
            {description} This screen is a placeholder — it already runs on the
            shared issue query engine, so describe what you want here and it can
            be built out.
          </p>
          <button
            type="button"
            onClick={() =>
              sendToAgentChat({
                message: prompt,
                type: "code",
                openSidebar: true,
              })
            }
            className="mt-5 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium transition-colors hover:bg-accent"
          >
            Build this screen
            <IconArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
