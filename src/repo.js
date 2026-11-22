/**
 * 业务操作层
 *
 * 界面只调这里的函数，不直接改 data 里的数组。
 * 每个函数都是「读 → 改 → 校验 → 写」，一次同步完成，中途不会被打断，
 * 所以不会出现"组加了一半、重量没保存"这种半截状态。
 *
 * 三条不变量（改代码时别破坏）：
 *   1. 同一时间最多只有一次「进行中」的训练。
 *   2. 同一天同一餐只有一个记录（加食物 = 往那一餐里追加条目）。
 *   3. 同一天只有一条身体数据（再记就是覆盖）。
 */

import { getData, save } from "./db.js";
import { num, round, todayKey, uid } from "./schema.js";
import { findExercise, findTemplate, findFood, makeCustomExercise, makeCustomFood } from "./seed.js";
import { validateSession, validateMealItem, validateBody, validateSettings, validateSet } from "./validate.js";
import { bestSet, lastPerformance, metBurn, sessionMinutes, targets } from "./calc.js";

function ok(extra = {}) {
  return { ok: true, ...extra };
}
function fail(error) {
  return { ok: false, error };
}

/**
 * 统一的提交入口：跑 fn，只有 fn 没返回失败才落盘。
 * 落盘异常（存储满）会被转成 { ok:false, error }，界面弹提示，不会静默丢数据。
 */
function commit(fn) {
  const data = getData();
  let result;
  try {
    result = fn(data);
  } catch (e) {
    return fail(e?.message ?? "操作失败");
  }
  if (result && result.ok === false) return result;
  try {
    save(data);
  } catch (e) {
    return fail(e.message);
  }
  return result ?? ok();
}

function touch(obj) {
  obj.updatedAt = Date.now();
  return obj;
}

/* ── 训练 ─────────────────────────────────────────── */

export function activeSession() {
  return getData().sessions.find((s) => s.status === "active") ?? null;
}

export function getSession(id) {
  return getData().sessions.find((s) => s.id === id) ?? null;
}

/**
 * 开始一次训练。
 * 从模板开始会预填动作和空组（草稿组），用户只需要填数字、打勾。
 * 空组不算记录，统计里会被忽略，所以预填不会污染数据。
 */
export function startSession({ templateId = null, localDate = todayKey(), title = "" } = {}) {
  const running = activeSession();
  if (running) {
    return ok({ session: running, reused: true });
  }

  const data = getData();
  const tpl = templateId ? findTemplate(data, templateId) : null;

  const entries = (tpl?.exercises ?? []).map((item, i) => {
    const ex = findExercise(data, item.exerciseId);
    return {
      id: uid("en"),
      exerciseId: item.exerciseId,
      name: ex?.name ?? "未命名动作",
      nameSnapshot: ex?.name ?? "未命名动作",
      category: ex?.category ?? "",
      bodyweight: !!ex?.bodyweight,
      order: i,
      note: "",
      sets: Array.from({ length: Math.max(1, item.sets || 3) }, (_, j) => ({
        id: uid("st"),
        order: j,
        weightKg: 0,
        reps: 0,
        done: false,
        createdAt: Date.now(),
      })),
    };
  });

  const now = Date.now();
  const session = {
    id: uid("ses"),
    localDate,
    startedAt: now,
    endedAt: null,
    title: title || tpl?.name || "训练",
    templateId: tpl?.id ?? null,
    status: "active",
    entries,
    feeling: null,
    note: "",
    burnKcal: null,
    burnSource: "estimate",
    createdAt: now,
    updatedAt: now,
  };

  const r = commit((d) => {
    d.sessions.push(session);
  });
  return r.ok ? ok({ session }) : r;
}

