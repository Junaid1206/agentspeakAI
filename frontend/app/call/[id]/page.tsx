"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
type Frame = { type: string; message?: string; detail?: string; should_end_call?: boolean };
export default function VoiceCallPage() {
  const params = useParams<{ id: string }>();
  const callId = Number(params.id);
  const [phase, setPhase] = useState("ready");
  const [messages, setMessages] = useState<{speaker:string;text:string}[]>([]);
  const [error, setError] = useState("");
  const [live, setLive] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const recognition = useRef<any>(null);
  const ended = useRef(false);
  const speak = (text: string) => new Promise<void>(resolve => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve(); utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
  const listen = () => {
    if (ended.current) return;
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) { setError("Speech recognition is not supported. Use Chrome or Edge."); setPhase("failed"); return; }
    const rec = new Speech(); recognition.current = rec; rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (event: any) => {
      let finalText = "";
      let interim = "";
      for (let i=event.resultIndex;i<event.results.length;i++) {
        if(event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setLive(interim);
      if(finalText.trim() && socket.current?.readyState===WebSocket.OPEN) {
        setLive(""); setMessages(old=>[...old,{speaker:"customer",text:finalText.trim()}]); setPhase("thinking");
        socket.current.send(JSON.stringify({type:"customer_message",message:finalText.trim()}));
      }
    };
    rec.onerror = (e:any) => { if(e.error!=="no-speech"&&e.error!=="aborted")setError("Speech recognition: "+e.error); };
    rec.onend = () => { if(!ended.current && phase==="listening") setTimeout(()=>{if(!ended.current)listen()},250); };
    setPhase("listening"); rec.start();
  };
  async function start() {
    if(!callId || !Number.isFinite(callId)) {setError("Invalid call ID.");return;}
    setError(""); ended.current=false;setPhase("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({audio:true}).then(s=>s.getTracks().forEach(t=>t.stop()));
      const greetingResponse=await fetch(`${API}/api/calls/${callId}/agent/greeting`,{method:"POST"});
      if(!greetingResponse.ok) throw new Error((await greetingResponse.json()).detail||"Could not start call.");
      const {greeting}=await greetingResponse.json();
      setMessages([{speaker:"ai",text:greeting}]);
      const ws=new WebSocket(API.replace(/^http/,"ws")+`/ws/calls/${callId}`);socket.current=ws;
      ws.onmessage=async e=>{
        const frame=JSON.parse(String(e.data)) as Frame;
        if(frame.type==="ai_message"&&frame.message){setMessages(old=>[...old,{speaker:"ai",text:frame.message!}]);setPhase("speaking");await speak(frame.message);if(frame.should_end_call){ended.current=true;setPhase("ended")}else listen();}
        if(frame.type==="call_ended"){ended.current=true;window.speechSynthesis.cancel();setPhase("ended");}
        if(frame.type==="error")setError(frame.detail||"Call error");
      };
      ws.onerror=()=>setError("WebSocket connection failed. Check that FastAPI is running.");
      ws.onopen=()=>{setPhase("speaking");speak(greeting).then(listen);};
    } catch(e) {setError(e instanceof Error?e.message:"Could not start voice session.");setPhase("failed");}
  }
  async function end() {
    ended.current=true;recognition.current?.stop();window.speechSynthesis?.cancel();socket.current?.close();setPhase("ending");
    try {const r=await fetch(`${API}/api/calls/${callId}/end`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:"Browser demo ended by user.",final_status:"completed",outcome:"completed"})});if(!r.ok)throw new Error("Backend could not end the call.");setPhase("ended");}
    catch(e){setError(e instanceof Error?e.message:"Could not end call.");setPhase("failed");}
  }
  return <main style={{maxWidth:760,margin:"40px auto",padding:24,fontFamily:"Arial,sans-serif",color:"#172033"}}><Link href="/">← Back to dashboard</Link><h1>Browser voice demo · Call #{callId}</h1><p>This is a simulated browser conversation, not a real phone call. Allow microphone access to speak with the agent.</p><div style={{padding:16,background:"#f3f4f8",borderRadius:12,margin:"20px 0"}}><b>Status: {phase}</b>{live&&<p>Listening: {live}</p>}</div><div style={{display:"flex",gap:10}}><button onClick={start} disabled={phase!=="ready"&&phase!=="failed"}>Start voice session</button><button onClick={end} disabled={phase==="ready"||phase==="ended"}>End call</button></div>{error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}<h2>Transcript</h2>{messages.map((m,i)=><article key={i} style={{padding:12,margin:"8px 0",borderRadius:8,background:m.speaker==="ai"?"#eeecff":"#f1f5f9"}}><b>{m.speaker==="ai"?"AI agent":"Customer"}</b><p>{m.text}</p></article>)}</main>;
}
