import { nanoid } from "nanoid";

export const createIdempotencyKey = (prefix: string): string => `${prefix}_${nanoid(24)}`;
