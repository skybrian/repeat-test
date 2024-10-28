import type { Pickable, PickFunctionOpts } from "@/arbitrary.ts";
import type { PickFunction } from "./pickable.ts";
import type { GroupEdit, MultiEdit } from "./edits.ts";
import type { PickList } from "./picks.ts";
import type { CallBuffer } from "./calls.ts";

import { assert } from "@std/assert";
import { Filtered } from "@/arbitrary.ts";
import { filtered } from "./results.ts";
import { PickRequest } from "./picks.ts";
import { Script } from "./script_class.ts";
import { makePickFunction } from "./build.ts";
import { EditResponder, keep } from "./edits.ts";
import { allReplies, Call, regen } from "./calls.ts";

/**
 * Runs a script by replaying a list of calls.
 */
export function replay<T>(
  target: Script<T>,
  calls: Call[],
): T | typeof filtered {
  const replay = new Replay();
  let i = 0;
  const pick: PickFunction = (req, opts) => {
    const input = calls[i++] ?? Call.none;
    return replay.dispatch(input, keep, req, opts);
  };
  return target.run(pick);
}

export const unchanged = Symbol("unchanged");

/**
 * Runs a script by replying a list of calls, after applying the given edits.
 */
export function replayWithEdits<T>(
  target: Script<T>,
  calls: Call[],
  edits: MultiEdit,
  log?: CallBuffer,
): T | typeof unchanged | typeof filtered {
  if (!target.logCalls) {
    // Record a single call.
    const picks = new EditResponder(allReplies(calls), edits(0));
    const pick = makePickFunction(picks, { logPicks: log });
    const val = target.run(pick);
    if (val === filtered) {
      return filtered;
    }
    log?.endScript(target, val);
    return picks.edited ? val : unchanged;
  }

  const replay = new Replay(log);
  let i = 0;
  const pickWithEdit: PickFunction = (req, opts) => {
    const next = i++;
    const input = calls[next] ?? Call.none;
    const edit = edits(next);
    return replay.dispatch(input, edit, req, opts);
  };

  const val = target.run(pickWithEdit);
  if (val === filtered) {
    return filtered;
  }
  return replay.edited ? val : unchanged;
}

/**
 * Runs a script by replaying a list of calls, after deleting the calls in the given range.
 */
export function replayWithDeletedRange<T>(
  target: Script<T>,
  calls: Call[],
  start: number,
  end: number,
  log?: CallBuffer,
): T | typeof unchanged | typeof filtered {
  assert(start < end);

  const replay = new Replay(log);
  let i = 0;
  const pick: PickFunction = (req, opts) => {
    if (i === start) {
      i = end;
      replay.edited = true;
    }
    const next = i++;
    const input = calls[next] ?? Call.none;
    return replay.dispatch(input, keep, req, opts);
  };

  const val = target.run(pick);
  if (val === filtered) {
    return filtered;
  }
  return replay.edited ? val : unchanged;
}

/**
 * Replays a sequence of pick calls, possibly with edits.
 */
class Replay {
  edited = false;

  constructor(
    readonly log?: CallBuffer,
  ) {}

  dispatch<T>(
    input: Call,
    edit: GroupEdit,
    req: Pickable<T>,
    opts?: PickFunctionOpts<T>,
  ): T {
    if (req instanceof PickRequest) {
      return this.handlePick(req, input.group, edit);
    }

    const val = this.handleScript(Script.from(req), input, edit);

    const accept = opts?.accept;
    if (accept !== undefined && !accept(val)) {
      throw new Filtered("not accepted");
    }
    return val;
  }

  private handlePick<T>(
    req: PickRequest,
    group: PickList,
    groupEdit: GroupEdit,
  ): T {
    const before = group.length === 0 ? req.min : group.replyAt(0);
    const edit = groupEdit(0, req, before);
    const responder = new EditResponder([before], () => edit);
    const reply = responder.nextPick(req);
    this.log?.push(req, reply);
    this.log?.endPick();
    if (responder.edited) {
      this.edited = true;
    }
    return reply as T;
  }

  private handleScript<T>(
    script: Script<T>,
    before: Call<unknown>,
    groupEdit: GroupEdit,
  ): T {
    if (
      groupEdit === keep && before.val !== regen &&
      before.arg === script
    ) {
      // Skip the script call and return the cached value.
      this.log?.keep(before);
      return before.val as T;
    }

    const responder = new EditResponder(before.group.replies, groupEdit);
    const pick = makePickFunction(responder, { logPicks: this.log });
    const val = script.directBuild(pick);
    this.log?.endScript(script, val);
    if (responder.edited) {
      this.edited = true;
    }
    return val;
  }
}
