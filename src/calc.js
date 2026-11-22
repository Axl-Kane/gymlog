/**
 * 计算层（纯函数，不读存储、不碰 DOM）
 *
 * 所有"数字怎么算"的问题只在这里回答一次，界面和统计都调它 —— 这是"口径一致"的根。
 *
 * 三个口径必须先说清楚，否则统计永远对不上：
 *   1. 容量（volume）= Σ 重量 × 次数，**只算打了勾的组**，热身组也算（重量小，影响不大）。
 *   2. 训练消耗 = 估算（MET × 体重 × 时长）或手动填写；训练结束后**冻结**存进记录，
 *      以后体重变了也不回头改历史。
 *   3. 每日支出 = BMR × 日常活动系数 + 当天训练消耗。
 *      口径前提：活动系数只描述"不训练时的活动量"，训练单独加，所以不会重复计算。
 */

import { num, round } from "./schema.js";

/* ── 训练量 ───────────────────────────────────────── */

/** 一组的容量：重量 × 次数（自重动作重量按 0 算，不虚增容量） */
export function setVolume(set) {
  return round(num(set?.weightKg) * num(set?.reps), 1);
}

export function entryVolume(entry) {
  return round(
    (entry?.sets ?? []).filter((s) => s.done).reduce((sum, s) => sum + setVolume(s), 0),
    1,
  );
}

export function entrySets(entry) {
  return (entry?.sets ?? []).filter((s) => s.done).length;
}

export function sessionVolume(session) {
  return round((session?.entries ?? []).reduce((sum, e) => sum + entryVolume(e), 0), 1);
}

export function sessionSets(session) {
  return (session?.entries ?? []).reduce((sum, e) => sum + entrySets(e), 0);
}

export function sessionReps(session) {
  return (session?.entries ?? []).reduce(
    (n, e) => n + (e.sets ?? []).filter((s) => s.done).reduce((m, s) => m + num(s.reps), 0),
    0,
  );
}

/** 一次训练里练到了几个动作（有完成组的才算） */
export function sessionExerciseCount(session) {
  return (session?.entries ?? []).filter((e) => entrySets(e) > 0).length;
}

/** 时长（分钟）：优先用记录里的 endedAt，没结束就用到现在 */
export function sessionMinutes(session, now = Date.now()) {
  const start = num(session?.startedAt, now);
  const end = session?.endedAt ? num(session.endedAt) : now;
  return Math.max(0, Math.round((end - start) / 60000));
}

/** 估算 1RM（Epley）。只用于看趋势，不当真 */
export function epley1RM(weightKg, reps) {
  const w = num(weightKg);
  const r = num(reps);
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return round(w * (1 + r / 30), 1);
}

/** 一个动作这次的最好一组（按估算 1RM 排） */
export function bestSet(entry) {
  const done = (entry?.sets ?? []).filter((s) => s.done);
  if (!done.length) return null;
  return done.reduce((best, s) =>
    epley1RM(s.weightKg, s.reps) > epley1RM(best.weightKg, best.reps) ? s : best,
  );
}

/**
 * 找某个动作上一次的记录（用于"上次 60kg×8"提示和加重量建议）
 * 只看已完成的训练，排除当前这次。
 */
export function lastPerformance(data, exerciseId, excludeSessionId) {
  const sessions = (data?.sessions ?? [])
    .filter((s) => s.status === "done" && s.id !== excludeSessionId)
    .sort((a, b) => b.startedAt - a.startedAt);

  for (const s of sessions) {
    const entry = (s.entries ?? []).find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = (entry.sets ?? []).filter((x) => x.done);
    if (!sets.length) continue;
    const best = bestSet(entry);
    return { date: s.localDate, sessionId: s.id, sets, best };
  }
  return null;
}

/** 某个动作的历史最好成绩（PR） */
export function personalBest(data, exerciseId) {
  let best = null;
  (data?.sessions ?? []).forEach((s) => {
    if (s.status !== "done") return;
    (s.entries ?? []).forEach((e) => {
      if (e.exerciseId !== exerciseId) return;
      (e.sets ?? []).forEach((x) => {
        if (!x.done) return;
        const e1rm = epley1RM(x.weightKg, x.reps);
        if (!best || e1rm > best.e1rm) best = { e1rm, weightKg: x.weightKg, reps: x.reps, date: s.localDate };
      });
    });
  });
  return best;
}

