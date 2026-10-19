import type { Bom } from "../../lib/schema";
import { config } from "../config";
import { WatchEngine } from "./engine";
import { FileWatchStore } from "./store";
import { publish } from "./events";
import { recheck } from "./recheck";

type Runtime = {engine:WatchEngine;store:FileWatchStore;timer?:ReturnType<typeof setInterval>};
const globals=globalThis as typeof globalThis & {partscoutWatcher?:Runtime};
export function watchRuntime():Runtime {
  if(globals.partscoutWatcher)return globals.partscoutWatcher;
  const store=new FileWatchStore();
  const engine=new WatchEngine({store,publish,recheck,intervalSeconds:config().WATCH_INTERVAL_SECONDS});
  return globals.partscoutWatcher={store,engine};
}
export async function startWatcher() {
  const runtime=watchRuntime();if(runtime.timer)return;
  const tick=()=>runtime.engine.tick().catch(()=>publish({type:"error",scope:"watch",message:"Watch storage is unavailable. Existing data has not been replaced."}));
  runtime.timer=setInterval(()=>void tick(),1000);runtime.timer.unref();
  void tick();
}
export async function watchBom(bom:Bom) {await watchRuntime().engine.baseline(bom);}
