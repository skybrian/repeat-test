import { PickRequest } from "./picks.ts";

export function shrinkPick(req: PickRequest, reply: number): Iterable<number> {
  if (reply === req.default) {
    return [];
  }
  return [req.default];
}