/** 往训练里加一个动作（同一个动作重复加 → 复用已有条目，不产生两份） */
export function addExerciseToSession(sessionId, exerciseId) {
  return commit((data) => {
    const s = data.sessions.find((x) => x.id === sessionId);
    if (!s) return fail("找不到这次训练");
    if (s.status !== "active") return fail("这次训练已经结束了");

    const exist = s.entries.find((e) => e.exerciseId === exerciseId);
    if (exist) return ok({ entryId: exist.id, reused: true });

    const ex = findExercise(data, exerciseId);
    if (!ex) return fail("找不到这个动作");

    s.entries.push({
      id: uid("en"),
      exerciseId: ex.id,
      name: ex.name,
      nameSnapshot: ex.name,
      category: ex.category,
      bodyweight: !!ex.bodyweight,
      order: s.entries.length,
      note: "",
      sets: [
        { id: uid("st"), order: 0, weightKg: 0, reps: 0, done: false, createdAt: Date.now() },
      ],
    });
    touch(s);
    return ok();
  });
}

/** 删除一个动作（连同它的组） */
export function removeEntry(sessionId, entryId) {
  return commit((data) => {
    const s = data.sessions.find((x) => x.id === sessionId);
    if (!s) return fail("找不到这次训练");
    s.entries = s.entries.filter((e) => e.id !== entryId).map((e, i) => ({ ...e, order: i }));
    touch(s);
  });
}

/** 加一组：默认沿用上一组的重量和次数（不沿用"完成"状态） */
export function addSet(sessionId, entryId) {
  return commit((data) => {
    const { s, entry } = locate(data, sessionId, entryId);
    if (!s) return fail("找不到这次训练");
    if (!entry) return fail("找不到这个动作");
    const last = entry.sets[entry.sets.length - 1];
    entry.sets.push({
      id: uid("st"),
      order: entry.sets.length,
      weightKg: last ? num(last.weightKg) : 0,
      reps: last ? num(last.reps) : 0,
      done: false,
      createdAt: Date.now(),
    });
    touch(s);
  });
}

/**
 * 判断一个动作是不是自重（重量可以为 0）。
 * 优先用记录上的标记；老数据没有标记时回查动作库，避免把死虫式当成"没填重量"。
 */
function isBodyweight(data, entry) {
  if (typeof entry.bodyweight === "boolean") return entry.bodyweight;
  return !!findExercise(data, entry.exerciseId)?.bodyweight;
}

/**
 * 更新一组的数字。
 * 如果这组已经打了勾，改数字必须仍然合法，否则拒绝并保持原值（避免"改完变成脏数据"）。
 */
export function updateSet(sessionId, entryId, setId, patch) {
  return commit((data) => {
    const { s, entry } = locate(data, sessionId, entryId);
    if (!s || !entry) return fail("找不到这组记录");
    const set = entry.sets.find((x) => x.id === setId);
    if (!set) return fail("找不到这组记录");

    const next = { ...set };
    if ("weightKg" in patch) next.weightKg = round(num(patch.weightKg, 0), 1);
    if ("reps" in patch) next.reps = Math.round(num(patch.reps, 0));

    if (next.done) {
      const v = validateSet(next, { bodyweight: isBodyweight(data, entry) });
      if (!v.ok) return fail(v.errors[0].msg);
    }
    Object.assign(set, next);
    touch(s);
  });
}

/**
 * 打勾 / 取消打勾。
 * 打勾 = "这组真的做了"，所以这里做严格校验；不合法就拒绝，并告诉用户原因。
 */
export function toggleSet(sessionId, entryId, setId, done) {
  return commit((data) => {
    const { s, entry } = locate(data, sessionId, entryId);
    if (!s || !entry) return fail("找不到这组记录");
    if (s.status !== "active") return fail("这次训练已经结束了，不能再改");

    const set = entry.sets.find((x) => x.id === setId);
    if (!set) return fail("找不到这组记录");

    if (done) {
      const v = validateSet(set, { bodyweight: isBodyweight(data, entry) });
      if (!v.ok) return fail(v.errors[0].msg);
    }
    set.done = !!done;
    touch(s);
    return ok();
  });
}

