/**
 * 入口：路由 + 事件分发
 *
 * 这里没有框架，只有一套「点一下 → 改数据 → 重画整页」的循环。
 * 页面小（几百个节点），整页重画在手机上也是瞬间的事，
 * 换来的是**界面永远等于数据**，不会出现"界面上还是旧值"这种鬼问题。
 *
 * 所有会改数据的地方都必须走 repo.js，这里不直接动 data。
 */

import { dateKey, todayKey } from "./schema.js";
import { exportCSV, exportJSON, getData, importJSON, isDegraded, clearAll } from "./db.js";
import * as repo from "./repo.js";
import { renderToday } from "./views/today.js";
import { renderTrainList, renderSession } from "./views/train.js";
import { renderDiet } from "./views/diet.js";
import { renderStats } from "./views/stats.js";
import { renderSheet } from "./views/sheet.js";
import { renderTabbar } from "./ui/icons.js";

const app = document.getElementById("app");
const sheetRoot = document.getElementById("sheet-root");

const state = {
  route: { name: "today" },
  today: todayKey(),
  dietDate: todayKey(),
  range: 7,
  sheet: null,
};

/* ── 路由 ─────────────────────────────────────────── */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [seg, id] = raw.split("/");
  if (seg === "train") return id ? { name: "session", id } : { name: "train" };
  if (seg === "diet") return { name: "diet" };
  if (seg === "stats") return { name: "stats" };
  return { name: "today" };
}

function go(hash) {
  if (location.hash === hash) {
    render({ keepScroll: false });
  } else {
    location.hash = hash;
  }
}

/* ── 渲染 ─────────────────────────────────────────── */

let lastScroll = 0;

function render({ keepScroll = true } = {}) {
  const data = getData();
  if (state.today !== todayKey()) state.today = todayKey();

  const ctx = { today: state.today, dietDate: state.dietDate, range: state.range };
  let html = "";
  let tab = null;
  let actionbar = false;

  switch (state.route.name) {
    case "train":
      html = renderTrainList(data, ctx);
      tab = "train";
      break;
    case "session": {
      html = renderSession(data, ctx, state.route.id);
      const s = repo.getSession(state.route.id);
      actionbar = !!s && s.status === "active";
      tab = actionbar ? null : "train";
      break;
    }
    case "diet":
      html = renderDiet(data, ctx);
      tab = "diet";
      break;
    case "stats":
      html = renderStats(data, ctx);
      tab = "stats";
      break;
    default:
      html = renderToday(data, ctx);
      tab = "today";
  }

  app.className = "app" + (actionbar ? " has-actionbar" : "");
  app.innerHTML = html + (tab ? renderTabbar(tab) : "");

  if (keepScroll) window.scrollTo(0, lastScroll);
  else window.scrollTo(0, 0);

  renderSheetRoot();

  if (isDegraded()) {
    toast("浏览器不允许保存数据，请别用无痕模式", true);
  }
}

function renderSheetRoot() {
  sheetRoot.innerHTML = renderSheet(getData(), state.sheet);
}

function renderSheetOnly() {
  renderSheetRoot();
}

function closeSheet() {
  state.sheet = null;
  renderSheetRoot();
}

/* ── 提示 ─────────────────────────────────────────── */

