import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bomSchema, type Bom } from "../../lib/schema";
import type { WatchStore } from "../adapters/interfaces";
import {withEvidenceTypes} from "../../lib/provenance";

const globalQueues = globalThis as typeof globalThis & { partscoutFileQueues?: Map<string, Promise<unknown>> };
const queues = globalQueues.partscoutFileQueues ??= new Map();
export class FileWatchStore implements WatchStore {
  constructor(readonly path = join(process.cwd(), "data", "watched-boms.json")) {}
  private async read(): Promise<Bom[]> {
    try { return z.array(bomSchema).parse(JSON.parse(await readFile(this.path,"utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new Error("Watch storage could not be read. The existing file has been preserved."); }
  }
  async getAll() { await (queues.get(this.path) ?? Promise.resolve()).catch(()=>{}); return this.read(); }
  async getLast(id: string) { return (await this.getAll()).find((bom)=>bom.runId===id) ?? null; }
  async save(bom: Bom) {
    const parsed = bomSchema.parse(withEvidenceTypes(bom));
    const pending = (queues.get(this.path) ?? Promise.resolve()).catch(()=>{}).then(async()=>{
      const boms = await this.read();
      const index = boms.findIndex((b)=>b.runId===parsed.runId);
      if(index===-1)boms.push(parsed);else boms[index]=parsed;
      await mkdir(dirname(this.path),{recursive:true,mode:0o700});
      const temp = `${this.path}.${randomUUID()}.tmp`;
      try { await writeFile(temp,JSON.stringify(boms,null,2)+"\n",{mode:0o600}); await rename(temp,this.path); }
      catch(error){await unlink(temp).catch(()=>{});throw error;}
    });
    queues.set(this.path,pending);
    try { await pending; } finally { if(queues.get(this.path)===pending)queues.delete(this.path); }
  }
}
