/**
 * 底部弹出面板
 *
 * 所有"临时任务"都放这里：选模板、加动作、结束训练、加食物、记身体数据、二次确认。
 * 好处是主页面不用跳来跳去，手机上少一层返回。
 */

import { h, raw } from "../ui/dom.js";
import { FEELINGS, fmtMD, todayKey, weekdayCN } from "../schema.js";
import { ALL_TEMPLATES, allExercises, allFoods } from "../seed.js";
import { metBurn, sessionMinutes, sessionSets, sessionVolume } from "../calc.js";

export function renderSheet(data, sheet) {
  if (!sheet) return "";
  return `<div class="sheet-mask" data-act="sheet-mask">
    <div class="sheet" data-sheet-panel>
      ${body(data, sheet)}
    </div>
  </div>`;
}

function head(title, confirmLabel = "", confirmAct = "", extra = "") {
  return h`<div class="sheet-head">
    <button data-act="close-sheet">取消</button>
    <div class="t">${title}</div>
    ${
      confirmLabel
        ? h`<button class="right" data-act="${confirmAct}" ${raw(extra)}>${confirmLabel}</button>`
        : h`<button style="visibility:hidden">占位</button>`
    }
  </div>`;
}

function body(data, sheet) {
  switch (sheet.kind) {
    case "templates":
      return templatesSheet(data);
    case "exercise":
      return exerciseSheet(data, sheet);
    case "finish":
      return finishSheet(data, sheet);
    case "food":
      return foodSheet(data, sheet);
    case "foodQty":
      return foodQtySheet(data, sheet);
    case "customFood":
      return customFoodSheet(sheet);
    case "body":
      return bodySheet(data, sheet);
    case "confirm":
      return confirmSheet(sheet);
    default:
      return `<div class="empty">未知面板</div>`;
  }
}

/* ── 选模板 ───────────────────────────────────────── */

function templatesSheet(data) {
  const all = [...ALL_TEMPLATES, ...(data.templates ?? [])];

  return h`${head("开始训练")}
  <div class="sheet-body">
    <div class="sheet-note">选一个模板会预填动作和空组；也可以选「空训练」自己加。记录以你打勾的组为准。</div>
    <div class="card">
      ${all
        .map(
          (t) => h`<div class="row tappable" data-act="pick-template" data-id="${t.id}">
            <div class="grow">
              <div class="label">${t.name}</div>
              <div class="sub">${t.focus}${t.exercises?.length ? ` · ${t.exercises.length} 个动作` : ""}</div>
            </div>
            <span class="chevron">${raw("›")}</span>
          </div>`,
        )}
    </div>
  </div>`;
}

/* ── 选动作 ───────────────────────────────────────── */

function exerciseSheet(data, sheet) {
  const all = allExercises(data);
  const groups = new Map();
  all.forEach((e) => {
    if (!groups.has(e.category)) groups.set(e.category, []);
    groups.get(e.category).push(e);
  });

  return h`${head("添加动作")}
  <div class="sheet-body">
    <div style="padding:0 16px 10px">
      <input class="field text" placeholder="搜索动作名或部位" data-filter="exercise" style="background:#fff" />
    </div>
    <div class="list-scroll">
      ${[...groups.entries()]
        .map(
          ([cat, items]) => h`<div data-group>
            <div class="hint" style="padding:10px 16px 4px;font-weight:600;color:var(--text-2)">${cat}</div>
            ${items
              .map(
                (e) => h`<div class="row tappable" data-act="pick-exercise" data-id="${e.id}" data-name="${e.name} ${e.category}">
                  <div class="grow label">${e.name}</div>
                  <span class="value">${e.bodyweight ? "自重" : e.equipment}</span>
                </div>`,
              )}
          </div>`,
        )}
    </div>
  </div>`;
}

/* ── 结束训练 ─────────────────────────────────────── */

