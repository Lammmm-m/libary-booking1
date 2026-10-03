const ROOMS = {
  1:{name:"Phòng 1",weekdays:true,start:"07:30",end:"21:00"},
  2:{name:"Phòng 2",weekdays:true,start:"07:30",end:"21:00"},
  3:{name:"Phòng 3",weekdays:true,start:"07:30",end:"21:00"},
  4:{name:"Phòng 4",weekdays:false,start:"08:00",end:"21:15"},
  5:{name:"Phòng 5",weekdays:false,start:"08:00",end:"21:15"},
  6:{name:"Phòng 6",weekdays:false,start:"08:00",end:"21:15"},
  7:{name:"Phòng 7",weekdays:false,start:"08:00",end:"21:15"}
};

const STEP=30;
let bookings=[];
let selectedStart=null;

const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
function localDate(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function addDays(s,n){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return localDate(d);}
function parseMin(t){const [h,m]=String(t).split(":").map(Number);return h*60+m;}
function fmtMin(m){return `${pad(Math.floor(m/60))}:${pad(m%60)}`;}
function isToday(s){return s===localDate();}
function nowMin(){const d=new Date();return d.getHours()*60+d.getMinutes();}
function allowedRoom(roomId,date){return !ROOMS[roomId].weekdays || [1,2,3,4,5].includes(new Date(date+"T12:00:00").getDay());}

function init(){
  for(let i=0;i<2;i++){
    const date=addDays(localDate(),i);
    const o=document.createElement("option");
    o.value=date;
    o.textContent=i===0?`Hôm nay — ${date}`:`Ngày mai — ${date}`;
    $("dateSelect").appendChild(o);
  }

  Object.keys(ROOMS).forEach(id=>{
    const o=document.createElement("option");
    o.value=id;
    o.textContent=ROOMS[id].name;
    $("roomSelect").appendChild(o);
  });

  $("dateSelect").addEventListener("change",load);
  $("roomSelect").addEventListener("change",load);
  $("refreshBtn").addEventListener("click",load);
  $("cancelBtn").addEventListener("click",()=>{
    $("bookingPanel").classList.add("hidden");
    selectedStart=null;
    render();
  });
  $("bookBtn").addEventListener("click",book);
  $("endSelect").addEventListener("change",()=>{
    $("sumEnd").textContent=$("endSelect").value;
  });

  load();
}

// GET: JSONP avoids CORS restrictions between GitHub Pages and Apps Script.
function apiList(date,room){
  return new Promise((resolve,reject)=>{
    if(!GOOGLE_APPS_SCRIPT_URL){
      resolve(JSON.parse(localStorage.getItem("libraryBookings")||"[]")
        .filter(b=>b.date===date && Number(b.room)===Number(room)));
      return;
    }

    const callbackName="libraryCallback_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    const timeout=setTimeout(()=>{
      cleanup();
      reject(new Error("Không thể kết nối máy chủ. Kiểm tra Web App URL và deployment."));
    },10000);

    function cleanup(){
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName]=(data)=>{
      cleanup();
      if(!data || data.ok===false){
        reject(new Error(data?.error || "Máy chủ trả về lỗi."));
        return;
      }
      resolve(data.bookings || []);
    };

    script.onerror=()=>{
      cleanup();
      reject(new Error("Không thể tải dữ liệu từ Google Apps Script."));
    };

    const url=new URL(GOOGLE_APPS_SCRIPT_URL);
    url.searchParams.set("action","list");
    url.searchParams.set("date",date);
    url.searchParams.set("room",room);
    url.searchParams.set("prefix",callbackName);

    script.src=url.toString();
    document.body.appendChild(script);
  });
}

