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

const state = { lessons:[], raw:null, view:"today" };
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function norm(v=""){
  return String(v).replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}

function collapseDay(v=""){
  const s = norm(v);
  const letters = s.split(/\s+/);
  if(letters.length >= 4 && letters.every(x => x.length === 1)) return letters.join("");
  return s;
}

function dayIndex(v=""){
  const s = collapseDay(v).toLowerCase().replace(/’/g,"ʼ");
  for(let i=0;i<DAY_WORDS.length;i++){
    if(DAY_WORDS[i].some(w => s.includes(w))) return i;
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

  function inspectScalars(values){
    for(const v of values){
      if(typeof v === "string"){
        const d = dayIndex(v);
        if(d !== null) currentDay = d;
      }
    }

    const p = pairNumber(values);
    if(p === null || currentDay === null) return;

    const texts = values
      .filter(v => typeof v === "string" || typeof v === "number")
      .map(String);

    const meaningful = texts.filter(v => {
      const s = norm(v);
      return s && !/^[1-6]$/.test(s) && dayIndex(s) === null;
    });

    if(!meaningful.length) return;

    const key = currentDay + "|" + p + "|" + meaningful.join("¦");
    if(seen.has(key)) return;
    seen.add(key);

    rows.push({day:currentDay,pair:p,values:texts});
  }

  function walk(node){
    if(node == null) return;

    if(Array.isArray(node)){
      const scalars = node.filter(v => typeof v === "string" || typeof v === "number");
      if(scalars.length) inspectScalars(scalars);

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

      if(scalars.length) inspectScalars(scalars);

      for(const [,v] of entries){
        if(Array.isArray(v) || (v && typeof v === "object")) walk(v);
      }
    }
  }

  walk(raw && raw.sections ? raw.sections : raw);
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
  if(s.includes("лаборатор") || /\bлаб\b/.test(s)) return "Лаб";
  if(s.includes("практи")) return "Практика";
  if(s.includes("лекц")) return "Лекція";
  if(s.includes("онлайн") || s.includes("zoom")) return "Онлайн";
  return "Пара";
}

function extractZoom(text){
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;]+$/,"") : null;
}

function extractRoom(text){
  let m = text.match(/(?:ауд\.?|аудиторія|аудитория|каб\.?|кабінет)\s*[:№]?\s*([A-Za-zА-Яа-яІіЇїЄєҐґ0-9\-\/]+)/i);
  if(m) return m[1];

  m = text.match(/\b([AА]-?\d{2,4})\b/i);
  if(m) return m[1];

  return null;
}

