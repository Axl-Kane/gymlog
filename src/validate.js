/**
 * 校验层
 *
 * 只有一件事：**在数据落库之前**把不合法的东西挡住，并说清楚哪里不对。
 * 所有函数都是纯函数（不读 localStorage、不碰 DOM），所以可以直接被测试。
 *
 * 两种反馈要分开：
 *   errors   —— 硬错误，不许保存（次数 0、重量负数、日期不存在）
 *   warnings —— 可疑但不拦（热量和三大宏对不上），存进去但在界面上提示
 *
 * ⚠️ 校验只在这里写一份。界面上的 min/max 只是"少让用户犯错"，不能代替这里。
 */

import { LIMITS, MEAL_LABEL, isValidDateKey, num } from "./schema.js";

function err(field, msg) {
  return { field, msg };
}

/** 数字是否落在区间内（含端点） */
function inRange(v, min, max) {
  return Number.isFinite(v) && v >= min && v <= max;
}

/* ── 一组训练 ─────────────────────────────────────── */

/**
 * 校验一组。
 * @param {{weightKg:any, reps:any, rpe?:any}} set
 * @param {{bodyweight?:boolean}} opts bodyweight = 自重动作，重量允许 0
 */
export function validateSet(set, opts = {}) {
  const errors = [];
  const weight = num(set?.weightKg, NaN);
  const reps = num(set?.reps, NaN);

  if (!Number.isFinite(weight)) {
    errors.push(err("weightKg", "重量没填"));
  } else if (!inRange(weight, LIMITS.weightKg.min, LIMITS.weightKg.max)) {
    errors.push(err("weightKg", `重量要在 ${LIMITS.weightKg.min}–${LIMITS.weightKg.max} kg 之间`));
  } else if (!opts.bodyweight && weight <= 0) {
    errors.push(err("weightKg", "这个动作要填重量；自重动作请选「自重」"));
  }

  if (!Number.isFinite(reps)) {
    errors.push(err("reps", "次数没填"));
  } else if (!Number.isInteger(reps)) {
    errors.push(err("reps", "次数要填整数"));
  } else if (!inRange(reps, LIMITS.reps.min, LIMITS.reps.max)) {
    errors.push(err("reps", `次数要在 ${LIMITS.reps.min}–${LIMITS.reps.max} 之间`));
  }

  if (set?.rpe !== undefined && set?.rpe !== null && set?.rpe !== "") {
    const rpe = num(set.rpe, NaN);
    if (!inRange(rpe, LIMITS.rpe.min, LIMITS.rpe.max)) {
      errors.push(err("rpe", "RPE 要在 1–10 之间"));
    }
  }

  return { ok: errors.length === 0, errors };
}

/* ── 一次训练 ─────────────────────────────────────── */

const STATUSES = ["active", "done"];

