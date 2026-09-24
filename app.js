const API_URL = "https://tgbot-zvra.onrender.com/api/schedule";

const TIMES = {
  1: ["08:00", "09:20"],
  2: ["09:30", "10:50"],
  3: ["11:30", "12:50"],
  4: ["13:00", "14:20"],
  5: ["14:30", "15:50"],
  6: ["16:00", "17:20"],
};

const DAYS = [
  "Неділя",
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "Пʼятниця",
  "Субота"
];

const DAY_MAP = {
  "понеділок": 1,
  "понедельник": 1,
  "вівторок": 2,
  "вторник": 2,
  "середа": 3,
  "среда": 3,
  "четвер": 4,
  "четверг": 4,
  "пʼятниця": 5,
  "п'ятниця": 5,
  "пятница": 5,
  "субота": 6,
  "суббота": 6,
  "неділя": 0,
  "воскресенье": 0
};

const state = {
  raw: null,
  lessons: [],
  view: "today"
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function norm(s = "") {
  return String(s)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseSpacedLetters(s = "") {
  const t = norm(s);

  if (/^(?:[А-ЯІЇЄҐA-Z]\s+){3,}[А-ЯІЇЄҐA-Z]$/i.test(t)) {
    return t.replace(/\s+/g, "");
  }

  return t;
}

function dayIndex(s = "") {
  const t = collapseSpacedLetters(s)
    .toLowerCase()
    .replace(/’/g, "ʼ");

  for (const [k, v] of Object.entries(DAY_MAP)) {
    if (t.includes(k)) return v;
  }

  return null;
}

function zoom(text = "") {
  const m = String(text).match(/https?:\/\/[^\s<>"']+/i);

  return m
    ? m[0].replace(/[),.;]+$/, "")
    : null;
}

function typeOf(text = "") {
  const t = text.toLowerCase();

  if (t.includes("лаборатор")) return "Лаб";
  if (t.includes("практи")) return "Практика";
  if (t.includes("лекц")) return "Лекція";
  if (t.includes("онлайн") || t.includes("zoom")) return "Онлайн";

  return "Пара";
}

function teacherOf(text = "") {
  const parts = String(text)
    .split(/[•|\n]/)
    .map(norm)
    .filter(Boolean);

  return parts.find(x =>
    /[А-ЯІЇЄҐ][а-яіїєґ]+\s+[А-ЯІЇЄҐ]\.?[А-ЯІЇЄҐ]?\.?/u.test(x) ||
    /(викладач|доцент|професор|асистент)/i.test(x)
  ) || null;
}

function roomOf(text = "") {
  const patterns = [
    /(?:ауд\.?|аудиторія|каб\.?|кабінет)\s*[:№]?\s*([A-Za-zА-Яа-яІіЇїЄєҐґ0-9\-\/]+)/i,
    /\b([А-ЯA-Z]?\d{2,4}[а-яА-ЯA-Za-z]?)\b/
  ];

  for (const re of patterns) {
    const m = String(text).match(re);

    if (m) return m[1];
  }

  return null;
}

function subjectOf(text = "") {
  let t = String(text)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/Запрошення.*$/i, " ")
    .replace(/Join Zoom Meeting.*$/i, " ")
    .replace(/Ідентифікатор конференції.*$/i, " ")
    .replace(/Код доступу.*$/i, " ")
    .replace(/Meeting ID.*$/i, " ")
    .replace(/Passcode.*$/i, " ");

  const parts = t
    .split(/[•|\n]/)
    .map(norm)
    .filter(Boolean);

  const filtered = parts.filter(part => {
    const low = part.toLowerCase();

    if (/^[1-6]$/.test(part)) return false;

    if (dayIndex(part) != null) return false;

    if (
      /^(лекція|лекция|лекц\.?|практика|практ\.?|лабораторна|лабораторная|лаб\.?|онлайн)$/i.test(part)
    ) {
      return false;
    }

    if (
      /^(ауд\.?|аудиторія|аудитория|каб\.?|кабінет)\b/i.test(part)
    ) {
      return false;
    }

    if (
      /^(meeting id|passcode|ідентифікатор конференції|код доступу)\b/i.test(part)
    ) {
      return false;
    }

    return true;
  });

  return filtered[0] || parts[0] || "Пара";
}

function rowsFrom(raw) {
  const out = [];
  let currentDay = null;
  const seen = new Set();

  function maybeAdd(strings) {
    const ss = strings
      .filter(v =>
        typeof v === "string" ||
        typeof v === "number"
      )
      .map(String);

    for (const s of ss) {
      const d = dayIndex(s);

      if (d != null) {
        currentDay = d;
      }
    }

    const pair = ss.find(v =>
      /^[1-6]$/.test(norm(v))
    );

    if (!pair || currentDay == null) return;

    const key =
      `${currentDay}|${ss.map(norm).join("•")}`;

    if (seen.has(key)) return;

    seen.add(key);

    out.push({
      day: currentDay,
      strings: ss
    });
  }

  function walk(node) {
    if (node == null) return;

    if (Array.isArray(node)) {
      for (const item of node) {

        if (Array.isArray(item)) {
          maybeAdd(item);
          walk(item);

        } else if (
          item &&
          typeof item === "object"
        ) {
          walk(item);

        } else if (
          typeof item === "string"
        ) {
          const d = dayIndex(item);

          if (d != null) {
            currentDay = d;
          }
        }
      }

      return;
    }

    if (typeof node === "object") {
      const entries = Object.entries(node);

      for (const [k, v] of entries) {
        const dk = dayIndex(k);

        if (dk != null) {
          currentDay = dk;
        }

        if (typeof v === "string") {
          const dv = dayIndex(v);

          if (dv != null) {
            currentDay = dv;
          }
        }
      }

      maybeAdd(Object.values(node));

      for (const [, v] of entries) {
        if (
          Array.isArray(v) ||
          (v && typeof v === "object")
        ) {
          walk(v);
        }
      }
    }
  }

  walk(raw?.sections ?? raw);

  return out;
}

function parse(raw) {
  const lessons = [];

  for (const row of rowsFrom(raw)) {

    const pairIndex = row.strings.findIndex(v =>
      /^[1-6]$/.test(norm(v))
    );

    if (pairIndex === -1) continue;

    const pair = Number(
      norm(row.strings[pairIndex])
    );

    const text = row.strings
      .filter((v, i) =>
        i !== pairIndex &&
        dayIndex(v) == null
      )
      .map(norm)
      .filter(Boolean)
      .join(" • ");

    if (!text) continue;

    lessons.push({
      day: row.day,
      pair,
      start: TIMES[pair]?.[0] || "",
      end: TIMES[pair]?.[1] || "",
      subject: subjectOf(text),
      type: typeOf(text),
      teacher: teacherOf(text),
      room: roomOf(text),
      zoom: zoom(text)
    });
  }

  const unique = new Map();

  for (const l of lessons) {
    const key = [
      l.day,
      l.pair,
      norm(l.subject),
      norm(l.teacher),
      norm(l.room),
      norm(l.zoom)
    ].join("|");

    if (!unique.has(key)) {
      unique.set(key, l);
    }
  }

  return [...unique.values()].sort(
    (a, b) =>
      a.day - b.day ||
      a.pair - b.pair ||
      a.subject.localeCompare(
        b.subject,
        "uk"
      )
  );
}

function nextLesson() {
  const now = new Date();

  const today = now.getDay();

  const minutes =
    now.getHours() * 60 +
    now.getMinutes();

  const todayLessons = state.lessons
    .filter(l => l.day === today)
    .sort((a, b) => a.pair - b.pair);

  for (const l of todayLessons) {
    const [sh, sm] =
      l.start.split(":").map(Number);

    const [eh, em] =
      l.end.split(":").map(Number);

    const start =
      sh * 60 + sm;

    const end =
      eh * 60 + em;

    if (minutes <= end) {
      return {
        lesson: l,
        current:
          minutes >= start &&
          minutes <= end
      };
    }
  }

  for (let add = 1; add <= 7; add++) {
    const day =
      (today + add) % 7;

    const list = state.lessons
      .filter(l => l.day === day)
      .sort((a, b) => a.pair - b.pair);

    if (list.length) {
      return {
        lesson: list[0],
        current: false
      };
    }
  }

  return null;
}

function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}

function icon(name) {
  const map = {
    pin: `
      <svg viewBox="0 0 24 24">
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/>
        <circle cx="12" cy="10" r="2.5"/>
      </svg>
    `,
    person: `
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3"/>
        <path d="M5 21c.6-4 3-6 7-6s6.4 2 7 6"/>
      </svg>
    `,
    video: `
      <svg viewBox="0 0 24 24">
        <rect x="3" y="6" width="13" height="12" rx="2"/>
        <path d="m16 10 5-3v10l-5-3"/>
      </svg>
    `
  };

  return map[name] || "";
}

function lessonCard(
  l,
  current = false
) {
  return `
    <article class="lesson-card ${current ? "current" : ""}">
      <div class="lesson-num">
        <strong>${l.pair}</strong>

        <span>
          ${esc(l.start)}<br>
          ${esc(l.end)}
        </span>
      </div>

      <div class="lesson-body">
        <div class="lesson-top">
          <div class="subject">
            ${esc(l.subject)}
          </div>

          <div class="badge">
            ${esc(l.type)}
          </div>
        </div>

        <div class="meta-row">

          ${
            l.teacher
              ? `
                <span class="meta-item">
                  ${icon("person")}
                  ${esc(l.teacher)}
                </span>
              `
              : ""
          }

          ${
            l.room
              ? `
                <span class="meta-item">
                  ${icon("pin")}
                  ауд. ${esc(l.room)}
                </span>
              `
              : ""
          }

        </div>

        ${
          l.zoom
            ? `
              <a
                class="zoom-link"
                href="${esc(l.zoom)}"
                target="_blank"
                rel="noopener"
              >
                ${icon("video")}
                Відкрити Zoom
              </a>
            `
            : ""
        }

      </div>
    </article>
  `;
}

function emptyState(
  title = "Пар немає"
) {
  return `
    <div class="empty">
      <strong>
        ${esc(title)}
      </strong>

      Можна трохи видихнути

      <div class="tiny">
        no alarms, no surprises
      </div>
    </div>
  `;
}

function renderHero() {
  const next = nextLesson();

  if (!next) {
    $("#nextSubject").textContent =
      "Пар не знайдено";

    $("#nextMeta").textContent =
      "перевір оновлення даних";

    $("#nextTime").textContent =
      "—";

    return;
  }

  const l = next.lesson;

  $("#nextSubject").textContent =
    l.subject;

  $("#nextMeta").textContent =
    next.current

      ? `зараз · ${l.type.toLowerCase()}${l.room ? " · ауд. " + l.room : ""}`

      : `${DAYS[l.day].toLowerCase()} · ${l.type.toLowerCase()}${l.room ? " · ауд. " + l.room : ""}`;

  $("#nextTime").textContent =
    l.start;
}

function renderView(view) {
  state.view = view;

  const now = new Date();

  const today =
    now.getDay();

  const tomorrow =
    (today + 1) % 7;

  $$(".seg,.nav-item")
    .forEach(el =>
      el.classList.toggle(
        "active",
        el.dataset.view === view
      )
    );

  $("#screenTitle").textContent =
    view === "today"
      ? "Сьогодні"
      : view === "tomorrow"
      ? "Завтра"
      : "Тиждень";

  if (
    view === "today" ||
    view === "tomorrow"
  ) {

    const day =
      view === "today"
        ? today
        : tomorrow;

    const list =
      state.lessons
        .filter(l => l.day === day)
        .sort((a, b) =>
          a.pair - b.pair
        );

    let html = `
      <div class="day-heading">
        <h2>${DAYS[day]}</h2>
      </div>
    `;

    html +=
      list.length
        ? list.map(l =>
            lessonCard(l)
          ).join("")
        : emptyState();

    $("#content").innerHTML =
      html;

    return;
  }

  let html = "";

  for (
    let day = 1;
    day <= 6;
    day++
  ) {
    const list =
      state.lessons
        .filter(l =>
          l.day === day
        )
        .sort((a, b) =>
          a.pair - b.pair
        );

    if (!list.length) continue;

    html += `
      <div class="day-heading">
        <h2>
          ${DAYS[day]}
        </h2>
      </div>
    `;

    html +=
      list
        .map(l =>
          lessonCard(l)
        )
        .join("");
  }

  $("#content").innerHTML =
    html ||
    emptyState(
      "Тиждень порожній"
    );
}

function updatedText(raw) {
  const value =
    raw?.updated_at ||
    raw?.updatedAt ||
    raw?.last_update ||
    raw?.generated_at ||
    raw?.timestamp;

  if (!value) {
    return "час оновлення не вказаний";
  }

  const d =
    new Date(value);

  if (!isNaN(d)) {
    return (
      "Оновлено " +
      new Intl.DateTimeFormat(
        "uk-UA",
        {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      ).format(d)
    );
  }

  return `Оновлено ${value}`;
}

async function loadData() {
  $("#content").innerHTML = `
    <div class="skeleton"></div>
    <div class="skeleton"></div>
  `;

  try {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        90000
      );

    const res =
      await fetch(
        `${API_URL}?t=${Date.now()}`,
        {
          cache: "no-store",
          signal:
            controller.signal
        }
      );

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status}`
      );
    }

    const raw =
      await res.json();

    state.raw =
      raw;

    state.lessons =
      parse(raw);

    renderHero();

    renderView(
      state.view
    );

    $("#updatedAt").textContent =
      updatedText(raw);

    localStorage.setItem(
      "ontu-cache",
      JSON.stringify(raw)
    );

  } catch (err) {

    const cached =
      localStorage.getItem(
        "ontu-cache"
      );

    if (cached) {
      try {
        const raw =
          JSON.parse(cached);

        state.raw =
          raw;

        state.lessons =
          parse(raw);

        renderHero();

        renderView(
          state.view
        );

        $("#updatedAt").textContent =
          updatedText(raw) +
          " · кеш";

        return;

      } catch {}
    }

    $("#content").innerHTML = `
      <div class="error-card">

        <strong>
          Не вдалося отримати розклад
        </strong>

        ${
          err.name === "AbortError"
            ? "Render довго прокидається. Спробуй ще раз."
            : esc(err.message)
        }

      </div>
    `;

    $("#updatedAt").textContent =
      "немає зʼєднання";
  }
}

$$(".seg,.nav-item")
  .forEach(el => {

    el.addEventListener(
      "click",
      () =>
        renderView(
          el.dataset.view
        )
    );

  });

$("#refreshBtn")
  .addEventListener(
    "click",
    loadData
  );

if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    () =>
      navigator.serviceWorker.register(
        "./service-worker.js"
      )
  );
}

loadData();