function extractTeacher(text){
  const cleaned = text.replace(/https?:\/\/\S+/gi," ");
  const m = cleaned.match(/([А-ЯІЇЄҐ][а-яіїєґ'-]+\s+[А-ЯІЇЄҐ]\.\s*[А-ЯІЇЄҐ]\.)/u);
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

  // Типичный формат ОНТУ: "ЄП (Лекція) Викладач ..."
  const typed = s.match(/^(.+?)\s*\((?:лекція|лекция|практика|лабораторна|лабораторная|онлайн)\)/i);
  if(typed && norm(typed[1])) return norm(typed[1]);

  // Или: "Назва предмета • Лекція • ..."
  const pieces = s.split(/[•|\n]/).map(norm).filter(Boolean);
  for(const p of pieces){
    const low = p.toLowerCase();
    if(/^(лекція|лекция|практика|лабораторна|лабораторная|онлайн)$/.test(low)) continue;
    if(/^(ауд\.?|аудиторія|каб\.?)/i.test(p)) continue;
    if(/^(meeting id|passcode|ідентифікатор конференції|код доступу)/i.test(p)) continue;
    if(extractTeacher(p) === p) continue;
    return p;
  }

  return "Пара";
}

function parseSchedule(raw){
  const parsed = collectRows(raw).map(row => {
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
      zoom:extractZoom(text),
      raw:text
    };
  });

  const unique = new Map();
  for(const l of parsed){
    const key = [l.day,l.pair,l.subject,l.teacher||"",l.room||"",l.zoom||""].join("|");
    if(!unique.has(key)) unique.set(key,l);
  }

  return Array.from(unique.values()).sort((a,b) =>
    a.day-b.day || a.pair-b.pair || a.subject.localeCompare(b.subject,"uk")
  );
}

function esc(v=""){
  return String(v).replace(/[&<>"']/g,c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[c]);
}

function icon(kind){
  if(kind==="person") return '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M5 21c.6-4 3-6 7-6s6.4 2 7 6"/></svg>';
  if(kind==="pin") return '<svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  return '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>';
}

function lessonCard(l,current=false){
  return `
    <article class="lesson ${current ? "current" : ""}">
      <div class="pair">
        <strong>${l.pair}</strong>
        <span>${esc(l.start)}<br>${esc(l.end)}</span>
      </div>
      <div class="lesson-main">
        <div class="lesson-top">
          <div class="subject">${esc(l.subject)}</div>
          <div class="badge">${esc(l.type)}</div>
        </div>
        <div class="meta-row">
          ${l.teacher ? `<span class="meta">${icon("person")}${esc(l.teacher)}</span>` : ""}
          ${l.room ? `<span class="meta">${icon("pin")}ауд. ${esc(l.room)}</span>` : ""}
        </div>
        ${l.zoom ? `<a class="zoom" href="${esc(l.zoom)}" target="_blank" rel="noopener">${icon("video")}Відкрити Zoom</a>` : ""}
      </div>
    </article>`;
}

function emptyCard(title="Пар немає"){
  return `<div class="empty"><strong>${esc(title)}</strong>Можна трохи видихнути<div class="tiny">no alarms, no surprises</div></div>`;
}

function sameLesson(a,b){
  return !!a && !!b && a.day===b.day && a.pair===b.pair && a.subject===b.subject;
}

function currentOrNext(){
  if(!state.lessons.length) return null;
  const now = new Date();
  const day = now.getDay();
  const mins = now.getHours()*60 + now.getMinutes();

  const today = state.lessons.filter(l => l.day===day).sort((a,b)=>a.pair-b.pair);
  for(const l of today){
    const [sh,sm] = l.start.split(":").map(Number);
    const [eh,em] = l.end.split(":").map(Number);
    const s = sh*60+sm, e = eh*60+em;
    if(mins <= e) return {lesson:l,current:mins>=s && mins<=e};
  }

  for(let plus=1;plus<=7;plus++){
    const d = (day+plus)%7;
    const list = state.lessons.filter(l => l.day===d).sort((a,b)=>a.pair-b.pair);
    if(list.length) return {lesson:list[0],current:false};
  }
  return null;
}

function dateForOffset(offset){
  const d = new Date();
  d.setDate(d.getDate()+offset);
  return d;
}

function shortDate(d){
  return new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"short"}).format(d);
}

function renderHero(){
  const next = currentOrNext();
  if(!next){
    $("#nextSubject").textContent = "Пар не знайдено";
    $("#nextMeta").textContent = "перевір дані розкладу";
    $("#nextTime").textContent = "—";
    return;
  }

  const l = next.lesson;
  $("#nextSubject").textContent = l.subject;
  $("#nextMeta").textContent = next.current
    ? `зараз · ${l.type.toLowerCase()}${l.room ? " · ауд. "+l.room : ""}`
    : `${DAYS[l.day].toLowerCase()} · ${l.type.toLowerCase()}${l.room ? " · ауд. "+l.room : ""}`;
  $("#nextTime").textContent = l.start;
}

function setActive(view){
  $$(".tab,.nav-btn").forEach(el => {
    el.classList.toggle("active",el.dataset.view===view);
  });
}

function render(view=state.view){
  state.view = view;
  setActive(view);

  const now = new Date();
  const today = now.getDay();
  const tomorrow = (today+1)%7;

  $("#screenTitle").textContent = view==="today" ? "Сьогодні" : view==="tomorrow" ? "Завтра" : "Тиждень";

  if(view==="today" || view==="tomorrow"){
    const target = view==="today" ? today : tomorrow;
    const date = view==="today" ? dateForOffset(0) : dateForOffset(1);
    const list = state.lessons.filter(l=>l.day===target).sort((a,b)=>a.pair-b.pair);
    const next = currentOrNext();

    let html = `<div class="day-head"><h2>${DAYS[target]}</h2><span>${shortDate(date)}</span></div>`;
    html += list.length
      ? list.map(l => lessonCard(l,view==="today" && next?.current && sameLesson(l,next.lesson))).join("")
      : emptyCard();

    $("#content").innerHTML = html;
    return;
  }

  let html = "";
  for(let d=1;d<=6;d++){
    const list = state.lessons.filter(l=>l.day===d).sort((a,b)=>a.pair-b.pair);
    if(!list.length) continue;
    html += `<div class="day-head"><h2>${DAYS[d]}</h2></div>`;
    html += list.map(l=>lessonCard(l)).join("");
  }
  $("#content").innerHTML = html || emptyCard("Тиждень порожній");
}

function formatUpdated(raw){
  const value = raw?.updated_at ?? raw?.updatedAt ?? raw?.last_update ?? raw?.generated_at ?? raw?.timestamp;
  if(!value) return "час оновлення не вказаний";

  const d = new Date(value);
  if(!Number.isNaN(d.getTime())){
    return "Оновлено " + new Intl.DateTimeFormat("uk-UA",{
      day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
    }).format(d);
  }
  return "Оновлено " + String(value);
}

function showError(message){
  $("#content").innerHTML = `<div class="error"><strong>Не вдалося отримати розклад</strong>${esc(message)}</div>`;
}

async function loadData(manual=false){
  const refresh = $("#refreshBtn");
  if(manual) refresh.classList.add("loading");

  try{
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),90000);

    const res = await fetch(`${API_URL}?t=${Date.now()}`,{
      cache:"no-store",
      signal:controller.signal
    });
    clearTimeout(timeout);

    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    state.raw = raw;
    state.lessons = parseSchedule(raw);

    localStorage.setItem("ontu-schedule-cache",JSON.stringify(raw));

    renderHero();
    render(state.view);
    $("#updatedAt").textContent = formatUpdated(raw);

    if(!state.lessons.length){
      showError("API відповів, але пари не вдалося розпізнати.");
    }
  }catch(err){
    const cached = localStorage.getItem("ontu-schedule-cache");
    if(cached){
      try{
        const raw = JSON.parse(cached);
        state.raw = raw;
        state.lessons = parseSchedule(raw);
        renderHero();
        render(state.view);
        $("#updatedAt").textContent = formatUpdated(raw) + " · кеш";
      }catch{
        showError(err.name==="AbortError" ? "Render довго прокидається. Спробуй ще раз." : err.message);
      }
    }else{
      showError(err.name==="AbortError" ? "Render довго прокидається. Спробуй ще раз." : err.message);
    }
  }finally{
    refresh.classList.remove("loading");
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  $$(".tab,.nav-btn").forEach(btn=>{
    btn.addEventListener("click",()=>render(btn.dataset.view));
  });

  $("#refreshBtn").addEventListener("click",()=>loadData(true));

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js?v=clean1").catch(()=>{});
  }

  loadData();
});
