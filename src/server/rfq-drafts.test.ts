import {describe,it,expect,vi,afterEach} from "vitest";
import {mockEvents} from "../lib/demo";
import {ROBOT_GOAL} from "../lib/examples";
import type {AgentEvent,Bom} from "../lib/schema";
import {ensureRfqDrafts} from "./rfq-drafts";
function fixture():Bom {const e=mockEvents("test",{goal:ROBOT_GOAL,budget:3500,currency:"AUD",shipTo:"Sydney, Australia",deadlineDays:21,replay:false}).at(-1)!;if(e.type!=="run_finished")throw new Error("Fixture");return e.bom;}
afterEach(()=>vi.unstubAllEnvs());
describe("supplier RFQ drafts",()=>{
  it("creates one personalised copyable draft per verified supplier",async()=>{const b=fixture();await ensureRfqDrafts(b,()=>{});const row=b.rows.find((r)=>r.needsQuote)!;expect(row.drafts).toHaveLength(2);expect(row.drafts![0].body).toContain("Hello Protolabs Network team");expect(row.drafts![1].body).toContain("Hello Xometry team");expect(row.drafts!.every((d)=>d.mode==="demo")).toBe(true);});
  it("does not create duplicate drafts on repeated calls",async()=>{const b=fixture();await ensureRfqDrafts(b,()=>{});await ensureRfqDrafts(b,()=>{});expect(b.rows.find((r)=>r.needsQuote)?.drafts).toHaveLength(2);});
  it("records real draft and thread IDs and isolates a failing supplier",async()=>{const b=fixture(),events:AgentEvent[]=[];b.demo=false;vi.stubEnv("MOCK","0");const createDraft=vi.fn().mockRejectedValueOnce(new Error("Supplier draft failed")).mockResolvedValueOnce({id:"real-draft",threadId:"real-thread",url:"https://mail.google.com/mail/u/0/#drafts"});await ensureRfqDrafts(b,e=>events.push(e),{createDraft});const row=b.rows.find(r=>r.needsQuote)!;expect(createDraft).toHaveBeenCalledTimes(2);expect(row.drafts![0].mode).toBe("clipboard");expect(row.drafts![1]).toMatchObject({id:"real-draft",threadId:"real-thread",mode:"gmail"});expect(events.some(e=>e.type==="error"&&e.scope==="rfq")).toBe(true);expect(events.filter(e=>e.type==="rfq_drafted")).toHaveLength(2);});
  it("does not invent a supplier or recipient when none was found",async()=>{const b=fixture(),row=b.rows.find(r=>r.needsQuote)!;row.suppliers=[];await ensureRfqDrafts(b,()=>{});expect(row.drafts).toHaveLength(0);});
});