// POST: submit a normal form to a hidden iframe, avoiding CORS preflight.
function submitBookingForm(payload){
  return new Promise((resolve,reject)=>{
    if(!GOOGLE_APPS_SCRIPT_URL){
      const local=JSON.parse(localStorage.getItem("libraryBookings")||"[]");
      const item={id:crypto.randomUUID(),...payload,createdAt:new Date().toISOString()};
      local.push(item);
      localStorage.setItem("libraryBookings",JSON.stringify(local));
      resolve({ok:true,booking:item,local:true});
      return;
    }

    const frameName="booking_iframe_"+Date.now();
    const iframe=document.createElement("iframe");
    iframe.name=frameName;
    iframe.style.display="none";

    const form=document.createElement("form");
    form.method="POST";
    form.action=GOOGLE_APPS_SCRIPT_URL;
    form.target=frameName;
    form.style.display="none";

    const fields={action:"book",...payload};
    Object.entries(fields).forEach(([key,value])=>{
      const input=document.createElement("input");
      input.type="hidden";
      input.name=key;
      input.value=String(value);
      form.appendChild(input);
    });

    let finished=false;
    const finish=()=>{
      if(finished)return;
      finished=true;
      setTimeout(()=>{
        iframe.remove();
        form.remove();
      },500);
      resolve({ok:true});
    };

    iframe.addEventListener("load",finish,{once:true});
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();

    setTimeout(finish,4000);
  });
}

async function load(){
  selectedStart=null;
  $("bookingPanel").classList.add("hidden");

  const date=$("dateSelect").value;
  const room=Number($("roomSelect").value);

  $("statusText").textContent="Đang tải...";

  try{
    bookings=await apiList(date,room);
    render();
    $("lastUpdated").textContent="Cập nhật "+new Date().toLocaleTimeString("vi-VN");
  }catch(e){
    bookings=!GOOGLE_APPS_SCRIPT_URL
      ? JSON.parse(localStorage.getItem("libraryBookings")||"[]")
          .filter(b=>b.date===date&&Number(b.room)===room)
      : [];
    render();
    showMessage(e.message,true);
  }
}

function render(){
  const date=$("dateSelect").value;
  const room=Number($("roomSelect").value);
  const cfg=ROOMS[room];

  $("roomTitle").textContent=cfg.name;
  $("roomHours").textContent=allowedRoom(room,date)
    ? `${cfg.start} – ${cfg.end}`
    : "Phòng này không hoạt động ngày đã chọn";

  const slots=[];
  if(allowedRoom(room,date)){
    for(let m=parseMin(cfg.start);m<parseMin(cfg.end);m+=STEP)slots.push(m);
  }

  const timeline=$("timeline");
  timeline.innerHTML="";

  if(!slots.length){
    timeline.innerHTML='<div class="empty">Phòng không mở vào ngày này.</div>';
    return;
  }

  const row=document.createElement("div");
  row.className="time-row";
  row.style.setProperty("--cols",slots.length);

  const blank=document.createElement("div");
  blank.className="time-label time-header";
  blank.textContent="Giờ";
  row.appendChild(blank);

  slots.forEach(m=>{
    const h=document.createElement("div");
    h.className="time-label time-header";
    h.textContent=fmtMin(m);
    row.appendChild(h);
  });
  timeline.appendChild(row);

  const r2=document.createElement("div");
  r2.className="time-row";

  const label=document.createElement("div");
  label.className="time-label";
  label.textContent=cfg.name;
  r2.appendChild(label);

  slots.forEach(m=>{
    const el=document.createElement("div");
    el.className="slot";

    const b=findBooking(m);
    const past=isToday(date)&&m<=nowMin();

    if(b){
      el.classList.add("booked");
      el.title=`Đã đặt: MSSV ${b.studentId}`;
      el.textContent="Đã đặt";
    }else if(past){
      el.classList.add("past");
      el.textContent="—";
    }else{
      el.classList.add("available");
      el.textContent="Trống";
      el.addEventListener("click",()=>selectStart(m));
    }

    if(selectedStart===m)el.classList.add("selected");
    r2.appendChild(el);
  });

  timeline.appendChild(r2);

  $("statusText").textContent=`${bookings.length} lượt đã đặt`;
  renderList();
}

