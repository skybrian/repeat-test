import * as dom from "@/doms.ts";

console.profile();
dom.uniqueArray(dom.int32(), { length: 5 });
console.profileEnd();
