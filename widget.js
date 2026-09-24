const API_URL = "https://tgbot-zvra.onrender.com/api/schedule";

const TIMES = {
  1:["08:00","09:20"],
  2:["09:30","10:50"],
  3:["11:30","12:50"],
  4:["13:00","14:20"],
  5:["14:30","15:50"],
  6:["16:00","17:20"]
};

const DAYS = ["Неділя","Понеділок","Вівторок","Середа","Четвер","Пʼятниця","Субота"];
const DAY_WORDS = [
  ["неділя","воскресенье"],
  ["понеділок","понедельник"],
  ["вівторок","вторник"],
  ["середа","среда"],
  ["четвер","четверг"],
  ["пʼятниця","п'ятниця","пятница"],
  ["субота","суббота"]
];

const $ = s => document.querySelector(s);

function norm(v=""){
  return String(v).replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}

function normalizeDay(v=""){
  return norm(v)
    .toLowerCase()
    .replace(/[’ʼ'`]/g,"")
    .replace(/[\s._-]+/g,"");
}

function dayIndex(v=""){
  const s = normalizeDay(v);
  for(let i=0;i<DAY_WORDS.length;i++){
    const ok = DAY_WORDS[i].some(word => {
      const w = String(word)
        .toLowerCase()
        .replace(/[’ʼ'`]/g,"")
        .replace(/[\s._-]+/g,"");
      return s === w || s.includes(w);
    });
    if(ok) return i;
  }
  return null;
}

function pairNumber(values){
  for(const v of values){
    const s = norm(v);
    if(/^[1-6]$/.test(s)) return Number(s);
  }
  return null;
}

function collectRows(raw){
  const rows = [];
  const seen = new Set();
  let currentDay = null;

  function inspect(values){
    for(const v of values){
      if(typeof v === "string"){
        const d = dayIndex(v);
        if(d !== null) currentDay = d;
      }
    }

    const pair = pairNumber(values);
    if(pair === null || currentDay === null) return;

    const strings = values
      .filter(v => typeof v === "string" || typeof v === "number")
      .map(String);

    const meaningful = strings.filter(v => {
      const s = norm(v);
      return s && !/^[1-6]$/.test(s) && dayIndex(s) === null;
    });

    if(!meaningful.length) return;

    const key = currentDay + "|" + pair + "|" + meaningful.join("¦");
    if(seen.has(key)) return;
    seen.add(key);

    rows.push({day:currentDay,pair,values:strings});
  }

  function walk(node){
    if(node == null) return;

    if(Array.isArray(node)){
      const scalars = node.filter(v => typeof v === "string" || typeof v === "number");
      if(scalars.length) inspect(scalars);

      for(const item of node){
        if(typeof item === "string"){
          const d = dayIndex(item);
          if(d !== null) currentDay = d;
        }else if(Array.isArray(item) || (item && typeof item === "object")){
          walk(item);
        }
      }
      return;
    }

    if(typeof node === "object"){
      const entries = Object.entries(node);

      for(const [k,v] of entries){
        const kd = dayIndex(k);
        if(kd !== null) currentDay = kd;
        if(typeof v === "string"){
          const vd = dayIndex(v);
          if(vd !== null) currentDay = vd;
        }
      }

      const scalars = entries
        .map(([,v]) => v)
        .filter(v => typeof v === "string" || typeof v === "number");

      if(scalars.length) inspect(scalars);

      for(const [,v] of entries){
        if(Array.isArray(v) || (v && typeof v === "object")) walk(v);
      }
    }
  }

  walk(raw?.sections ?? raw);
  return rows;
}

function fullText(row){
  return row.values
    .filter(v => {
      const s = norm(v);
      return s && !/^[1-6]$/.test(s) && dayIndex(s) === null;
    })
    .map(norm)
    .join(" • ");
}

function lessonType(text){
  const s = text.toLowerCase();
  if(s.includes("лаборатор") || /\bлаб\b/.test(s)) return "лабораторна";
  if(s.includes("практи")) return "практика";
  if(s.includes("лекц")) return "лекція";
  if(s.includes("онлайн") || s.includes("zoom")) return "онлайн";
  return "пара";
}

function extractZoom(text){
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;]+$/,"") : null;
}

function extractRoom(text){
  let m = text.match(/(?:ауд\.?|аудиторія|аудитория|каб\.?|кабінет)\s*[:№]?\s*([A-Za-zА-Яа-яІіЇїЄєҐґ0-9\-\/]+)/i);
  if(m) return m[1];
  m = text.match(/\b([AА]-?\d{2,4})\b/i);
  return m ? m[1] : null;
}

function extractTeacher(text){
  const clean = text.replace(/https?:\/\/\S+/gi," ");
  const m = clean.match(/([А-ЯІЇЄҐ][а-яіїєґ'-]+\s+[А-ЯІЇЄҐ]\.\s*[А-ЯІЇЄҐ]\.)/u);
  return m ? m[1] : null;
}

function extractSubject(text){
  let s = norm(text)
    .replace(/https?:\/\/\S+/gi," ")
    .replace(/Запрошення.*$/i," ")
    .replace(/Join Zoom Meeting.*$/i," ")
    .replace(/Ідентифікатор конференції.*$/i," ")
    .replace(/Код доступу.*$/i," ")
    .replace(/Meeting ID.*$/i," ")
    .replace(/Passcode.*$/i," ");

  const typed = s.match(/^(.+?)\s*\((?:лекція|лекция|практика|лабораторна|лабораторная|онлайн)\)/i);
  if(typed && norm(typed[1])) return norm(typed[1]);

  const pieces = s.split(/[•|\n]/).map(norm).filter(Boolean);
  for(const p of pieces){
    const low = p.toLowerCase();
    if(/^(лекція|лекция|практика|лабораторна|лабораторная|онлайн)$/.test(low)) continue;
    if(/^(ауд\.?|аудиторія|каб\.?)/i.test(p)) continue;
    if(/^(meeting id|passcode|ідентифікатор конференції|код доступу)/i.test(p)) continue;
    return p;
  }

  return "Пара";
}

function parseSchedule(raw){
  const lessons = collectRows(raw).map(row => {
    const text = fullText(row);
    return {
      day:row.day,
      pair:row.pair,
      start:TIMES[row.pair]?.[0] || "",
      end:TIMES[row.pair]?.[1] || "",
      subject:extractSubject(text),
      type:lessonType(text),
      teacher:extractTeacher(text),
      room:extractRoom(text),
      zoom:extractZoom(text)
    };
  });

  const unique = new Map();
  for(const l of lessons){
    const key = [l.day,l.pair,l.subject,l.teacher||"",l.room||"",l.zoom||""].join("|");
    if(!unique.has(key)) unique.set(key,l);
  }

  return Array.from(unique.values()).sort((a,b) =>
    a.day-b.day || a.pair-b.pair || a.subject.localeCompare(b.subject,"uk")
  );
}

function nextLesson(lessons){
  const now = new Date();
  const today = now.getDay();
  const mins = now.getHours()*60 + now.getMinutes();

  const todayList = lessons.filter(l => l.day===today).sort((a,b)=>a.pair-b.pair);
  for(const l of todayList){
    const [sh,sm] = l.start.split(":").map(Number);
    const [eh,em] = l.end.split(":").map(Number);
    const start = sh*60+sm;
    const end = eh*60+em;
    if(mins <= end) return {lesson:l,current:mins>=start && mins<=end};
  }

  for(let plus=1;plus<=7;plus++){
    const d = (today+plus)%7;
    const list = lessons.filter(l=>l.day===d).sort((a,b)=>a.pair-b.pair);
    if(list.length) return {lesson:list[0],current:false};
  }

  return null;
}

function formatUpdated(raw){
  const value = raw?.updated_at ?? raw?.updatedAt ?? raw?.last_update ?? raw?.generated_at ?? raw?.timestamp;
  if(!value) return "час оновлення не вказаний";
  const d = new Date(value);
  if(!Number.isNaN(d.getTime())){
    return "Оновлено " + new Intl.DateTimeFormat("uk-UA",{
      day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
    }).format(d);
  }
  return "Оновлено " + String(value);
}

function renderNext(raw,lessons){
  const next = nextLesson(lessons);

  if(!next){
    $("#subject").textContent = "Пар не знайдено";
    $("#meta").textContent = "перевір дані розкладу";
    $("#time").textContent = "—";
    $("#dayLabel").textContent = "—";
    $("#teacher").textContent = "";
    $("#room").textContent = "";
    $("#zoomBtn").classList.add("hidden");
    $("#updated").textContent = formatUpdated(raw);
    return;
  }

  const l = next.lesson;

  $("#subject").textContent = l.subject;
  $("#meta").textContent = next.current ? "зараз · " + l.type : "далі · " + l.type;
  $("#time").textContent = l.start;
  $("#dayLabel").textContent = DAYS[l.day];
  $("#teacher").textContent = l.teacher || "";
  $("#room").textContent = l.room ? "ауд. " + l.room : "";

  if(l.zoom){
    $("#zoomBtn").href = l.zoom;
    $("#zoomBtn").classList.remove("hidden");
  }else{
    $("#zoomBtn").classList.add("hidden");
  }

  $("#updated").textContent = formatUpdated(raw);
}

async function loadData(){
  const btn = $("#refreshBtn");
  btn.classList.add("loading");

  try{
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),90000);

    const res = await fetch(`${API_URL}?t=${Date.now()}`,{
      cache:"no-store",
      signal:controller.signal
    });

    clearTimeout(timer);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.json();
    const lessons = parseSchedule(raw);

    localStorage.setItem("ontu-widget-cache",JSON.stringify(raw));
    renderNext(raw,lessons);
  }catch(err){
    const cached = localStorage.getItem("ontu-widget-cache");

    if(cached){
      try{
        const raw = JSON.parse(cached);
        renderNext(raw,parseSchedule(raw));
        $("#updated").textContent += " · кеш";
        return;
      }catch{}
    }

    $("#subject").textContent = "Немає зʼєднання";
    $("#subject").classList.add("error");
    $("#meta").textContent = err.name==="AbortError" ? "Render довго прокидається" : err.message;
    $("#time").textContent = "—";
    $("#dayLabel").textContent = "—";
    $("#updated").textContent = "оновлення недоступне";
  }finally{
    btn.classList.remove("loading");
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  $("#refreshBtn").addEventListener("click",loadData);
  loadData();
});
