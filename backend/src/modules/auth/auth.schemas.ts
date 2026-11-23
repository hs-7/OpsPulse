import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  organizationName: z.string().trim().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
