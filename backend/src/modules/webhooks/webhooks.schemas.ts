import { z } from "zod";

export const createEndpointSchema = z.object({
  projectId: z.string().uuid(),
  endpointUrl: z.string().url(),
});

export const projectIdSchema = z.string().uuid();
