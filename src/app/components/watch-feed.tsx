"use client";
import {useEffect,useRef,useState} from "react";
import {Bell,Radio,ArrowRight,ArrowUpRight,Check,MessageSquare,FlaskConical,LoaderCircle} from "lucide-react";
import {agentEventSchema,type Bom,type Change} from "@/lib/schema";

type Props={onBom:(bom:Bom)=>void};
export function WatchFeed({onBom}:Props) {
  const callback=useRef(onBom);callback.current=onBom;
  const [changes,setChanges]=useState<Change[]>([]),[unread,setUnread]=useState(0);
  const [status,setStatus]=useState<{watching:number;lastCheckedAt?:string;nextCheckAt?:string;checking?:boolean;demo?:boolean}>({watching:0});
  const [now,setNow]=useState(()=>Date.now()),[connected,setConnected]=useState(false),[notice,setNotice]=useState<{summary:string;reason?:string;url?:string}|null>(null);
  useEffect(()=>{
    const source=new EventSource("/api/watch/events");
    source.onopen=()=>setConnected(true);source.onerror=()=>setConnected(false);
    source.onmessage=({data})=>{
      const parsed=agentEventSchema.safeParse(JSON.parse(data));if(!parsed.success)return;const event=parsed.data;
      if(event.type==="watch_status")setStatus(event);
      if(event.type==="watch_snapshot") {
        const history=event.boms.flatMap((b)=>b.watch?.changes??[]).sort((a,b)=>b.detectedAt.localeCompare(a.detectedAt));
        setChanges(history);setUnread(history.length);
        const latest=event.boms.flatMap((b)=>b.watch?.notification?[b.watch.notification]:[]).sort((a,b)=>b.at.localeCompare(a.at))[0];
        if(latest)setNotice({summary:latest.summary,reason:latest.status==="fallback"?latest.error:undefined,url:latest.url});
        const last=event.boms.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];if(last)callback.current(last);
      }
      if(event.type==="change_detected"&&event.change){const change=event.change;setChanges((old)=>[change,...old.filter((c)=>c.id!==change.id)].slice(0,100));setUnread((n)=>n+1);}
      if(event.type==="bom_updated")callback.current(event.bom);
      if(event.type==="notification_fallback")setNotice({summary:event.summary,reason:event.reason});
      if(event.type==="notification_sent")setNotice((old)=>({summary:old?.summary??"Watch summary delivered to your own Slack DM.",url:event.url}));
      if(event.type==="error"&&event.scope==="watch")setNotice({summary:event.message,reason:"Watch retained the previous evidence and will retry on schedule."});
    };
    const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{source.close();clearInterval(timer);};
  },[]);
  const remaining=status.nextCheckAt?Math.max(0,Math.ceil((Date.parse(status.nextCheckAt)-now)/1000)):null;
  const countdown=remaining===null?"—":remaining>=3600?`${Math.floor(remaining/3600)}h ${Math.floor(remaining%3600/60)}m`:remaining>=60?`${Math.floor(remaining/60)}m ${remaining%60}s`:`${remaining}s`;
  return <section className="watch-panel" aria-label="Autonomous BOM watch"><div className="watch-heading"><div><span className={`watch-pulse ${connected?"":"offline"}`}/><Radio size={16}/><h2>Watching {status.watching} BOM{status.watching===1?"":"s"}</h2>{status.checking&&<LoaderCircle size={13} className="spin"/>}</div><span>{status.demo&&<span className="watch-demo"><FlaskConical size={11}/>Demo data</span>}{connected?"AUTONOMOUS":"RECONNECTING"}</span></div><div className="watch-status"><span>Last checked {status.lastCheckedAt?new Date(status.lastCheckedAt).toLocaleTimeString():"not yet"}</span><span>{status.watching?`Next check in ${countdown}`:"Your next completed build will be watched automatically."}</span></div><div className="changes-heading"><h3><Bell size={14}/>Changes{unread>0&&<span>{unread} unread</span>}</h3>{unread>0&&<button onClick={()=>setUnread(0)}><Check size={12}/>Mark read</button>}</div>{!changes.length?<p className="watch-empty">{status.watching?"Watching prices, stock and lead times. Material changes will appear here automatically.":"No manual re-checks. Every finished BOM becomes a baseline."}</p>:<div className="changes-list" aria-live="polite">{changes.map((change)=><article className="change-item" key={change.id}><div><strong>{change.partName}</strong><span>{change.field}</span>{change.demo&&<small>DEMO DATA</small>}<time>{new Date(change.detectedAt).toLocaleTimeString()}</time></div><p><span>{change.oldValue}</span><ArrowRight size={13}/><strong>{change.newValue}</strong>{change.evidenceUrl&&<a href={change.evidenceUrl} target="_blank" rel="noopener noreferrer">Evidence<ArrowUpRight size={12}/></a>}</p></article>)}</div>}{notice&&<details className={`watch-notification ${notice.reason?"notification-fallback":""}`}><summary><MessageSquare size={13}/>{notice.reason?"Slack fallback — summary available here":"Slack · own DM"}{notice.url&&<a href={notice.url} target="_blank" rel="noopener noreferrer">Open<ArrowUpRight size={11}/></a>}</summary>{notice.reason&&<p>{notice.reason}</p>}<pre>{notice.summary}</pre></details>}</section>;
}
