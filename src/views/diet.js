/**
 * 「饮食」页
 *
 * 一天分四餐（早/午/晚/加餐），每餐一个卡片。
 * 加食物 = 往那一餐里追加一条；同一天同一餐永远只有一份记录，不会记出两顿"午餐"。
 *
 * 每条食物存的是**热量快照**（当时的 kcal 和三大宏），
 * 所以以后改了食物库，昨天的记录也不会变 —— 这是历史口径能对上的前提。
 */

import { h, raw, dash } from "../ui/dom.js";
import { navBar } from "../ui/layout.js";
import { MEAL_TYPES, fmtMD, fmtRelativeDay, fmtNum, weekdayCN, round, todayKey } from "../schema.js";
import { dayIntake, dayExpenditure, mealTotals, targets } from "../calc.js";
import { icons } from "../ui/icons.js";

export function renderDiet(data, ctx) {
  const date = ctx.dietDate;
  const isToday = date === todayKey();
  const intake = dayIntake(data, date);
  const t = targets(data.settings);
  const exp = dayExpenditure(data, date);
  const pct = t.kcal > 0 ? Math.min(100, Math.round((intake.kcal / t.kcal) * 100)) : 0;
  const over = intake.kcal - t.kcal;

  const meals = MEAL_TYPES.map((m) => ({
    ...m,
    meal: (data.meals ?? []).find((x) => x.localDate === date && x.mealType === m.id) ?? null,
  }));

  const emptyAll = meals.every((m) => !m.meal);

  return h`
  ${navBar({
    title: `${fmtRelativeDay(date)} · ${weekdayCN(date)}`,
    back: undefined,
    rightLabel: isToday ? "" : "今天",
    rightAct: "diet-today",
  })}

  <div class="segmented" style="margin-top:0">
    <button data-act="diet-shift" data-n="-1">‹ 前一天</button>
    <button class="on" style="pointer-events:none">${fmtMD(date)}</button>
    <button data-act="diet-shift" data-n="1">后一天 ›</button>
  </div>

  <div class="card">
    <div style="display:flex;gap:16px;padding:16px;align-items:center">
      <div class="ring-wrap">
        <div class="ring" style="--p:${pct}"><span>${pct}<em style="font-size:11px;font-style:normal;color:var(--text-3)">%</em></span></div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--text-3)">摄入</div>
        <div style="font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2">
          ${fmtNum(intake.kcal)}<span style="font-size:14px;color:var(--text-3);font-weight:400"> / ${t.kcal} kcal</span>
        </div>
        <div style="font-size:13px;color:${over > 0 ? "var(--red)" : "var(--text-3)"};margin-top:4px">
          ${over > 0 ? `超出 ${over} kcal` : `还剩 ${t.kcal - intake.kcal} kcal`}
        </div>
      </div>
    </div>

    <div class="macro-row" style="border-top:0.5px solid var(--sep-weak)">
      ${macro("蛋白", intake.p, t.protein, "var(--blue)")}
      ${macro("碳水", intake.c, t.carbs, "var(--orange)")}
      ${macro("脂肪", intake.f, t.fat, "var(--green)")}
    </div>

    <div class="row">
      <div class="grow sub" style="white-space:normal;line-height:1.5">
        今日支出 ${exp.total} kcal ＝ 基础 ${exp.base} + 训练 ${exp.burn}
      </div>
    </div>
  </div>

  ${emptyAll
    ? h`<div class="empty">这天还没有饮食记录。</div>
        <div class="btn-row">
          <button class="btn secondary" data-act="copy-yesterday" data-date="${date}">复制前一天的饮食</button>
        </div>`
    : ""}

  ${meals.map((m) => mealCard(m, date))}

  <div class="hint">
    热量目标 ${t.kcal} kcal（BMR ${t.bmr} × 活动 ${data.settings.activityFactor}${
      data.settings.kcalTarget == null ? "，按 −300 自动推算" : "，手动设定"
    }）。
  </div>`;
}

function macro(label, now, target, color) {
  return h`<div class="macro">
    <div class="k"><span>${label}</span><span class="mono">${round(now, 0)} / ${target}g</span></div>
    <div class="bar"><i style="width:${target ? Math.min(100, (now / target) * 100) : 0}%;background:${color}"></i></div>
  </div>`;
}

function mealCard({ id, label, meal }, date) {
  const total = meal ? mealTotals(meal) : { kcal: 0, p: 0, c: 0, f: 0 };

  return h`<div class="card">
    <div class="meal-head">
      <span class="nm">${label}</span>
      <span class="kc">${total.kcal ? `${total.kcal} kcal` : "—"}</span>
    </div>
    ${total.kcal ? h`<div class="meal-macros">蛋白 ${total.p}g · 碳水 ${total.c}g · 脂肪 ${total.f}g</div>` : ""}

    ${(meal?.items ?? []).map((it) => mealItem(meal, it))}

    <div class="row tappable" data-act="add-food" data-meal="${id}" data-date="${date}">
      <div class="grow" style="color:var(--blue);font-size:15px">＋ 添加食物</div>
    </div>
  </div>`;
}

function mealItem(meal, it) {
  return h`<div class="meal-item">
    <div class="nm">${it.name}</div>
    <div class="amt">${it.grams ? `${it.grams}g` : ""}</div>
    <div class="kc">${it.kcal}</div>
    <button class="link-danger" style="padding:4px;opacity:.55"
      data-act="del-item" data-meal="${meal.id}" data-item="${it.id}"
      aria-label="删除">${raw(icons.close)}</button>
  </div>`;
}