export function removeSet(sessionId, entryId, setId) {
  return commit((data) => {
    const { s, entry } = locate(data, sessionId, entryId);
    if (!s || !entry) return fail("找不到这组记录");
    entry.sets = entry.sets.filter((x) => x.id !== setId).map((x, i) => ({ ...x, order: i }));
    touch(s);
  });
}

/**
 * 套用上次的数字：把上一次练这个动作的重量/次数填进**还没打勾**的组。
 * 只是填值，不会自动算完成 —— 打勾仍然要一下一下点，避免"看起来练了其实没练"。
 */
export function prefillFromLast(sessionId, entryId) {
  return commit((data) => {
    const { s, entry } = locate(data, sessionId, entryId);
    if (!s || !entry) return fail("找不到这组记录");
    if (s.status !== "active") return fail("这次训练已经结束了");

    const last = lastPerformance(data, entry.exerciseId, sessionId);
    if (!last || !last.sets.length) return fail("没有可以套用的历史记录");

    const src = last.sets;
    entry.sets.forEach((set, i) => {
      if (set.done) return;
      const p = src[i] ?? src[src.length - 1];
      set.weightKg = num(p.weightKg, 0);
      set.reps = num(p.reps, 0);
    });
    touch(s);
    return ok({ filled: entry.sets.filter((x) => !x.done).length });
  });
}

/** 修改训练标题 / 备注 */
export function updateSessionMeta(sessionId, patch) {
  return commit((data) => {
    const s = data.sessions.find((x) => x.id === sessionId);
    if (!s) return fail("找不到这次训练");
    if (typeof patch.title === "string") s.title = patch.title.trim() || "训练";
    if (typeof patch.note === "string") s.note = patch.note;
    touch(s);
  });
}

/**
 * 结束训练。
 * 收尾动作：丢掉所有没打勾的草稿组；一个完成组都没有的动作整条丢掉。
 * 消耗：没手动填就按 MET 估算，并**冻结**进记录。
 */
export function finishSession(sessionId, { feeling = null, note = "", burnKcal = null, burnSource = "estimate" } = {}) {
  return commit((data) => {
    const s = data.sessions.find((x) => x.id === sessionId);
    if (!s) return fail("找不到这次训练");
    if (s.status === "done") return fail("这次训练已经结束了");

    s.entries = s.entries
      .map((e) => ({
        ...e,
        sets: e.sets.filter((x) => x.done).map((x, i) => ({ ...x, order: i })),
      }))
      .filter((e) => e.sets.length > 0)
      .map((e, i) => ({ ...e, order: i }));

    s.endedAt = Date.now();
    if (s.endedAt < s.startedAt) s.endedAt = s.startedAt; // 手机时间被改过也不出负数
    s.status = "done";
    s.feeling = feeling;
    s.note = note;

    if (burnKcal != null && burnKcal !== "") {
      s.burnKcal = Math.max(0, Math.round(num(burnKcal)));
      s.burnSource = burnSource === "manual" ? "manual" : "estimate";
    } else {
      s.burnKcal = metBurn({
        met: 5,
        bodyWeightKg: data.settings.bodyWeightKg,
        // 至少按 1 分钟算：避免"开始后立刻结束"记成 0 kcal，看着像 bug
        minutes: Math.max(1, sessionMinutes(s, s.endedAt)),
      });
      s.burnSource = "estimate";
    }

    touch(s);
    return ok({ session: s });
  });
}

/** 继续一次已结束的训练（改错数据时用） */
export function reopenSession(sessionId) {
  return commit((data) => {
    if (data.sessions.some((s) => s.status === "active")) return fail("已有进行中的训练，先结束它");
    const s = data.sessions.find((x) => x.id === sessionId);
    if (!s) return fail("找不到这次训练");
    s.status = "active";
    s.endedAt = null;
    touch(s);
  });
}

