const $=id=>document.getElementById(id);
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const trim=n=>Number.isInteger(n)?String(n):Number(n).toFixed(1).replace(/\.0$/,"");
const num=id=>parseFloat($(id).value)||0;

const TOOLS=[
  {id:"gutter",label:"Gutter",short:"G",needsFeet:true,billable:0},
  {id:"downspout",label:"Downspout",short:"DS",needsFeet:true,billable:0},
  {id:"inside",label:"Inside Miter",short:"IN",needsFeet:false,billable:3},
  {id:"outside",label:"Outside Miter",short:"OUT",needsFeet:false,billable:3},
  {id:"outlet",label:"Outlet",short:"O",needsFeet:false,billable:1},
  {id:"endcap",label:"End Cap",short:"EC",needsFeet:false,billable:.5},
  {id:"aElbow",label:"A Elbow",short:"A",needsFeet:false,billable:1},
  {id:"bElbow",label:"B Elbow",short:"B",needsFeet:false,billable:1},
  {id:"twoCrimp",label:"2-Crimp Elbow",short:"2",needsFeet:false,billable:1},
  {id:"fourCrimp",label:"4-Crimp Elbow",short:"4",needsFeet:false,billable:1},
  {id:"diverter",label:"Diverter",short:"D",needsFeet:false,billable:0}
];

let state={id:uid(),photos:[],selectedTool:"move",currentEntry:null};

function makePhoto(file,index){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=()=>resolve({
      id:uid(),label:`Photo ${index+1}`,src:reader.result,markers:[],undo:[],redo:[],
      view:{scale:1,x:0,y:0}
    });
    reader.readAsDataURL(file);
  });
}

$("addPhotoBtn").onclick=()=>$("photoInput").click();
$("photoInput").onchange=async e=>{
  const files=[...e.target.files];
  for(let i=0;i<files.length;i++) state.photos.push(await makePhoto(files[i],state.photos.length));
  e.target.value="";
  renderPhotos();calculate();dirty();
};

function snapshot(p){
  p.undo.push(JSON.stringify(p.markers));
  if(p.undo.length>50)p.undo.shift();
  p.redo=[];
}
function undo(p){
  if(!p.undo.length)return;
  p.redo.push(JSON.stringify(p.markers));
  p.markers=JSON.parse(p.undo.pop());renderPhotos();calculate();dirty();
}
function redo(p){
  if(!p.redo.length)return;
  p.undo.push(JSON.stringify(p.markers));
  p.markers=JSON.parse(p.redo.pop());renderPhotos();calculate();dirty();
}