let toastTimer = null;
function toast(msg, bad = false) {
  if (!msg) return;
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

/** 统一处理 repo 的返回：失败就提示并重画（把界面拉回真实数据） */
function handle(result, okMsg = "") {
  if (!result) return false;
  if (result.ok === false) {
    toast(result.error || "操作失败", true);
    render();
    return false;
  }
  if (okMsg) toast(okMsg);
  return true;
}

function mealByTime() {
  const hh = new Date().getHours();
  if (hh < 10) return "breakfast";
  if (hh < 15) return "lunch";
  if (hh < 21) return "dinner";
  return "snack";
}

/* ── 点击事件 ─────────────────────────────────────── */

document.addEventListener("click", (e) => {
  const hit = e.target.closest("[data-act]");
  if (!hit) return;
  const act = hit.dataset.act;
  const d = hit.dataset;

  // 先记下滚动位置，重画后还原（放在最前面，避免有的分支提前 return 漏记）
  lastScroll = window.scrollY;

  // 点击遮罩空白处关闭面板
  if (act === "sheet-mask") {
    if (!e.target.closest("[data-sheet-panel]")) closeSheet();
    return;
  }

  switch (act) {
    /* 训练 */
    case "start":
      state.sheet = { kind: "templates" };
      renderSheetOnly();
      break;

    case "pick-template": {
      const r = repo.startSession({ templateId: d.id });
      if (handle(r)) {
        closeSheet();
        go("#/train/" + r.session.id);
        if (r.reused) toast("已有一场进行中的训练，继续它");
      }
      break;
    }

    case "resume":
      go("#/train/" + d.id);
      break;

    case "add-exercise":
      state.sheet = { kind: "exercise", sessionId: d.id };
      renderSheetOnly();
      break;

    case "pick-exercise": {
      const r = repo.addExerciseToSession(state.sheet?.sessionId, d.id);
      if (handle(r)) closeSheet();
      break;
    }

    case "toggle-set": {
      const on = hit.classList.contains("on");
      const r = repo.toggleSet(d.id, d.entry, d.set, !on);
      if (r.ok) render();
      else toast(r.error, true);
      break;
    }

    case "add-set":
      if (handle(repo.addSet(d.id, d.entry))) render();
      break;

    case "prefill": {
      const r = repo.prefillFromLast(d.id, d.entry);
      if (handle(r, r.ok ? `已套用上次的 ${r.filled} 组` : "")) render();
      break;
    }

    case "del-entry":
      state.sheet = {
        kind: "confirm",
        text: "移除这个动作？它已经记录的组会一起删掉。",
        confirmAct: "confirm-del-entry",
        confirmLabel: "移除",
        extra: `data-id="${d.id}" data-entry="${d.entry}"`,
      };
      renderSheetOnly();
      break;

    case "confirm-del-entry":
      if (handle(repo.removeEntry(d.id, d.entry))) closeSheet();
      break;

    case "finish-open":
      state.sheet = { kind: "finish", id: d.id, feeling: "ok" };
      renderSheetOnly();
      break;

    case "pick-feeling":
      if (state.sheet) {
        state.sheet.feeling = d.id;
        renderSheetOnly();
      }
      break;

    case "finish-confirm": {
      const burnEl = document.getElementById("finish-burn");
      const noteEl = document.getElementById("finish-note");
      const estimate = Number(burnEl?.dataset.estimate);
      const manual = burnEl ? Number(burnEl.value) : NaN;
      const changed = Number.isFinite(manual) && Number.isFinite(estimate) && Math.abs(manual - estimate) > 0.5;
      const r = repo.finishSession(d.id, {
        feeling: state.sheet?.feeling ?? "ok",
        note: noteEl?.value ?? "",
        burnKcal: Number.isFinite(manual) ? manual : null,
        burnSource: changed ? "manual" : "estimate",
      });
      if (handle(r, "训练已保存")) {
        closeSheet();
        go("#/train");
      }
      break;
    }

    case "reopen": {
      const r = repo.reopenSession(d.id);
      if (handle(r, "可以继续改了")) render({ keepScroll: false });
      break;
    }

    case "del-session":
      state.sheet = {
        kind: "confirm",
        text: "删除这次训练？里面的组会一起消失，不能撤销。",
        confirmAct: "confirm-del-session",
        confirmLabel: "删除",
        extra: `data-id="${d.id}"`,
      };
      renderSheetOnly();
      break;

    case "confirm-del-session":
      if (handle(repo.deleteSession(d.id))) {
        closeSheet();
        go("#/train");
      }
      break;

    /* 饮食 */
    case "add-food-quick":
      state.sheet = { kind: "food", mealType: mealByTime(), date: state.today };
      renderSheetOnly();
      break;

    case "add-food":
      state.sheet = { kind: "food", mealType: d.meal, date: d.date || state.dietDate };
      renderSheetOnly();
      break;

    case "pick-food":
      state.sheet = { kind: "foodQty", foodId: d.id, grams: 100, mealType: state.sheet.mealType, date: state.sheet.date };
      renderSheetOnly();
      break;

    case "qty-set": {
      const input = document.getElementById("qty-grams");
      if (input) {
        input.value = d.g;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      break;
    }

    case "food-qty-confirm": {
      const sheet = state.sheet;
      const input = document.getElementById("qty-grams");
      const grams = input ? Number(input.value) : 100;
      const r = repo.addFoodItem({
        localDate: sheet.date,
        mealType: sheet.mealType,
        foodId: sheet.foodId,
        grams,
      });
      if (handle(r)) {
        closeSheet();
        state.dietDate = sheet.date;
        if (r.warning) toast(r.warning);
        render();
      }
      break;
    }

    case "custom-food":
      state.sheet = { kind: "customFood", mealType: d.meal, date: d.date };
      renderSheetOnly();
      break;

    case "custom-food-save": {
      const sheet = state.sheet;
      const name = document.getElementById("cf-name")?.value?.trim();
      const kcal = Number(document.getElementById("cf-kcal")?.value);
      const p = Number(document.getElementById("cf-p")?.value) || 0;
      const c = Number(document.getElementById("cf-c")?.value) || 0;
      const f = Number(document.getElementById("cf-f")?.value) || 0;
      if (!name) return toast("食物名不能为空", true);
      if (!Number.isFinite(kcal) || kcal < 0) return toast("热量要填数字", true);

      const r = repo.addFoodItem({
        localDate: sheet.date,
        mealType: sheet.mealType,
        custom: { name, kcal, protein: p, carbs: c, fat: f },
      });
      if (handle(r)) {
        closeSheet();
        state.dietDate = sheet.date;
        if (r.warning) toast(r.warning);
        render();
      }
      break;
    }

    case "del-item":
      if (handle(repo.removeFoodItem(d.meal, d.item))) render();
      break;

    case "copy-yesterday": {
      const from = new Date(d.date + "T00:00:00");
      from.setDate(from.getDate() - 1);
      const r = repo.copyDayMeals(dateKey(from), d.date);
      if (handle(r, "已复制")) render();
      break;
    }

    case "diet-shift": {
      const base = new Date(state.dietDate + "T00:00:00");
      base.setDate(base.getDate() + Number(d.n));
      state.dietDate = dateKey(base);
      render({ keepScroll: false });
      break;
    }

    case "diet-today":
      state.dietDate = state.today;
      render({ keepScroll: false });
      break;

    /* 身体 */
    case "body-open":
      state.sheet = { kind: "body", date: state.today };
      renderSheetOnly();
      break;

    case "body-save": {
      const w = document.getElementById("bd-weight")?.value;
      const wa = document.getElementById("bd-waist")?.value;
      const fat = document.getElementById("bd-fat")?.value;
      const r = repo.saveBody({ localDate: d.date, weightKg: w, waistCm: wa, bodyFatPct: fat });
      if (handle(r, "已记录")) {
        closeSheet();
        render();
      }
      break;
    }

    /* 统计 */
    case "range":
      state.range = Number(d.n);
      render({ keepScroll: false });
      break;

    case "apply-targets":
      if (handle(repo.applyRecommendedTargets(), "已按推荐值填好")) render();
      break;

    /* 备份 */
    case "export-json": {
      download("suishenjian-backup-" + state.today + ".json", exportJSON(), "application/json");
      toast("已导出 JSON");
      break;
    }

    case "export-csv": {
      download("suishenjian-" + state.today + ".csv", "\ufeff" + exportCSV(), "text/csv");
      toast("已导出 CSV");
      break;
    }

    case "import-open": {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        const r = importJSON(text);
        toast(r.message, !r.ok);
        if (r.ok) render();
      };
      input.click();
      break;
    }

    case "clear-open":
      state.sheet = {
        kind: "confirm",
        text: "清空这台手机上的全部记录？训练、饮食、身体数据都会消失，且不能撤销。建议先导出备份。",
        confirmAct: "clear-confirm",
        confirmLabel: "清空",
      };
      renderSheetOnly();
      break;

    case "clear-confirm":
      clearAll();
      closeSheet();
      render({ keepScroll: false });
      toast("已清空");
      break;

    case "close-sheet":
      closeSheet();
      break;

    default:
      break;
  }

  // 记录当前滚动位置，重画后还原
  lastScroll = window.scrollY;
});

/* ── 输入：失焦 / 改变时保存 ──────────────────────── */

document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const d = el.dataset;

  if (d.act === "set-weight" || d.act === "set-reps") {
    const patch = d.act === "set-weight" ? { weightKg: el.value } : { reps: el.value };
    const r = repo.updateSet(d.id, d.entry, d.set, patch);
    if (!r.ok) toast(r.error, true);
    render(); // 无论成败都重画：成功刷新统计，失败把非法值拉回原值
    return;
  }

  if (d.act === "session-title") {
    repo.updateSessionMeta(d.id, { title: el.value });
    return;
  }

  if (d.act === "session-note") {
    const r = repo.updateSessionMeta(d.id, { note: el.value });
    if (!r.ok) toast(r.error, true);
    return;
  }

  if (d.act === "setting") {
    const key = d.key;
    let value;
    if (key === "sex") value = el.value;
    else if (key === "activityFactor") value = Number(el.value);
    else if (key === "kcalTarget" || key === "proteinTarget") value = el.value === "" ? null : Number(el.value);
    else value = el.value === "" ? null : Number(el.value);

    const r = repo.saveSettings({ [key]: value });
    if (!r.ok) toast(r.error, true);
    render();
  }
});