/** 删除训练（软删除：只是一次训练没了，不会牵动别的数据） */
export function deleteSession(sessionId) {
  return commit((data) => {
    const i = data.sessions.findIndex((s) => s.id === sessionId);
    if (i < 0) return fail("找不到这次训练");
    data.sessions.splice(i, 1);
  });
}

/* ── 饮食 ─────────────────────────────────────────── */

/** 找到某天某餐；没有就建一个空壳（不落盘，由调用方决定是否加进去） */
function ensureMeal(data, localDate, mealType) {
  let meal = data.meals.find((m) => m.localDate === localDate && m.mealType === mealType);
  if (meal) return meal;
  meal = {
    id: uid("ml"),
    localDate,
    mealType,
    items: [],
    note: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  data.meals.push(meal);
  return meal;
}

/**
 * 加一条食物。
 * item 支持两种来源：
 *   - 来自食物库：传 foodId + grams，热量/宏量按每 100g 现算
 *   - 自定义：直接传 name + kcal（+ 可选宏量）
 * 记录里存的是**算好之后的快照**，以后改食物库不会改写历史。
 */
export function addFoodItem({ localDate = todayKey(), mealType = "lunch", foodId = null, grams = 100, custom = null }) {
  let item;

  if (custom) {
    item = {
      id: uid("it"),
      foodId: null,
      name: String(custom.name ?? "").trim(),
      grams: num(custom.grams, 0),
      kcal: Math.round(num(custom.kcal)),
      protein: round(num(custom.protein), 1),
      carbs: round(num(custom.carbs), 1),
      fat: round(num(custom.fat), 1),
      custom: true,
    };
  } else {
    const data0 = getData();
    const food = findFood(data0, foodId);
    if (!food) return fail("找不到这个食物");
    const g = num(grams, 100);
    const k = g / 100;
    item = {
      id: uid("it"),
      foodId: food.id,
      name: food.name,
      grams: round(g, 0),
      kcal: Math.round(food.kcal * k),
      protein: round(food.p * k, 1),
      carbs: round(food.c * k, 1),
      fat: round(food.f * k, 1),
      custom: false,
    };
  }

  const v = validateMealItem(item);
  if (!v.ok) return fail(v.errors[0].msg);

  const r = commit((data) => {
    const meal = ensureMeal(data, localDate, mealType);
    item.order = meal.items.length;
    meal.items.push(item);
    touch(meal);
  });
  return r.ok ? ok({ item, warning: v.warnings?.[0]?.msg ?? "" }) : r;
}

export function removeFoodItem(mealId, itemId) {
  return commit((data) => {
    const meal = data.meals.find((m) => m.id === mealId);
    if (!meal) return fail("找不到这一餐");
    meal.items = meal.items.filter((x) => x.id !== itemId).map((x, i) => ({ ...x, order: i }));
    // 空餐直接删掉，别留一堆空壳
    if (meal.items.length === 0) data.meals = data.meals.filter((m) => m.id !== mealId);
    else touch(meal);
  });
}

/** 改份量：按原来的每 100g 比例重算（只对来自食物库的条目有效） */
export function updateFoodGrams(mealId, itemId, grams) {
  return commit((data) => {
    const meal = data.meals.find((m) => m.id === mealId);
    const item = meal?.items.find((x) => x.id === itemId);
    if (!item) return fail("找不到这条食物");

    if (!item.foodId) {
      // 自定义条目没有"每 100g"基准，只改份量文字，不动热量，避免算错
      item.grams = round(num(grams, item.grams), 0);
      touch(meal);
      return ok();
    }

    const food = findFood(data, item.foodId);
    if (!food) return fail("食物库里已经没有这一项了");
    const g = Math.max(1, num(grams, item.grams));
    const k = g / 100;
    item.grams = round(g, 0);
    item.kcal = Math.round(food.kcal * k);
    item.protein = round(food.p * k, 1);
    item.carbs = round(food.c * k, 1);
    item.fat = round(food.f * k, 1);
    touch(meal);
  });
}

/** 新的一天开始时，把某天的饮食整份复制过来（"昨天吃得一样"） */
export function copyDayMeals(fromDate, toDate) {
  return commit((data) => {
    const src = data.meals.filter((m) => m.localDate === fromDate);
    if (!src.length) return fail("那天没有饮食记录");
    src.forEach((m) => {
      const exist = data.meals.find((x) => x.localDate === toDate && x.mealType === m.mealType);
      const target = exist ?? ensureMeal(data, toDate, m.mealType);
      m.items.forEach((it) => {
        target.items.push({ ...it, id: uid("it"), order: target.items.length });
      });
      touch(target);
    });
  });
}

/* ── 身体数据 ─────────────────────────────────────── */

/** 记录身体数据：同一天再记就是覆盖（不产生第二条） */
export function saveBody({ localDate = todayKey(), weightKg = null, waistCm = null, bodyFatPct = null, note = "" }) {
  const clean = {
    localDate,
    weightKg: weightKg === "" || weightKg == null ? null : round(num(weightKg), 1),
    waistCm: waistCm === "" || waistCm == null ? null : round(num(waistCm), 1),
    bodyFatPct: bodyFatPct === "" || bodyFatPct == null ? null : round(num(bodyFatPct), 1),
    note,
  };

  const v = validateBody(clean);
  if (!v.ok) return fail(v.errors[0].msg);

  return commit((data) => {
    const exist = data.bodies.find((b) => b.localDate === localDate);
    if (exist) {
      Object.assign(exist, clean, { updatedAt: Date.now() });
    } else {
      data.bodies.push({ id: uid("bd"), ...clean, createdAt: Date.now(), updatedAt: Date.now() });
    }
    // 体重同时更新设置里的体重（热量估算用最新值）
    if (clean.weightKg) data.settings.bodyWeightKg = clean.weightKg;
  });
}

/* ── 设置 ─────────────────────────────────────────── */

export function saveSettings(patch) {
  const data = getData();
  const next = { ...data.settings, ...patch };
  const v = validateSettings(next);
  if (!v.ok) return fail(v.errors[0].msg);
  return commit((d) => {
    d.settings = { ...d.settings, ...patch };
  });
}

/** 目标跟着体重/活动量自动重算（用户点"按推荐值"时用） */
export function applyRecommendedTargets() {
  return commit((data) => {
    const t = targets(data.settings);
    data.settings.kcalTarget = t.kcal;
    data.settings.proteinTarget = t.protein;
  });
}

/* ── 自定义动作 / 食物 ─────────────────────────────── */

export function addCustomExercise({ name, category, bodyweight = false }) {
  const n = String(name ?? "").trim();
  if (!n) return fail("动作名不能为空");
  const data = getData();
  if (data.exercises.some((e) => e.name === n)) return fail("已经有同名动作了");
  const ex = makeCustomExercise({ name: n, category, bodyweight });
  const r = commit((d) => {
    d.exercises.push(ex);
  });
  return r.ok ? ok({ exercise: ex }) : r;
}

export function addCustomFood({ name, kcal, protein = 0, carbs = 0, fat = 0 }) {
  const n = String(name ?? "").trim();
  if (!n) return fail("食物名不能为空");
  if (!(Number(kcal) >= 0)) return fail("热量要填数字");
  const data = getData();
  if (data.foods.some((f) => f.name === n)) return fail("已经有同名食物了");
  const food = makeCustomFood({ name: n, kcal, protein, carbs, fat });
  const r = commit((d) => {
    d.foods.push(food);
  });
  return r.ok ? ok({ food }) : r;
}

/* ── 小工具 ───────────────────────────────────────── */

function locate(data, sessionId, entryId) {
  const s = data.sessions.find((x) => x.id === sessionId);
  const entry = s?.entries.find((e) => e.id === entryId);
  return { s, entry };
}

export { bestSet };
