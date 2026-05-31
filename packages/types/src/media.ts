import { z } from 'zod';

export const MediaKindSchema = z.enum(['live_stream', 'match_video', 'clip']);
export type MediaKindDto = z.infer<typeof MediaKindSchema>;

const MediaPostFields = z.object({
  /** Event this post attaches to. Null/omitted for a profile-only post. */
  eventId: z.string().uuid().optional().nullable(),
  /** Reserved for Phase 2 (attach to a specific match). */
  matchId: z.string().uuid().optional().nullable(),
  kind: MediaKindSchema,
  videoUrl: z.string().url(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).default(''),
});

export const CreateMediaPostSchema = MediaPostFields;
export type CreateMediaPostDto = z.infer<typeof CreateMediaPostSchema>;

export const UpdateMediaPostSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  videoUrl: z.string().url().optional(),
});
export type UpdateMediaPostDto = z.infer<typeof UpdateMediaPostSchema>;