function findBooking(minute){
  return bookings.find(b=>parseMin(b.start)<minute+STEP && parseMin(b.end)>minute);
}

function selectStart(m){
  selectedStart=m;

  const cfg=ROOMS[Number($("roomSelect").value)];
  const date=$("dateSelect").value;

  $("sumDate").textContent=date;
  $("sumRoom").textContent=cfg.name;
  $("sumStart").textContent=fmtMin(m);
  $("sumStudent").textContent=$("studentId").value.trim()||"Chưa nhập";

  const end=$("endSelect");
  end.innerHTML="";

  for(let x=m+STEP;x<=Math.min(m+120,parseMin(cfg.end));x+=STEP){
    let free=true;
    for(let y=m;y<x;y+=STEP){
      if(findBooking(y)){free=false;break;}
    }

    if(free){
      const o=document.createElement("option");
      o.value=fmtMin(x);
      o.textContent=fmtMin(x);
      end.appendChild(o);
    }
  }

  if(!end.options.length){
    showMessage("Không đủ thời gian trống cho lượt này.",true);
    return;
  }

  $("sumEnd").textContent=end.value;
  $("bookingPanel").classList.remove("hidden");
  render();
  window.scrollTo({top:$("bookingPanel").offsetTop-15,behavior:"smooth"});
}

async function book(){
  const studentId=$("studentId").value.trim();
  const date=$("dateSelect").value;
  const room=Number($("roomSelect").value);
  const end=$("endSelect").value;

  if(!studentId){
    showMessage("Vui lòng nhập MSSV.",true);
    $("studentId").focus();
    return;
  }

  if(selectedStart===null||!end)return;

  const payload={date,room,start:fmtMin(selectedStart),end,studentId};

  $("bookBtn").disabled=true;
  showMessage("Đang gửi yêu cầu đặt phòng...",false);

  try{
    if(GOOGLE_APPS_SCRIPT_URL){
      await submitBookingForm(payload);

      // Re-read the authoritative Sheet. This verifies both success and
      // server-side collision rejection.
      await new Promise(r=>setTimeout(r,800));
      const fresh=await apiList(date,room);

      const mine=fresh.some(b=>
        String(b.studentId)===studentId &&
        String(b.start)===payload.start &&
        String(b.end)===payload.end
      );

      if(!mine){
        throw new Error("Không xác nhận được lượt đặt. Có thể khung giờ vừa được người khác đặt.");
      }

      bookings=fresh;
      selectedStart=null;
      $("bookingPanel").classList.add("hidden");
      render();
      showMessage("Đặt phòng thành công.",false);
    }else{
      const result=await submitBookingForm(payload);
      if(!result?.ok)throw new Error("Không thể đặt phòng.");
      showMessage("Đặt phòng thành công.",false);
      await load();
    }
  }catch(e){
    showMessage(e.message,true);
    await load();
  }finally{
    $("bookBtn").disabled=false;
  }
}

function renderList(){
  const box=$("bookingList");
  box.innerHTML="";

  if(!bookings.length){
    box.innerHTML='<div class="empty">Chưa có lượt đặt nào.</div>';
    return;
  }

  [...bookings]
    .sort((a,b)=>parseMin(a.start)-parseMin(b.start))
    .forEach(b=>{
      const d=document.createElement("div");
      d.className="booking-item";
      d.innerHTML=
        `<div class="time">${escapeHtml(b.start)}–${escapeHtml(b.end)}</div>`+
        `<div class="mssv">MSSV: ${escapeHtml(b.studentId)}</div>`+
        `<div>Đã đặt</div>`;
      box.appendChild(d);
    });
}

function showMessage(msg,error){
  $("bookingMessage").textContent=msg;
  $("bookingMessage").className="message "+(error?"error":"success");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

document.addEventListener("DOMContentLoaded",init);
