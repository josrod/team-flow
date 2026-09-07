// Service layer for blocker reviews: "mark as reviewed" marks and owner
// suggestions stored in Lovable Cloud. Reads are public (the app is read-only
// for visitors); writes are restricted to the admin by RLS.
import { supabase } from "@/integrations/supabase/client";
import type { BacklogAlertKind, BlockerReviewKey } from "@/lib/backlogAlerts";

export interface BlockerReview {
  id: string;
  itemId: number;
  kind: BacklogAlertKind;
  person: string | null;
  reason: string | null;
  suggestedMemberId: string | null;
  reviewedAt: string;
  expiresAt: string;
}

interface BlockerReviewRow {
  id: string;
  item_id: number;
  alert_kind: string;
  person: string | null;
  reason: string | null;
  suggested_member_id: string | null;
  reviewed_at: string;
  expires_at: string;
}

const toReview = (row: BlockerReviewRow): BlockerReview => ({
  id: row.id,
  itemId: Number(row.item_id),
  kind: row.alert_kind as BacklogAlertKind,
  person: row.person,
  reason: row.reason,
  suggestedMemberId: row.suggested_member_id,
  reviewedAt: row.reviewed_at,
  expiresAt: row.expires_at,
});

/** Active (not yet expired) reviews. */
export const listActiveBlockerReviews = async (): Promise<BlockerReview[]> => {
  const { data, error } = await supabase
    .from("backlog_blocker_reviews")
    .select("id, item_id, alert_kind, person, reason, suggested_member_id, reviewed_at, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("reviewed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => toReview(row as BlockerReviewRow));
};

export interface SaveBlockerReviewInput {
  itemId: number;
  kind: BacklogAlertKind;
  person?: string | null;
  reason?: string | null;
  suggestedMemberId?: string | null;
  /** Days the blocker stays hidden. Defaults to 7. */
  days?: number;
}

export const saveBlockerReview = async (input: SaveBlockerReviewInput): Promise<BlockerReview> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const expires = new Date(Date.now() + (input.days ?? 7) * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("backlog_blocker_reviews")
    .insert({
      item_id: input.itemId,
      alert_kind: input.kind,
      person: input.person ?? null,
      reason: input.reason ?? null,
      suggested_member_id: input.suggestedMemberId ?? null,
      reviewed_by: user?.id ?? null,
      expires_at: expires,
    })
    .select("id, item_id, alert_kind, person, reason, suggested_member_id, reviewed_at, expires_at")
    .single();
  if (error) throw error;
  return toReview(data as BlockerReviewRow);
};

export const deleteBlockerReview = async (id: string): Promise<void> => {
  const { error } = await supabase.from("backlog_blocker_reviews").delete().eq("id", id);
  if (error) throw error;
};

/** Maps reviews to the keys `buildBacklogAlerts` uses to hide them. */
export const toReviewKeys = (reviews: readonly BlockerReview[]): BlockerReviewKey[] =>
  reviews.map((review) => ({ itemId: review.itemId, kind: review.kind, person: review.person }));
