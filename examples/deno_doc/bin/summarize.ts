#!/usr/bin/env -S deno --allow-read --allow-run

import { type DenoDoc, denoDoc } from "../schema.ts";
import { linesFromDenoDoc } from "../print.ts";

function runDeno(args: string[]): string {
  const execPath = Deno.execPath();
  const cmd = new Deno.Command(execPath, { args });
  const { code, stdout, stderr } = cmd.outputSync();
  if (code !== 0) {
    console.error(new TextDecoder().decode(stderr));
    throw new Error(`deno exited with code ${code}`);
  }
  return new TextDecoder().decode(stdout);
}

function readDenoDoc(sourceFile: string): DenoDoc {
  const stdout = runDeno(["doc", "--json", sourceFile]);
  return denoDoc.parse(JSON.parse(stdout));
}

const args = Deno.args;
if (args.length !== 1 || args[0].startsWith("-")) {
  console.error("Usage: ex/summarize.ts path/to/file.ts");
  Deno.exit(1);
}

const parsed = readDenoDoc(args[0]);
for (const line of linesFromDenoDoc(parsed)) {
  console.log(line);
}
