import { integer, real, table, text } from "@agent-native/core/db/schema";

export const campaignPlans = table("campaign_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  productId: text("product_id").notNull(),
  windowDays: integer("window_days").notNull(),
  referenceDays: integer("reference_days").notNull(),
  sessionLiftPct: real("session_lift_pct").notNull(),
  conversionLiftPp: real("conversion_lift_pp").notNull(),
  aovLiftPct: real("aov_lift_pct").notNull(),
  status: text("status").notNull().default("active"),
  comparableLabel: text("comparable_label").notNull().default(""),
  notes: text("notes").notNull().default(""),
  category: text("category").notNull().default("Travel"),
  campaignKeywords: text("campaign_keywords").notNull().default(""),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
