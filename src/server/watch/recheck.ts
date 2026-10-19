import type { Bom, BomRow } from "../../lib/schema";
import { config } from "../config";
import { CompatibleLLM } from "../adapters/llm";
import { ParallelResearch } from "../adapters/parallel";
import { crawl, withConcurrency } from "../crawler";
import { rankPart, fitBudget } from "../ranker";
import { report } from "../reporter";
import type { Run } from "../store";
import { publish } from "./events";
import { scriptedCheck } from "./demo";

export async function recheck(baseline:Bom):Promise<Bom> {
  const env=config();
  if(env.DEMO_SCRIPT==="1")return scriptedCheck(baseline);
  // Archived/illustrative pages never masquerade as a live lookup.
  if(baseline.demo || baseline.input.replay)return structuredClone(baseline);
  if(!env.PARALLEL_API_KEY || !env.LLM_API_KEY)throw new Error("Watch needs Parallel and LLM credentials. Previous evidence was preserved.");
  const run:Run={id:baseline.runId,input:baseline.input,events:[],startedAt:Date.now(),started:true,finished:false,listeners:new Set()};
  const llm=new CompatibleLLM(),research=new ParallelResearch();
  const rows:BomRow[]=[];
  await withConcurrency(baseline.rows,5,async old=>{
    if(old.part.category==="custom-fabricated"){rows.push(old);return;}
    try {
      const result=await crawl(run,old.part,research,llm);
      if(!result.candidates.some((c)=>!c.rejectedReason))throw new Error("No comparable listings were fetched.");
      const row=rankPart(old.part,result.candidates,result.suppliers,baseline.input,baseline.exchange);
      row.drafts=old.drafts;rows.push(row);
    } catch {
      rows.push(old);
      publish({type:"error",scope:"watch",bomId:baseline.runId,partId:old.part.id,message:`${old.part.name}: re-check failed; prior evidence retained.`});
    }
  });
  rows.sort((a,b)=>baseline.rows.findIndex((r)=>r.part.id===a.part.id)-baseline.rows.findIndex((r)=>r.part.id===b.part.id));
  return {...report(baseline.runId,baseline.input,fitBudget(rows,baseline.input,baseline.exchange),baseline.exchange,false),createdAt:baseline.createdAt};
}