export function validateSession(s) {
  const errors = [];
  const warnings = [];

  if (!s || typeof s !== "object") return { ok: false, errors: [err("session", "记录为空")], warnings };

  if (!s.id) errors.push(err("id", "缺少记录编号"));
  if (!isValidDateKey(s.localDate)) errors.push(err("localDate", "日期不合法"));
  if (!STATUSES.includes(s.status)) errors.push(err("status", "状态不合法"));
  if (!Number.isFinite(num(s.startedAt, NaN))) errors.push(err("startedAt", "缺少开始时间"));

  if (s.endedAt && s.startedAt && num(s.endedAt) < num(s.startedAt)) {
    errors.push(err("endedAt", "结束时间早于开始时间"));
  }
  if (s.endedAt && s.startedAt) {
    const min = (num(s.endedAt) - num(s.startedAt)) / 60000;
    if (min > LIMITS.minutes.max) {
      warnings.push(err("endedAt", "这次训练超过 10 小时，是不是忘了结束？"));
    }
  }

  if (!Array.isArray(s.entries)) {
    errors.push(err("entries", "动作列表损坏"));
  } else {
    const seenEntry = new Set();
    s.entries.forEach((e, i) => {
      const tag = `第 ${i + 1} 个动作`;
      if (!e.id) errors.push(err(`entries.${i}.id`, `${tag}缺少编号`));
      else if (seenEntry.has(e.id)) errors.push(err(`entries.${i}.id`, `${tag}编号重复`));
      seenEntry.add(e.id);

      if (!e.exerciseId) errors.push(err(`entries.${i}.exerciseId`, `${tag}没关联动作`));
      if (!e.name || !String(e.name).trim()) errors.push(err(`entries.${i}.name`, `${tag}没名字`));
      if (!Array.isArray(e.sets)) errors.push(err(`entries.${i}.sets`, `${tag}的组列表损坏`));
    });
  }

  if (s.status === "done" && s.entries?.length === 0) {
    warnings.push(err("entries", "这次训练没有记录任何动作"));
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ── 饮食 ─────────────────────────────────────────── */

/** 4/4/9 法则允许的误差：25% 或 40kcal 以内都算对得上 */
const KCAL_TOLERANCE = 0.25;

export function validateMealItem(it) {
  const errors = [];
  const warnings = [];

  if (!it || typeof it !== "object") {
    return { ok: false, errors: [err("item", "食物为空")], warnings };
  }

  const name = String(it.name ?? "").trim();
  if (!name) errors.push(err("name", "食物名不能为空"));
  if (name.length > 40) errors.push(err("name", "食物名太长（40 字以内）"));

  const grams = num(it.grams, NaN);
  const kcal = num(it.kcal, NaN);
  const p = num(it.protein, 0);
  const c = num(it.carbs, 0);
  const f = num(it.fat, 0);

  if (!Number.isFinite(kcal) || !inRange(kcal, LIMITS.kcal.min, LIMITS.kcal.max)) {
    errors.push(err("kcal", "热量要在 0–8000 kcal 之间"));
  }
  if (Number.isFinite(grams) && !inRange(grams, 0, LIMITS.grams.max)) {
    errors.push(err("grams", "份量要在 0–3000 g 之间"));
  }
  [["protein", p], ["carbs", c], ["fat", f]].forEach(([k, v]) => {
    if (v < 0 || v > 500) errors.push(err(k, "宏量数值不合理"));
  });

  // 口径检查：热量和三大宏应当互相自洽（4/4/9）
  if (Number.isFinite(kcal) && kcal > 0 && p + c + f > 0) {
    const calc = p * 4 + c * 4 + f * 9;
    if (Math.abs(calc - kcal) > Math.max(40, kcal * KCAL_TOLERANCE)) {
      warnings.push(
        err("kcal", `热量与三大宏对不上（按 4/4/9 算约 ${Math.round(calc)} kcal），确认一下`),
      );
    }
  }
  // 单位口径检查：1g 食物不可能超过 9.5kcal（纯油是 9）
  if (Number.isFinite(kcal) && Number.isFinite(grams) && grams > 0 && kcal > grams * 9.5 + 30) {
    warnings.push(err("kcal", "热量相对份量偏高，检查是不是填成了每 100g 的热量"));
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateMeal(m) {
  const errors = [];
  const warnings = [];

  if (!m || typeof m !== "object") return { ok: false, errors: [err("meal", "记录为空")], warnings };
  if (!m.id) errors.push(err("id", "缺少记录编号"));
  if (!isValidDateKey(m.localDate)) errors.push(err("localDate", "日期不合法"));
  if (!MEAL_LABEL[m.mealType]) errors.push(err("mealType", "餐次不合法"));

  if (!Array.isArray(m.items) || m.items.length === 0) {
    errors.push(err("items", "这一餐还没有食物"));
  } else {
    m.items.forEach((it, i) => {
      const r = validateMealItem(it);
      r.errors.forEach((e) => errors.push(err(`items.${i}.${e.field}`, e.msg)));
      r.warnings.forEach((e) => warnings.push(err(`items.${i}.${e.field}`, e.msg)));
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ── 身体数据 ─────────────────────────────────────── */

export function validateBody(b) {
  const errors = [];
  if (!b || typeof b !== "object") return { ok: false, errors: [err("body", "记录为空")] };
  if (!isValidDateKey(b.localDate)) errors.push(err("localDate", "日期不合法"));

  const has = (v) => v !== undefined && v !== null && v !== "";
  if (!has(b.weightKg) && !has(b.waistCm) && !has(b.bodyFatPct)) {
    errors.push(err("weightKg", "体重、腰围、体脂至少填一项"));
  }
  if (has(b.weightKg) && !inRange(num(b.weightKg, NaN), LIMITS.bodyWeightKg.min, LIMITS.bodyWeightKg.max)) {
    errors.push(err("weightKg", `体重要在 ${LIMITS.bodyWeightKg.min}–${LIMITS.bodyWeightKg.max} kg 之间`));
  }
  if (has(b.waistCm) && !inRange(num(b.waistCm, NaN), LIMITS.waistCm.min, LIMITS.waistCm.max)) {
    errors.push(err("waistCm", `腰围要在 ${LIMITS.waistCm.min}–${LIMITS.waistCm.max} cm 之间`));
  }
  if (has(b.bodyFatPct) && !inRange(num(b.bodyFatPct, NaN), LIMITS.bodyFatPct.min, LIMITS.bodyFatPct.max)) {
    errors.push(err("bodyFatPct", `体脂率要在 ${LIMITS.bodyFatPct.min}–${LIMITS.bodyFatPct.max}% 之间`));
  }
  return { ok: errors.length === 0, errors };
}

/* ── 设置 ─────────────────────────────────────────── */

export function validateSettings(s) {
  const errors = [];
  if (!inRange(num(s.heightCm, NaN), 120, 230)) errors.push(err("heightCm", "身高要在 120–230 cm"));
  if (!inRange(num(s.age, NaN), 12, 90)) errors.push(err("age", "年龄要在 12–90"));
  if (!inRange(num(s.bodyWeightKg, NaN), LIMITS.bodyWeightKg.min, LIMITS.bodyWeightKg.max)) {
    errors.push(err("bodyWeightKg", "体重不合理"));
  }
  if (!inRange(num(s.activityFactor, NaN), 1.1, 1.8)) errors.push(err("activityFactor", "活动系数不合理"));
  if (s.kcalTarget !== null && s.kcalTarget !== "" && !inRange(num(s.kcalTarget, NaN), 800, 6000)) {
    errors.push(err("kcalTarget", "热量目标要在 800–6000 kcal"));
  }
  if (s.proteinTarget !== null && s.proteinTarget !== "" && !inRange(num(s.proteinTarget, NaN), 30, 400)) {
    errors.push(err("proteinTarget", "蛋白目标要在 30–400 g"));
  }
  return { ok: errors.length === 0, errors };
}

/** 把错误数组合成一句能让用户看懂的话（用于 toast / 行内提示） */
export function firstError(result) {
  return result?.errors?.[0]?.msg ?? "";
}
