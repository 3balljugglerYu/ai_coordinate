export interface BlockedUserItem {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface ReportedContentItem {
  postId: string;
  categoryId: string;
  subcategoryId: string;
  reportedAt: string;
  imageUrl: string | null;
  caption: string | null;
  isPosted: boolean;
  moderationStatus: "visible" | "pending" | "removed" | null;
}