function finishSheet(data, sheet) {
  const s = (data.sessions ?? []).find((x) => x.id === sheet.id);
  if (!s) return `${head("结束训练")}<div class="empty">找不到这次训练</div>`;

  const minutes = sessionMinutes(s);
  const estimate = metBurn({ met: 5, bodyWeightKg: data.settings.bodyWeightKg, minutes });
  const sets = sessionSets(s);
  const drafts = s.entries.reduce((n, e) => n + e.sets.filter((x) => !x.done).length, 0);

  return h`${head("结束训练", "完成", "finish-confirm", `data-id="${s.id}"`)}
  <div class="sheet-body">
    <div class="card">
      <div class="grid-3">
        <div><div class="k">时长</div><div class="v">${minutes}<span class="u">分</span></div></div>
        <div><div class="k">完成</div><div class="v">${sets}<span class="u">组</span></div></div>
        <div><div class="k">容量</div><div class="v">${Math.round(sessionVolume(s))}<span class="u">kg</span></div></div>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <div class="grow">
          <div class="label">训练消耗</div>
          <div class="sub">不改就按 MET 估算</div>
        </div>
        <input id="finish-burn" class="field" style="width:88px" type="number" inputmode="numeric"
          value="${estimate}" data-estimate="${estimate}" />
        <span class="value" style="width:34px">kcal</span>
      </div>
      <div class="row" style="align-items:flex-start">
        <div class="grow">
          <div class="label" style="margin-bottom:8px">今天感觉</div>
          <div class="pill-row" style="padding:0">
            ${FEELINGS.map(
              (f) =>
                h`<button class="pill ${(sheet.feeling ?? "ok") === f.id ? "on" : ""}"
                  data-act="pick-feeling" data-id="${f.id}">${f.label}</button>`,
            )}
          </div>
        </div>
      </div>
      <div class="row" style="align-items:flex-start">
        <div class="grow">
          <div class="label" style="margin-bottom:4px">备注</div>
          <textarea id="finish-note" class="field text" rows="2" placeholder="哪里不舒服、哪组最吃力…">${s.note ?? ""}</textarea>
        </div>
      </div>
    </div>

    <div class="sheet-note">
      ${drafts > 0 ? `有 ${drafts} 组没打勾，结束后不会保存（不算进统计）。` : "所有组都会保存。"}
      消耗会冻结在这一条记录里，以后体重变了也不会回改。
    </div>
  </div>`;
}

/* ── 加食物 ───────────────────────────────────────── */

function foodSheet(data, sheet) {
  const foods = allFoods(data);
  const recent = recentFoodNames(data);

  return h`${head("添加食物")}
  <div class="sheet-body">
    <div style="padding:0 16px 10px">
      <input class="field text" placeholder="搜索食物（米饭、鸡胸、牛奶…）" data-filter="food" style="background:#fff" />
    </div>

    ${
      recent.length
        ? h`<div class="hint" style="padding-bottom:6px">最近吃过</div>
            <div class="pill-row">
              ${recent.map(
                (f) => h`<button class="pill" data-act="pick-food" data-id="${f.id}">${f.name}</button>`,
              )}
            </div>`
        : ""
    }

    <div class="list-scroll">
      ${foods
        .map(
          (f) => h`<div class="row tappable" data-act="pick-food" data-id="${f.id}" data-name="${f.name}">
            <div class="grow">
              <div class="label">${f.name}</div>
              <div class="sub">每 100g · P${f.p} C${f.c} F${f.f}</div>
            </div>
            <div class="value mono" style="min-width:56px;text-align:right">${f.kcal}<span style="font-size:11px"> kcal</span></div>
          </div>`,
        )}
    </div>

    <div class="card" style="margin-top:12px">
      <div class="row tappable" data-act="custom-food" data-meal="${sheet.mealType}" data-date="${sheet.date}">
        <div class="grow" style="color:var(--blue)">找不到？直接填热量</div>
        <span class="chevron">${raw("›")}</span>
      </div>
    </div>
  </div>`;
}

