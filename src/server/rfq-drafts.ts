import {randomUUID} from "node:crypto";
import type {AgentEvent,Bom,RfqDraft} from "../lib/schema";
import type {Mail} from "./adapters/interfaces";
import {ComposioDrafts} from "./adapters/composio";
import {config} from "./config";
import {rfqText} from "./rfq";

export async function ensureRfqDrafts(bom:Bom,emit:(event:AgentEvent)=>void,mail:Mail|undefined=undefined) {
  const env=config();
  const connected=Boolean(env.COMPOSIO_API_KEY&&env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID);
  const real=!bom.demo&&!bom.input.replay&&env.MOCK==="0";
  const service=mail??(real&&connected?new ComposioDrafts():undefined);
  for(const row of bom.rows.filter((r)=>r.needsQuote)) {
    if(!row.suppliers.length)row.suppliers=[...new Map(row.candidates.filter((c)=>!c.rejectedReason).map((c)=>[new URL(c.productUrl).hostname,{name:c.supplier,url:c.productUrl,evidence:c.evidence}])).values()].slice(0,3);
    row.drafts??=[];
    if(!row.suppliers.length)emit({type:"error",scope:"rfq",partId:row.part.id,message:`${row.part.name}: no verified supplier contact page was found, so no supplier draft was invented.`});
    for(const supplier of row.suppliers.slice(0,3)) {
      if(row.drafts.some((d)=>d.supplierUrl===supplier.url))continue;
      const text=rfqText(row,bom.input,Date.parse(bom.createdAt),supplier);
      let draft:RfqDraft={...text,id:`local-${randomUUID()}`,supplier:supplier.name,supplierUrl:supplier.url,to:supplier.email,mode:bom.demo||bom.input.replay?"demo":"clipboard",createdAt:new Date().toISOString()};
      if(service)try {
        const result=await service.createDraft({...text,to:supplier.email});
        draft={...draft,...result,mode:"gmail"};
      }catch {
        emit({type:"error",scope:"rfq",partId:row.part.id,message:`${supplier.name}: Gmail could not create a draft. The supplier-specific text is preserved for copying${supplier.email?"":"; add the recipient after checking their contact page"}.`});
      }
      row.drafts.push(draft);
      emit({type:"rfq_drafted",partId:row.part.id,supplier:supplier.name,draftId:draft.id,url:draft.url});
    }
  }
  return bom;
}
