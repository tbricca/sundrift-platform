import { navigateWithAgentChatViewTransition } from "@agent-native/core/client/agent-chat";
import { focusAgentChat } from "@agent-native/toolkit/app/chat";
import { AgentSidebar } from "@agent-native/toolkit/app/chat";
import { type ReactNode } from "react";
import { useNavigate } from "react-router";

import { TAB_ID } from "@/lib/tab-id";

interface AgentInspectorProps {
  children: ReactNode;
  chatHomeHandoffActive: boolean;
  chatHomeHandoffPending: boolean;
}

/** Contextual inspector shell used on secondary chat routes. */
export function AgentInspector({
  children,
  chatHomeHandoffActive,
  chatHomeHandoffPending,
}: AgentInspectorProps) {
  const navigate = useNavigate();

  function openAskAgentFullscreen(threadId?: string) {
    focusAgentChat();
    navigateWithAgentChatViewTransition(
      navigate,
      threadId ? `/chat/${encodeURIComponent(threadId)}` : "/home",
    );
  }

  return (
    <AgentSidebar
      position="right"
      chatViewTransition
      chatViewTransitionHandoff={chatHomeHandoffPending}
      storageKey="campaign-planner"
      browserTabId={TAB_ID}
      openOnChatRunning={chatHomeHandoffActive}
      onFullscreenRequest={openAskAgentFullscreen}
      emptyStateText="Ask about a Sundrift campaign, the revenue simulator, or a comparable push."
      agentPageHref="/settings/agent"
      suggestions={[
        "Research campaigns similar to the Midwest Weekender push",
        "Explain the Weekender revenue projection",
        "Which product has the highest seeded AOV?",
      ]}
    >
      {children}
    </AgentSidebar>
  );
}