function recentFoodNames(data) {
  const seen = new Map();
  const meals = [...(data.meals ?? [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  for (const m of meals) {
    for (const it of m.items) {
      if (it.foodId && !seen.has(it.foodId)) seen.set(it.foodId, it.name);
    }
    if (seen.size >= 8) break;
  }
  const foods = allFoods(data);
  return [...seen.entries()]
    .map(([id, name]) => foods.find((f) => f.id === id) ?? { id, name })
    .slice(0, 8);
}

function foodQtySheet(data, sheet) {
  const food = allFoods(data).find((f) => f.id === sheet.foodId);
  if (!food) return `${head("份量")}<div class="empty">找不到这个食物</div>`;
  const grams = sheet.grams ?? 100;
  const kcal = Math.round((food.kcal * grams) / 100);

  return h`${head("份量", "添加", "food-qty-confirm")}
  <div class="sheet-body">
    <div class="card pad">
      <div style="font-size:17px;font-weight:600">${food.name}</div>
      <div class="sub">每 100g：${food.kcal} kcal · 蛋白 ${food.p}g · 碳水 ${food.c}g · 脂肪 ${food.f}g</div>

      <div style="display:flex;align-items:center;gap:10px;margin-top:16px">
        <input id="qty-grams" class="field" type="number" inputmode="decimal" min="1" max="3000" step="10"
          value="${grams}" data-food-kcal="${food.kcal}" data-food-p="${food.p}" data-food-c="${food.c}" data-food-f="${food.f}" />
        <span class="value" style="width:22px">g</span>
        <div style="flex:1"></div>
        <div style="font-size:20px;font-weight:600" id="qty-kcal">${kcal}</div>
        <span class="value">kcal</span>
      </div>

      <div class="pill-row" style="padding:12px 0 0">
        ${[50, 100, 150, 200, 250, 300].map(
          (g) => h`<button class="pill" data-act="qty-set" data-g="${g}">${g}g</button>`,
        )}
      </div>
    </div>
    <div class="sheet-note">份量按【生重】估。米饭、面条这类按"熟重"填更准。</div>
  </div>`;
}

function customFoodSheet(sheet) {
  return h`${head("直接填热量", "添加", "custom-food-save")}
  <div class="sheet-body">
    <div class="card">
      <div class="row"><div class="grow label">食物名</div>
        <input id="cf-name" class="field" style="max-width:160px" placeholder="例如 食堂炒菜" /></div>
      <div class="row"><div class="grow label">热量</div>
        <input id="cf-kcal" class="field" style="max-width:110px" type="number" inputmode="numeric" placeholder="kcal" />
        <span class="value" style="width:34px">kcal</span></div>
      <div class="row"><div class="grow label">蛋白</div>
        <input id="cf-p" class="field" style="max-width:110px" type="number" inputmode="decimal" placeholder="可留空" />
        <span class="value" style="width:34px">g</span></div>
      <div class="row"><div class="grow label">碳水</div>
        <input id="cf-c" class="field" style="max-width:110px" type="number" inputmode="decimal" placeholder="可留空" />
        <span class="value" style="width:34px">g</span></div>
      <div class="row"><div class="grow label">脂肪</div>
        <input id="cf-f" class="field" style="max-width:110px" type="number" inputmode="decimal" placeholder="可留空" />
        <span class="value" style="width:34px">g</span></div>
    </div>
    <div class="sheet-note">填的是这一份的总热量，不是每 100g。三大宏可以不填，只影响蛋白/碳水统计。</div>
  </div>`;
}

/* ── 身体数据 ─────────────────────────────────────── */

function bodySheet(data, sheet) {
  const date = sheet.date || todayKey();
  const exist = (data.bodies ?? []).find((b) => b.localDate === date);

  return h`${head("身体数据", "保存", "body-save", `data-date="${date}"`)}
  <div class="sheet-body">
    <div class="card">
      <div class="row">
        <div class="grow label">日期</div>
        <div class="value">${fmtMD(date)} ${weekdayCN(date)}</div>
      </div>
      <div class="row"><div class="grow label">体重</div>
        <input id="bd-weight" class="field" style="max-width:110px" type="number" inputmode="decimal" step="0.1"
          value="${exist?.weightKg ?? ""}" placeholder="kg" />
        <span class="value" style="width:34px">kg</span></div>
      <div class="row"><div class="grow label">腰围</div>
        <input id="bd-waist" class="field" style="max-width:110px" type="number" inputmode="decimal" step="0.1"
          value="${exist?.waistCm ?? ""}" placeholder="cm" />
        <span class="value" style="width:34px">cm</span></div>
      <div class="row"><div class="grow label">体脂率</div>
        <input id="bd-fat" class="field" style="max-width:110px" type="number" inputmode="decimal" step="0.1"
          value="${exist?.bodyFatPct ?? ""}" placeholder="可选" />
        <span class="value" style="width:34px">%</span></div>
    </div>
    <div class="sheet-note">同一天只保留一条，再记就是覆盖。建议晨起空腹、排便后测，条件一致才比得准。</div>
  </div>`;
}

/* ── 二次确认 ─────────────────────────────────────── */

function confirmSheet(sheet) {
  return h`${head("确认")}
  <div class="sheet-body">
    <div class="card pad">
      <div style="font-size:15px;line-height:1.6">${sheet.text}</div>
    </div>
    <div class="btn-row">
      <button class="btn ghost" data-act="close-sheet">取消</button>
      <button class="btn danger" data-act="${sheet.confirmAct}" ${raw(sheet.extra ?? "")}>${sheet.confirmLabel ?? "确认"}</button>
    </div>
  </div>`;
}
