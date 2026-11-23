import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export const addMemberSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});
