import { defineAction, embedApp } from "@agent-native/core";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

const DASHBOARD_PATH = "/dashboards/sundrift-product-traffic";
const DASHBOARD_ID = "sundrift-product-traffic";

export default defineAction({
  description:
    "Open the seeded Sundrift product traffic dashboard: sessions, conversion, and AOV for travel SKUs.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  mcpApp: {
    compactCatalog: true,
    resource: embedApp({
      title: "Sundrift product traffic",
      description: "Seeded travel-product sessions, conversion, and AOV.",
      iframeTitle: "Sundrift product traffic",
      openLabel: "Open product traffic",
      height: 900,
    }),
  },
  link: ({ result }) => {
    const url =
      result && typeof result === "object"
        ? (result as { url?: unknown }).url
        : null;
    if (typeof url !== "string" || !url) return null;
    return { url, label: "Open product traffic", view: "adhoc" };
  },
  run: async () => ({
    app: "analytics",
    view: "adhoc",
    dashboardId: DASHBOARD_ID,
    path: DASHBOARD_PATH,
    url: buildDeepLink({
      app: "analytics",
      view: "adhoc",
      to: DASHBOARD_PATH,
      params: { dashboardId: DASHBOARD_ID },
    }),
    embed: true,
    title: "Sundrift product traffic",
    message: "Sundrift product traffic dashboard is ready.",
  }),
});
