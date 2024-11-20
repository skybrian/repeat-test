import { linesFromDenoDoc } from "./print.ts";
import { denoDoc } from "./schema.ts";

async function readJson(stream: ReadableStream): Promise<unknown> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of stream) {
    out += decoder.decode(chunk);
  }
  return JSON.parse(out);
}

const json = await readJson(Deno.stdin.readable);
const parsed = denoDoc.parse(json);
for (const line of linesFromDenoDoc(parsed)) {
  console.log(line);
}
