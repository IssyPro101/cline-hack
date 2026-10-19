import type { AgentEvent, Bom, Change } from "../../lib/schema";
import type { WatchStore, Notifier } from "../adapters/interfaces";
import { diffBoms } from "./diff";

export type WatchDeps = {store:WatchStore;recheck:(bom:Bom)=>Promise<Bom>;publish:(event:AgentEvent)=>void;intervalSeconds:number;notifier?:Notifier;now?:()=>number};
export function summaryFor(bom:Bom,changes:Change[]) {
  const clean=(value:string)=>value.replace(/[<>]/g,"").replace(/@(?:here|channel|everyone)/gi,"[mention]");
  return `${bom.demo?"[DEMO DATA] ":""}PartScout Watch — ${clean(bom.input.goal.slice(0,140))}\n${changes.map((c)=>`• ${clean(c.partName)} / ${c.field}: ${clean(c.oldValue)} → ${clean(c.newValue)}${c.evidenceUrl?`\n  ${c.evidenceUrl}`:""}`).join("\n")}\nDecision: review changed availability, costs, and delivery before purchasing. No order or email was sent.`;
}
export class WatchEngine {
  private checking=false;
  constructor(private readonly deps:WatchDeps){}
  private now(){return this.deps.now?.()??Date.now();}
  async status(){
    const boms=await this.deps.store.getAll();
    const last=boms.flatMap((b)=>b.watch?.lastCheckedAt?[b.watch.lastCheckedAt]:[]).sort().at(-1);
    const next=boms.flatMap((b)=>b.watch?[b.watch.nextCheckAt]:[]).sort()[0];
    return {type:"watch_status" as const,watching:boms.length,lastCheckedAt:last,nextCheckAt:next,checking:this.checking,demo:boms.some((b)=>b.demo)};
  }
  async baseline(bom:Bom){
    if(!bom.rows.length)return;
    const previous=await this.deps.store.getLast(bom.runId);
    const saved={...bom,watch:bom.watch??previous?.watch??{nextCheckAt:new Date(this.now()+this.deps.intervalSeconds*1000).toISOString(),cycle:0,changes:[]}};
    await this.deps.store.save(saved);
    this.deps.publish({type:"bom_updated",bom:saved});
    this.deps.publish(await this.status());
  }
  async tick(){
    if(this.checking)return;
    this.checking=true;
    try {
      const boms=await this.deps.store.getAll();
      for(const baseline of boms) {
        if(!baseline.watch || Date.parse(baseline.watch.nextCheckAt)>this.now())continue;
        this.deps.publish(await this.status());
        const nextTime=()=>new Date(this.now()+this.deps.intervalSeconds*1000).toISOString();
        try {
          const updated=await this.deps.recheck(baseline);
          const at=new Date(this.now()).toISOString();
          const changes=diffBoms(baseline,updated,at);
          updated.watch={...baseline.watch,lastCheckedAt:at,nextCheckAt:nextTime(),cycle:baseline.watch.cycle+1,changes:[...changes,...baseline.watch.changes].slice(0,100)};
          // Persist the baseline before side effects; a failed notification cannot
          // cause repeated price alerts on every future cycle.
          await this.deps.store.save(updated);
          changes.forEach((change)=>this.deps.publish({type:"change_detected",...change,change}));
          if(changes.length){
            const summary=summaryFor(updated,changes);
            try {
              if(!this.deps.notifier)throw new Error("Slack is not connected. This summary is available in the Changes feed.");
              const sent=await this.deps.notifier.notifySelf(summary);
              updated.watch.notification={summary,status:"sent",at,...sent};
              this.deps.publish({type:"notification_sent",bomId:updated.runId,channel:"slack",...sent});
            } catch(error) {
              const reason=error instanceof Error?error.message:"Slack notification failed.";
              updated.watch.notification={summary,status:"fallback",at,error:reason};
              this.deps.publish({type:"notification_fallback",bomId:updated.runId,summary,reason});
            }
            await this.deps.store.save(updated);
          }
          this.deps.publish({type:"bom_updated",bom:updated});
        } catch(error) {
          // Preserve the old verified values after a failed check, then reschedule.
          await this.deps.store.save({...baseline,watch:{...baseline.watch,lastCheckedAt:new Date(this.now()).toISOString(),nextCheckAt:nextTime()}});
          this.deps.publish({type:"error",scope:"watch",bomId:baseline.runId,message:error instanceof Error?error.message:"Watch check failed; existing evidence preserved."});
        }
      }
    } finally {this.checking=false;this.deps.publish(await this.status());}
  }
}