function renderPhotos(){
  const box=$("photos");
  if(!state.photos.length){box.innerHTML='<div class="empty-state"><strong>No photos added yet</strong><span>Tap “Add Photos” to begin.</span></div>';return}
  box.innerHTML="";
  state.photos.forEach((p,idx)=>{
    const node=$("photoCardTemplate").content.firstElementChild.cloneNode(true);
    node.dataset.pid=p.id;
    const label=node.querySelector(".photo-label"); label.value=p.label;
    label.oninput=e=>{p.label=e.target.value;dirty()};
    node.querySelector(".delete-photo").onclick=()=>{if(confirm("Delete this photo and all markers?")){state.photos=state.photos.filter(x=>x.id!==p.id);renderPhotos();calculate();dirty()}};
    const workspace=node.querySelector(".workspace");
    const layer=node.querySelector(".transform-layer");
    const img=node.querySelector(".property-photo"); img.src=p.src;
    const markerLayer=node.querySelector(".marker-layer");
    const zoomLabel=node.querySelector(".zoom-label");

    function applyView(){layer.style.transform=`translate(${p.view.x}px,${p.view.y}px) scale(${p.view.scale})`;zoomLabel.textContent=Math.round(p.view.scale*100)+"%"}
    applyView();

    node.querySelector(".zoom-in").onclick=()=>{p.view.scale=Math.min(4,p.view.scale+.25);applyView()};
    node.querySelector(".zoom-out").onclick=()=>{p.view.scale=Math.max(1,p.view.scale-.25);if(p.view.scale===1){p.view.x=0;p.view.y=0}applyView()};
    node.querySelector(".reset-view").onclick=()=>{p.view={scale:1,x:0,y:0};applyView()};
    node.querySelector(".undo").onclick=()=>undo(p);
    node.querySelector(".redo").onclick=()=>redo(p);
    node.querySelector(".clear-markers").onclick=()=>{if(p.markers.length&&confirm("Clear all markers from this photo?")){snapshot(p);p.markers=[];renderPhotos();calculate();dirty()}};

    const toolbar=node.querySelector(".toolbar");
    const moveBtn=node.querySelector(".move-tool");
    const allTools=[{id:"move",label:"Move / Zoom"},...TOOLS];
    allTools.forEach(t=>{
      const b=document.createElement("button");b.className="tool"+(state.selectedTool===t.id?" active":"");b.textContent=t.label;
      b.onclick=()=>{state.selectedTool=t.id;renderPhotos()};
      toolbar.appendChild(b);
    });
    moveBtn.onclick=()=>{state.selectedTool="move";renderPhotos()};
    moveBtn.classList.toggle("active",state.selectedTool==="move");

    p.markers.forEach(m=>{
      const tool=TOOLS.find(t=>t.id===m.type);
      const el=document.createElement("button");
      el.className=`marker ${m.type}${m.type==="downspout"?" downspout-assembly":""}`;
      el.style.left=m.x+"%";el.style.top=m.y+"%";
      if(m.type==="downspout"){
        const ec=(m.assembly?.a||0)+(m.assembly?.b||0)+(m.assembly?.two||0)+(m.assembly?.four||0);
        el.textContent=`${trim(m.value)}' DS${ec?` • ${ec}E`:""}`;
      }else{
        el.textContent=tool.needsFeet?`${trim(m.value)}'`:tool.short+(m.qty>1?`×${m.qty}`:"");
      }
      el.title=tool.label;
      el.onclick=e=>{e.stopPropagation();editMarker(p,m)};
      markerLayer.appendChild(el);
    });

    let dragging=false,lastX=0,lastY=0;
    workspace.onpointerdown=e=>{
      if(state.selectedTool==="move" && p.view.scale>1){
        dragging=true;lastX=e.clientX;lastY=e.clientY;workspace.setPointerCapture(e.pointerId);
      }
    };
    workspace.onpointermove=e=>{
      if(!dragging)return;
      p.view.x+=e.clientX-lastX;p.view.y+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;applyView();
    };
    workspace.onpointerup=()=>dragging=false;
    workspace.onclick=e=>{
      if(e.target.closest(".marker")||state.selectedTool==="move")return;
      const rect=workspace.getBoundingClientRect();
      const rawX=(e.clientX-rect.left-p.view.x)/p.view.scale;
      const rawY=(e.clientY-rect.top-p.view.y)/p.view.scale;
      const x=Math.max(0,Math.min(100,rawX/(workspace.clientWidth)*100));
      const naturalHeight=img.clientHeight||workspace.clientHeight;
      const y=Math.max(0,Math.min(100,rawY/naturalHeight*100));
      openEntry(p,x,y,state.selectedTool,null);
    };

    const totals=photoTotals(p);
    node.querySelector(".photo-summary").textContent=`${trim(totals.gutter.feet)} ft gutter • ${trim(totals.downspout.feet)} ft downspout • ${totals.inside.count+totals.outside.count} miters • ${totals.totalMarkers} markers`;
    box.appendChild(node);
  });
}