/* ── 热量 ─────────────────────────────────────────── */

/** Mifflin-St Jeor 基础代谢 */
export function bmr(settings) {
  const w = num(settings?.bodyWeightKg, 70);
  const h = num(settings?.heightCm, 175);
  const a = num(settings?.age, 22);
  const male = (settings?.sex ?? "male") === "male";
  return Math.round(10 * w + 6.25 * h - 5 * a + (male ? 5 : -161));
}

/** 日常支出（不含训练） */
export function dailyBaseExpenditure(settings) {
  return Math.round(bmr(settings) * num(settings?.activityFactor, 1.35));
}

/** 力量训练的 MET：按强度给个保守值 */
export function strengthMet(intensity = 5) {
  return Math.min(8, Math.max(3, intensity));
}

/**
 * 按 MET 估算消耗
 * kcal = MET × 3.5 × 体重kg ÷ 200 × 分钟
 */
export function metBurn({ met = 5, bodyWeightKg = 70, minutes = 60 }) {
  const v = (num(met, 5) * 3.5 * num(bodyWeightKg, 70)) / 200 * num(minutes, 0);
  return Math.max(0, Math.round(v));
}

/**
 * 一次训练的消耗。
 * 已冻结的（有 burnKcal 且 source=manual/estimate）直接返回存下来的值；
 * 进行中的训练才实时估算。
 */
export function sessionBurn(session, settings) {
  if (session?.burnSource === "manual" && session?.burnKcal != null) {
    return Math.round(num(session.burnKcal));
  }
  if (session?.burnKcal != null) return Math.round(num(session.burnKcal));
  const minutes = sessionMinutes(session);
  return metBurn({ met: 5, bodyWeightKg: settings?.bodyWeightKg ?? 70, minutes });
}

/** 当天总支出 = 日常 + 训练 */
export function dayExpenditure(data, date, now = Date.now()) {
  const base = dailyBaseExpenditure(data.settings);
  const burn = (data.sessions ?? [])
    .filter((s) => s.localDate === date && s.status === "done")
    .reduce((sum, s) => sum + sessionBurn(s, data.settings), 0);
  return { base, burn, total: base + burn };
}

/* ── 饮食 ─────────────────────────────────────────── */

export function mealTotals(meal) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  (meal?.items ?? []).forEach((it) => {
    t.kcal += num(it.kcal);
    t.p += num(it.protein);
    t.c += num(it.carbs);
    t.f += num(it.fat);
  });
  return { kcal: Math.round(t.kcal), p: round(t.p, 1), c: round(t.c, 1), f: round(t.f, 1) };
}

/** 某天的摄入合计 */
export function dayIntake(data, date) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  (data.meals ?? [])
    .filter((m) => m.localDate === date)
    .forEach((m) => {
      const mt = mealTotals(m);
      t.kcal += mt.kcal;
      t.p += mt.p;
      t.c += mt.c;
      t.f += mt.f;
    });
  return { kcal: Math.round(t.kcal), p: round(t.p, 1), c: round(t.c, 1), f: round(t.f, 1) };
}

/** 目标：没手动设就按规则推 */
export function targets(settings) {
  const bmrV = bmr(settings);
  const tdee = Math.round(bmrV * num(settings?.activityFactor, 1.35));
  const kcal =
    settings?.kcalTarget != null && settings.kcalTarget !== ""
      ? num(settings.kcalTarget)
      : Math.round(tdee - 300);
  const protein =
    settings?.proteinTarget != null && settings.proteinTarget !== ""
      ? num(settings.proteinTarget)
      : Math.round(num(settings?.bodyWeightKg, 70) * 1.8);
  return { kcal, protein, carbs: Math.round((kcal * 0.45) / 4), fat: Math.round((kcal * 0.28) / 9), bmr: bmrV, tdee };
}

/* ── 汇总 ─────────────────────────────────────────── */

export function sessionsOn(data, date) {
  return (data.sessions ?? []).filter((s) => s.localDate === date);
}

