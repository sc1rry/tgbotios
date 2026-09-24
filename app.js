from pathlib import Path

src = Path("/mnt/data/ontu-pwa/app.js")
text = src.read_text(encoding="utf-8")

start = text.index("function rowsFrom(raw)")
end = text.index("function nextLesson()", start)

replacement = r'''function rowsFrom(raw){
  const out=[];
  const seen=new Set();
  let currentDay=null;

  function addRow(strings){
    const ss=strings
      .filter(x=>["string","number"].includes(typeof x))
      .map(String);

    // Если строка содержит название дня — запоминаем его для всех следующих строк.
    for(const s of ss){
      const d=dayIndex(s);
      if(d!=null) currentDay=d;
    }

    const pair=ss.find(x=>/^[1-6]$/.test(norm(x)));
    if(!pair || currentDay==null) return;

    const useful=ss.filter(x=>dayIndex(x)==null);
    if(useful.length<2) return;

    const key=currentDay+"|"+useful.map(norm).join("•");
    if(seen.has(key)) return;

    seen.add(key);
    out.push({day:currentDay,strings:ss});
  }

  function walk(node){
    if(node==null) return;

    if(Array.isArray(node)){
      // ВАЖНО: элементы массива обрабатываются по порядку.
      // Поэтому день, найденный в первой строке блока, сохраняется
      // для 2-й, 3-й и остальных пар этого дня.
      for(const item of node){
        if(Array.isArray(item)){
          addRow(item);
          walk(item);
        }else if(item && typeof item==="object"){
          walk(item);
        }else if(typeof item==="string"){
          const d=dayIndex(item);
          if(d!=null) currentDay=d;
        }
      }
      return;
    }

    if(typeof node==="object"){
      // Некоторые варианты JSON могут хранить день в ключе объекта.
      for(const [k,v] of Object.entries(node)){
        const dk=dayIndex(k);
        if(dk!=null) currentDay=dk;

        if(typeof v==="string"){
          const dv=dayIndex(v);
          if(dv!=null) currentDay=dv;
        }
      }

      addRow(Object.values(node));

      // Сохраняем порядок свойств объекта.
      for(const v of Object.values(node)){
        if(Array.isArray(v) || (v && typeof v==="object")){
          walk(v);
        }
      }
    }
  }

  walk(raw?.sections ?? raw);
  return out;
}

function parse(raw){
  const arr=[];

  for(const r of rowsFrom(raw)){
    const pairIndex=r.strings.findIndex(x=>/^[1-6]$/.test(norm(x)));
    if(pairIndex===-1) continue;

    const pair=Number(norm(r.strings[pairIndex]));

    const text=r.strings
      .filter((x,i)=>i!==pairIndex && dayIndex(x)==null)
      .map(norm)
      .filter(Boolean)
      .join(" • ");

    if(!text) continue;

    arr.push({
      day:r.day,
      pair,
      start:TIMES[pair]?.[0]||"",
      end:TIMES[pair]?.[1]||"",
      subject:subjectOf(text),
      type:typeOf(text),
      teacher:teacherOf(text),
      room:roomOf(text),
      zoom:zoom(text)
    });
  }

  // Убираем только настоящие дубликаты, но не разные занятия
  // на одной и той же паре.
  const unique=new Map();

  for(const l of arr){
    const key=[
      l.day,
      l.pair,
      norm(l.subject),
      norm(l.teacher),
      norm(l.room),
      norm(l.zoom)
    ].join("|");

    if(!unique.has(key)) unique.set(key,l);
  }

  return [...unique.values()].sort(
    (a,b)=>a.day-b.day || a.pair-b.pair || a.subject.localeCompare(b.subject,"uk")
  );
}
'''

fixed = text[:start] + replacement + text[end:]

# Also make subject extraction less likely to collapse to "Пара".
old_subject_start = fixed.index('function subjectOf(text="")')
old_subject_end = fixed.index('function rowsFrom(raw)', old_subject_start)

subject_replacement = r'''function subjectOf(text=""){
  let t=String(text)
    .replace(/https?:\/\/\S+/gi," ")
    .replace(/Запрошення.*$/i," ")
    .replace(/Join Zoom Meeting.*$/i," ")
    .replace(/Ідентифікатор конференції.*$/i," ")
    .replace(/Код доступу.*$/i," ")
    .replace(/Meeting ID.*$/i," ")
    .replace(/Passcode.*$/i," ");

  const parts=t
    .split(/[•|\n]/)
    .map(norm)
    .filter(Boolean);

  const filtered=parts.filter(part=>{
    const low=part.toLowerCase();

    if(/^[1-6]$/.test(part)) return false;
    if(dayIndex(part)!=null) return false;

    if(/^(лекція|лекция|лекц\.?|практика|практ\.?|лабораторна|лабораторная|лаб\.?|онлайн)$/i.test(part))
      return false;

    if(/^(ауд\.?|аудиторія|аудитория|каб\.?|кабінет)\b/i.test(part))
      return false;

    if(/^(meeting id|passcode|ідентифікатор конференції|код доступу)\b/i.test(part))
      return false;

    return true;
  });

  // На сайті ОНТУ назва дисципліни зазвичай стоїть першою
  // серед корисних частин рядка.
  return filtered[0] || parts[0] || "Пара";
}
'''

fixed = fixed[:old_subject_start] + subject_replacement + fixed[old_subject_end:]

out = Path("/mnt/data/app.js")
out.write_text(fixed, encoding="utf-8")

print("Готовый исправленный файл создан:", out)
