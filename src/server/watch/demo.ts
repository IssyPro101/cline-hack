import type { Bom } from "../../lib/schema";
import { rankPart } from "../ranker";
import { report } from "../reporter";

export function scriptedCheck(baseline: Bom): Bom {
  const copy=structuredClone(baseline), cycle=baseline.watch?.cycle??0;
  const row=copy.rows.find((r)=>!r.needsQuote&&r.candidates.length>0);
  if(row)for(const listing of row.candidates) {
    if(listing.rejectedReason)continue;
    if(cycle%2===0 && listing.price) {
      listing.price.amount=Math.round(listing.price.amount*.9*100)/100;
      listing.evidence=listing.evidence.map((e)=>e.field==="price"?{...e,value:listing.price!.amount,quote:`Scripted demo: ${listing.price!.currency} ${listing.price!.amount.toFixed(2)} per ${listing.price!.qty} unit(s).`,checkedAt:new Date().toISOString(),sourceType:"web"}:e);
    } else if(cycle%2===1) {
      listing.stock=listing.stock==="low"?"in_stock":"low";
      listing.evidence=listing.evidence.map((e)=>e.field==="stock"?{...e,value:listing.stock!,quote:`Scripted demo: ${listing.stock==="low"?"limited stock":"in stock"}.`,checkedAt:new Date().toISOString(),sourceType:"web"}:e);
    }
  }
  const rows=copy.rows.map((r)=>({...rankPart(r.part,r.candidates,r.suppliers,copy.input,copy.exchange),drafts:r.drafts}));
  return {...report(copy.runId,copy.input,rows,copy.exchange,true),createdAt:baseline.createdAt};
}
