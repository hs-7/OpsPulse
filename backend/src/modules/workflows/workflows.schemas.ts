import { z } from "zod";

export const workflowSchema = z.object({
  name: z.string().trim().min(1).max(255),
  definition: z.record(z.unknown()),
  active: z.boolean().default(true),
});
