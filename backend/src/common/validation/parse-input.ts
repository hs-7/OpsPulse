import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

export function parseInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join(", "),
    );
  }
  return result.data;
}