function openEntry(p,x,y,type,marker){
  const tool=TOOLS.find(t=>t.id===type);if(!tool)return;
  state.currentEntry={pid:p.id,x,y,type,markerId:marker?.id||null};
  $("popoverTitle").textContent=marker?`Edit ${tool.label}`:`Add ${tool.label}`;
  $("measurementLabel").classList.toggle("hidden",!tool.needsFeet);
  $("quantityLabel").classList.toggle("hidden",tool.needsFeet);
  $("downspoutAssemblyFields").classList.toggle("hidden",type!=="downspout");
  $("measurementInput").value=marker?.value??"";
  $("quantityInput").value=marker?.qty??1;
  $("assemblyA").value=marker?.assembly?.a??0;
  $("assemblyB").value=marker?.assembly?.b??0;
  $("assembly2").value=marker?.assembly?.two??0;
  $("assembly4").value=marker?.assembly?.four??0;
  $("assemblyOutlet").value=marker?.assembly?.outlet??1;
  $("entryPopover").classList.remove("hidden");
  setTimeout(()=>$(tool.needsFeet?"measurementInput":"quantityInput").focus(),50);
}
function editMarker(p,m){
  const tool=TOOLS.find(t=>t.id===m.type);
  const action=prompt(`Type E to edit or D to delete this ${tool.label}.`,"E");
  if(action===null)return;
  if(action.trim().toUpperCase()==="D"){
    snapshot(p);p.markers=p.markers.filter(x=>x.id!==m.id);renderPhotos();calculate();dirty();
  }else openEntry(p,m.x,m.y,m.type,m);
}
$("cancelEntry").onclick=()=>{$("entryPopover").classList.add("hidden");state.currentEntry=null};
$("saveEntry").onclick=()=>{
  const e=state.currentEntry;if(!e)return;
  const p=state.photos.find(x=>x.id===e.pid);const tool=TOOLS.find(t=>t.id===e.type);if(!p||!tool)return;
  const value=parseFloat($("measurementInput").value);
  const qty=Math.max(1,parseInt($("quantityInput").value)||1);
  if(tool.needsFeet&&(!Number.isFinite(value)||value<0)){alert("Enter a valid footage amount.");return}
  snapshot(p);
  const assembly=e.type==="downspout"?{
    a:Math.max(0,parseInt($("assemblyA").value)||0),
    b:Math.max(0,parseInt($("assemblyB").value)||0),
    two:Math.max(0,parseInt($("assembly2").value)||0),
    four:Math.max(0,parseInt($("assembly4").value)||0),
    outlet:Math.max(0,parseInt($("assemblyOutlet").value)||0)
  }:null;
  if(e.markerId){
    const m=p.markers.find(x=>x.id===e.markerId);
    if(m){m.value=tool.needsFeet?value:1;m.qty=tool.needsFeet?1:qty;if(e.type==="downspout")m.assembly=assembly}
  }else p.markers.push({id:uid(),type:e.type,x:e.x,y:e.y,value:tool.needsFeet?value:1,qty:tool.needsFeet?1:qty,...(assembly?{assembly}:{})});
  $("entryPopover").classList.add("hidden");state.currentEntry=null;renderPhotos();calculate();dirty();
};

function aggregate(){
  const totals={};
  TOOLS.forEach(t=>totals[t.id]={count:0,feet:0});
  state.photos.forEach(p=>p.markers.forEach(m=>{
    const q=m.qty||1;totals[m.type].count+=q;
    if(TOOLS.find(t=>t.id===m.type)?.needsFeet)totals[m.type].feet+=Number(m.value||0);
    if(m.type==="downspout"&&m.assembly){
      totals.aElbow.count+=Number(m.assembly.a||0);
      totals.bElbow.count+=Number(m.assembly.b||0);
      totals.twoCrimp.count+=Number(m.assembly.two||0);
      totals.fourCrimp.count+=Number(m.assembly.four||0);
      totals.outlet.count+=Number(m.assembly.outlet||0);
    }
  }));
  return totals;
}
function photoTotals(p){
  const totals={};TOOLS.forEach(t=>totals[t.id]={count:0,feet:0});
  p.markers.forEach(m=>{
    const q=m.qty||1;totals[m.type].count+=q;
    if(TOOLS.find(t=>t.id===m.type)?.needsFeet)totals[m.type].feet+=Number(m.value||0);
    if(m.type==="downspout"&&m.assembly){
      totals.aElbow.count+=Number(m.assembly.a||0);
      totals.bElbow.count+=Number(m.assembly.b||0);
      totals.twoCrimp.count+=Number(m.assembly.two||0);
      totals.fourCrimp.count+=Number(m.assembly.four||0);
      totals.outlet.count+=Number(m.assembly.outlet||0);
    }
  });
  totals.totalMarkers=p.markers.reduce((s,m)=>s+(m.qty||1),0);return totals;
}
function calculate(){
  const t=aggregate();
  const gutter=t.gutter.feet,down=t.downspout.feet;
  const elbows=t.aElbow.count+t.bElbow.count+t.twoCrimp.count+t.fourCrimp.count;
  const outlets=t.outlet.count;
  const endcapPairs=Math.ceil(t.endcap.count/2);
  const miters=t.inside.count+t.outside.count;
  const billable=gutter+down+elbows+outlets+endcapPairs+(miters*3);
  const customer=billable*num("pricePerFoot")+num("customerExtra")-num("customerDiscount");
  const costs=num("materials")+num("labor")+num("delivery")+num("otherCosts");
  $("billableFeet").textContent=trim(billable)+" ft";$("customerPrice").textContent=money(customer);
  $("totalCosts").textContent=money(costs);$("grossProfit").textContent=money(customer-costs);
  $("totalsGrid").innerHTML=[
    ["Gutter",trim(gutter)+" ft"],["Downspout",trim(down)+" ft"],["Miters",miters],["Outlets",outlets],
    ["End Caps",t.endcap.count],["Elbows",elbows],["Diverters",t.diverter.count],["Billable",trim(billable)+" ft"]
  ].map(([a,b])=>`<div class="total-box"><span>${a}</span><strong>${b}</strong></div>`).join("");
}
function dirty(){$("saveStatus").textContent="Unsaved changes"}
["jobName","jobDate","address","phone","gutterStyle","downspoutStyle","notes","pricePerFoot","customerExtra","customerDiscount","materials","labor","delivery","otherCosts"].forEach(id=>{
  $(id).addEventListener("input",()=>{calculate();dirty()});
});

