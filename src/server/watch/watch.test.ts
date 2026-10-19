import {describe,it,expect,afterEach} from "vitest";
import {mkdtemp,readFile,readdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {mockEvents} from "../../lib/demo";
import {ROBOT_GOAL} from "../../lib/examples";
import type {AgentEvent,Bom} from "../../lib/schema";
import type {WatchStore} from "../adapters/interfaces";
import {FileWatchStore} from "./store";
import {WatchEngine} from "./engine";
import {diffBoms} from "./diff";
import {scriptedCheck} from "./demo";

function bom(id="test"):Bom {const e=mockEvents(id,{goal:ROBOT_GOAL,budget:3500,currency:"AUD",shipTo:"Sydney, Australia",deadlineDays:21,replay:false}).at(-1)!;if(e.type!=="run_finished")throw new Error("Fixture failed");return e.bom;}
function memory():WatchStore {const data=new Map<string,Bom>();return {async save(b){data.set(b.runId,structuredClone(b));},async getAll(){return [...data.values()].map((b)=>structuredClone(b));},async getLast(id){return structuredClone(data.get(id)??null);}};}
describe("material Watch diffs",()=>{
  it("ignores unchanged values and source timestamps",()=>{const a=bom(),b=structuredClone(a);b.rows[0].fields.price.evidence[0].checkedAt=new Date().toISOString();expect(diffBoms(a,b)).toHaveLength(0);});
  it("ignores prices at 5 percent and times at three days",()=>{const a=bom(),b=structuredClone(a);const price=b.rows[0].fields.price;price.value=Number(price.value)*1.05;price.min=price.min!*1.05;price.max=price.max!*1.05;const time=b.rows[0].fields.leadTimeDays;time.value=Number(time.value)+3;time.min!+=3;time.max!+=3;expect(diffBoms(a,b)).toHaveLength(0);});
  it("reports a price change beyond five percent with evidence",()=>{const a=bom(),b=scriptedCheck(a);const changes=diffBoms(a,b);expect(changes).toHaveLength(1);expect(changes[0]).toMatchObject({field:"price",partId:"arm",demo:true});expect(changes[0].evidenceUrl).toMatch(/^https:/);});
  it("reports stock and verification-status changes",()=>{const a=bom(),b=structuredClone(a);b.rows[0].fields.stock.value="out";b.rows[1].fields.price.status="conflicting";expect(diffBoms(a,b).map((c)=>c.field)).toEqual(["stock","price"]);});
  it("ignores a replaced source URL when the verified facts are unchanged",()=>{const a=bom(),b=structuredClone(a);b.rows[0].pick!.productUrl="https://other.example";expect(diffBoms(a,b)).toHaveLength(0);});
});
describe("Watch scheduling and recovery",()=>{
  it("automatically establishes a baseline and next-check time",async()=>{const store=memory(),engine=new WatchEngine({store,intervalSeconds:60,recheck:async b=>b,publish:()=>{},now:()=>100000});await engine.baseline(bom());expect((await store.getLast("test"))?.watch?.nextCheckAt).toBe(new Date(160000).toISOString());});
  it("never overlaps checks, including across different BOMs",async()=>{const store=memory();let release=()=>{},active=0,max=0,calls=0;const gate=new Promise<void>(r=>{release=r;});const engine=new WatchEngine({store,intervalSeconds:1,now:()=>100000,publish:()=>{},recheck:async b=>{active++;calls++;max=Math.max(max,active);await gate;active--;return b;}});for(const id of ["one","two"]){const b=bom(id);b.watch={nextCheckAt:new Date(0).toISOString(),cycle:0,changes:[]};await store.save(b);}const first=engine.tick();await Promise.resolve();await engine.tick();release();await first;expect(calls).toBe(2);expect(max).toBe(1);});
  it("retains old data after a failure and continues the next BOM",async()=>{const store=memory(),events:AgentEvent[]=[];for(const id of ["broken","good"]){const b=bom(id);b.watch={nextCheckAt:new Date(0).toISOString(),cycle:0,changes:[]};await store.save(b);}const engine=new WatchEngine({store,intervalSeconds:60,now:()=>100000,publish:e=>events.push(e),recheck:async b=>{if(b.runId==="broken")throw new Error("Supplier outage");return scriptedCheck(b);}});await engine.tick();expect((await store.getLast("broken"))?.total).toBe(bom().total);expect(events.some(e=>e.type==="error"&&e.bomId==="broken")).toBe(true);expect(events.some(e=>e.type==="change_detected"&&e.bomId==="good")).toBe(true);});
  it("uses a UI fallback after notifier failure and updates the baseline",async()=>{const store=memory(),events:AgentEvent[]=[];let now=100000;const b=bom();b.watch={nextCheckAt:new Date(0).toISOString(),cycle:0,changes:[]};await store.save(b);const engine=new WatchEngine({store,intervalSeconds:60,now:()=>now,publish:e=>events.push(e),recheck:async b=>scriptedCheck(b),notifier:{async notifySelf(){throw new Error("Disconnected Slack");}}});await engine.tick();expect(events.some(e=>e.type==="notification_fallback")).toBe(true);const saved=await store.getLast("test");expect(saved?.watch?.cycle).toBe(1);expect(saved?.watch?.notification?.status).toBe("fallback");expect(saved?.total).toBeLessThan(b.total);});
  it("emits notification_sent only after a successful notification",async()=>{const store=memory(),events:AgentEvent[]=[];const b=bom();b.watch={nextCheckAt:new Date(0).toISOString(),cycle:0,changes:[]};await store.save(b);const engine=new WatchEngine({store,intervalSeconds:60,now:()=>100000,publish:e=>events.push(e),recheck:async b=>scriptedCheck(b),notifier:{async notifySelf(){return {url:"https://slack.com/app_redirect?channel=DSELF"};}}});await engine.tick();expect(events.some(e=>e.type==="notification_sent")).toBe(true);});
});
describe("atomic file Watch store",()=>{
  it("survives a new store instance and concurrent writes",async()=>{const dir=await mkdtemp(join(tmpdir(),"partscout-watch-")),path=join(dir,"watched-boms.json");const a=new FileWatchStore(path),b=new FileWatchStore(path);await Promise.all([a.save(bom("one")),b.save(bom("two"))]);const restored=new FileWatchStore(path);expect((await restored.getAll()).map(b=>b.runId).sort()).toEqual(["one","two"]);expect(await readdir(dir)).toEqual(["watched-boms.json"]);});
  it("never overwrites a corrupt existing file",async()=>{const dir=await mkdtemp(join(tmpdir(),"partscout-watch-")),path=join(dir,"watched-boms.json");await writeFile(path,"not valid JSON");await expect(new FileWatchStore(path).save(bom())).rejects.toThrow("preserved");expect(await readFile(path,"utf8")).toBe("not valid JSON");});
});
