import { z } from "zod";

export const incidentSchema = z.object({
  title: z.string().trim().min(1).max(255),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  status: z
    .enum(["open", "investigating", "resolved", "closed"])
    .default("open"),
});
