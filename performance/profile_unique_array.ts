import * as dom from "@/doms.ts";

dom.uniqueArray(dom.int32(), { length: 100 });
console.profile();
for (let i = 0; i < 10000; i++) {
  dom.uniqueArray(dom.int32(), { length: 100 });
}
console.profileEnd();