/* ── 实时筛选 / 热量预览 ──────────────────────────── */

document.addEventListener("input", (e) => {
  const el = e.target;

  if (el.dataset.filter === "food" || el.dataset.filter === "exercise") {
    const q = el.value.trim().toLowerCase();
    const scope = el.closest(".sheet-body") ?? document;
    scope.querySelectorAll("[data-name]").forEach((row) => {
      const hit = !q || (row.dataset.name || "").toLowerCase().includes(q);
      row.style.display = hit ? "" : "none";
    });
    // 分组标题下面全空了就把标题也藏起来
    scope.querySelectorAll("[data-group]").forEach((g) => {
      const visible = [...g.querySelectorAll("[data-name]")].some((r) => r.style.display !== "none");
      g.style.display = visible ? "" : "none";
    });
    return;
  }

  if (el.id === "qty-grams") {
    const kcal100 = Number(el.dataset.foodKcal) || 0;
    const grams = Number(el.value) || 0;
    const out = document.getElementById("qty-kcal");
    if (out) out.textContent = Math.round((kcal100 * grams) / 100);
  }
});

/* ── 工具 ─────────────────────────────────────────── */

function download(filename, text, type) {
  const blob = new Blob([text], { type: type + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ── 启动 ─────────────────────────────────────────── */

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  render({ keepScroll: false });
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

state.route = parseRoute();
state.dietDate = state.today;
render({ keepScroll: false });

// 跨过凌晨时，回到前台自动刷新"今天"
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.today !== todayKey()) {
    state.today = todayKey();
    render({ keepScroll: false });
  }
});
