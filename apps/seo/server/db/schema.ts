import { integer, table, text } from "@agent-native/core/db/schema";

export const researchReports = table("seo_research_reports", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull(),
  country: text("country").notNull(),
  request: text("request").notNull(),
  volume: integer("volume").notNull(),
  keywordDifficulty: integer("keyword_difficulty").notNull(),
  researchedAt: text("researched_at").notNull(),
  sourceLabel: text("source_label").notNull(),
  relatedJson: text("related_json").notNull(),
  serpJson: text("serp_json").notNull(),
  suggestedResponse: text("suggested_response").notNull().default(""),
  fullReport: text("full_report").notNull().default(""),
  productId: text("product_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditEntries = table("seo_audit_entries", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  team: text("team").notNull(),
  requestedAt: text("requested_at").notNull(),
  summary: text("summary").notNull(),
  detail: text("detail").notNull().default(""),
  status: text("status").notNull().default("open"),
  researchId: text("research_id"),
  mailboxMessageId: text("mailbox_message_id"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