function data(){
  return{
    id:state.id,photos:state.photos,job:{name:$("jobName").value,date:$("jobDate").value,address:$("address").value,phone:$("phone").value,
    gutterStyle:$("gutterStyle").value,downspoutStyle:$("downspoutStyle").value,notes:$("notes").value},
    pricing:{pricePerFoot:num("pricePerFoot"),customerExtra:num("customerExtra"),customerDiscount:num("customerDiscount"),materials:num("materials"),labor:num("labor"),delivery:num("delivery"),otherCosts:num("otherCosts")},
    savedAt:new Date().toISOString()
  }
}
function jobs(){return JSON.parse(localStorage.getItem("snrGutterJobsV2")||"[]")}
function setJobs(v){localStorage.setItem("snrGutterJobsV2",JSON.stringify(v))}
$("saveJobBtn").onclick=()=>{
  const list=jobs(),d=data(),i=list.findIndex(j=>j.id===d.id);if(i>=0)list[i]=d;else list.unshift(d);setJobs(list);$("saveStatus").textContent="Saved";renderSavedJobs();toast("Job saved");
};
function renderSavedJobs(){
  const box=$("savedJobs"),list=jobs();if(!list.length){box.innerHTML='<div class="muted">No saved jobs yet.</div>';return}
  box.innerHTML="";
  list.forEach(j=>{
    const row=document.createElement("div");row.className="saved-job";
    row.innerHTML=`<div><strong>${escapeHtml(j.job?.name||"Untitled Job")}</strong><small>${escapeHtml(j.job?.address||"")}</small></div><div><button class="ghost open">Open</button> <button class="danger del">Delete</button></div>`;
    row.querySelector(".open").onclick=()=>loadJob(j);row.querySelector(".del").onclick=()=>{if(confirm("Delete this saved job?")){setJobs(jobs().filter(x=>x.id!==j.id));renderSavedJobs()}};
    box.appendChild(row);
  });
}
function loadJob(j){
  state={id:j.id,photos:j.photos||[],selectedTool:"move",currentEntry:null};
  $("jobName").value=j.job?.name||"";$("jobDate").value=j.job?.date||"";$("address").value=j.job?.address||"";$("phone").value=j.job?.phone||"";
  $("gutterStyle").value=j.job?.gutterStyle||"K-Style";$("downspoutStyle").value=j.job?.downspoutStyle||"Rectangular";$("notes").value=j.job?.notes||"";
  ["pricePerFoot","customerExtra","customerDiscount","materials","labor","delivery","otherCosts"].forEach(k=>$(k).value=j.pricing?.[k]??(k==="pricePerFoot"?7.5:0));
  renderPhotos();calculate();$("saveStatus").textContent="Saved";window.scrollTo({top:0,behavior:"smooth"});
}
$("newJobBtn").onclick=()=>{if(confirm("Start a new blank job? Unsaved work will be lost.")){localStorage.setItem("snrGutterDraft","");location.reload()}};
$("printBtn").onclick=()=>window.print();
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),1700)}

$("jobDate").valueAsDate=new Date();
renderPhotos();renderSavedJobs();calculate();