export function activeSession(data) {
  return (data.sessions ?? []).find((s) => s.status === "active") ?? null;
}

/** 某天的身体数据（没有就是 null） */
export function bodyOn(data, date) {
  return (data.bodies ?? []).find((b) => b.localDate === date) ?? null;
}

/** 最近一次身体数据（截至某天，含当天） */
export function latestBody(data, until = null) {
  const list = (data.bodies ?? [])
    .filter((b) => (until ? b.localDate <= until : true))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  return list.length ? list[list.length - 1] : null;
}

/**
 * 一天的全部汇总。首页、统计、简报都用它，保证同一个日期在任何地方数字都一样。
 */
export function daySummary(data, date, now = Date.now()) {
  const sessions = sessionsOn(data, date);
  const done = sessions.filter((s) => s.status === "done");
  const intake = dayIntake(data, date);
  const exp = dayExpenditure(data, date, now);
  const t = targets(data.settings);
  const body = bodyOn(data, date);

  return {
    date,
    sessions,
    doneSessions: done,
    volume: round(done.reduce((n, s) => n + sessionVolume(s), 0), 1),
    sets: done.reduce((n, s) => n + sessionSets(s), 0),
    minutes: done.reduce((n, s) => n + sessionMinutes(s), 0),
    burn: exp.burn,
    intake,
    expenditure: exp,
    balance: intake.kcal - exp.total,
    target: t,
    body,
  };
}

/* ── 序列（画图用） ───────────────────────────────── */

/** 从 end 往前数 n 天，升序返回 YYYY-MM-DD */
export function recentDays(endDate, n) {
  const out = [];
  const d = new Date(endDate + "T00:00:00");
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

/** 体重 / 腰围序列（缺失为 null，图里会断开） */
export function bodySeries(data, days) {
  return days.map((date) => {
    const b = bodyOn(data, date);
    return { date, weight: b?.weightKg ?? null, waist: b?.waistCm ?? null, fat: b?.bodyFatPct ?? null };
  });
}

/** 每天的热量摄入 / 支出 / 训练消耗 */
export function calorieSeries(data, days, now = Date.now()) {
  return days.map((date) => {
    const intake = dayIntake(data, date);
    const exp = dayExpenditure(data, date, now);
    return { date, intake: intake.kcal, expenditure: exp.total, burn: exp.burn };
  });
}

/** 每天的容量 */
export function volumeSeries(data, days) {
  return days.map((date) => ({
    date,
    volume: round(
      sessionsOn(data, date)
        .filter((s) => s.status === "done")
        .reduce((n, s) => n + sessionVolume(s), 0),
      1,
    ),
  }));
}

/** 某天是否记过东西（给日历/圆点用） */
export function hasDataOn(data, date) {
  return (
    sessionsOn(data, date).some((s) => s.status === "done") ||
    (data.meals ?? []).some((m) => m.localDate === date) ||
    !!bodyOn(data, date)
  );
}

/** 统计区间总览 */
export function rangeSummary(data, days, now = Date.now()) {
  const end = days[days.length - 1];
  const doneSessions = (data.sessions ?? []).filter(
    (s) => s.status === "done" && s.localDate >= days[0] && s.localDate <= end,
  );
  const intakeDays = days.filter((d) => dayIntake(data, d).kcal > 0);
  const intakeTotal = days.reduce((n, d) => n + dayIntake(data, d).kcal, 0);
  const weights = days.map((d) => bodyOn(data, d)?.weightKg).filter((v) => typeof v === "number");

  return {
    sessionCount: doneSessions.length,
    volume: round(doneSessions.reduce((n, s) => n + sessionVolume(s), 0), 1),
    sets: doneSessions.reduce((n, s) => n + sessionSets(s), 0),
    minutes: doneSessions.reduce((n, s) => n + sessionMinutes(s), 0),
    burn: doneSessions.reduce((n, s) => n + sessionBurn(s, data.settings), 0),
    avgIntake: intakeDays.length ? Math.round(intakeTotal / intakeDays.length) : 0,
    intakeDays: intakeDays.length,
    weightStart: weights.length ? weights[0] : null,
    weightEnd: weights.length ? weights[weights.length - 1] : null,
  };
}
