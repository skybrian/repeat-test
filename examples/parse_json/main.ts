import { linesFromSchema } from "./print.ts";
import { schema } from "./schema.ts";

async function readJson(stream: ReadableStream): Promise<unknown> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of stream) {
    out += decoder.decode(chunk);
  }
  return JSON.parse(out);
}

const json = await readJson(Deno.stdin.readable);
const parsed = schema.parse(json);
for (const line of linesFromSchema(parsed)) {
  console.log(line);
}
