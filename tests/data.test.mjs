/**
 * 数据层测试（node tests/data.test.mjs）
 *
 * 只测"数据不会乱"这件事 —— 这是这个 App 最要紧的部分：
 * 不重复、不错序、不丢、口径一致。
 * 界面层不在这里测（那要靠人点）。
 */

import assert from "node:assert/strict";

/* 1. 先装一个假的 localStorage，再动态 import 业务模块 */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};

const db = await import("../src/db.js");
const repo = await import("../src/repo.js");
const calc = await import("../src/calc.js");
const { STORAGE_KEY, todayKey } = await import("../src/schema.js");

let pass = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log("  ✓ " + name);
  } catch (e) {
    failed++;
    console.log("  ✗ " + name + "\n    " + e.message);
  }
}
function reset() {
  mem.clear();
  db.reload();
  db.clearAll();
}

console.log("\n训练");

test("开始训练后只有一条进行中的记录", () => {
  reset();
  const r1 = repo.startSession({ templateId: "tpl_upper_a" });
  assert.equal(r1.ok, true);
  const r2 = repo.startSession({ templateId: "tpl_lower" });
  assert.equal(r2.ok, true);
  assert.equal(r2.reused, true, "第二次开始应复用进行中的训练");
  assert.equal(db.getData().sessions.length, 1);
  assert.ok(db.getData().sessions[0].entries.length > 0, "模板应预填动作");
});

test("同一个动作重复添加只保留一份", () => {
  reset();
  const s = repo.startSession({ templateId: "tpl_blank" }).session;
  repo.addExerciseToSession(s.id, "ex_leg_press");
  const r = repo.addExerciseToSession(s.id, "ex_leg_press");
  assert.equal(r.reused, true);
  assert.equal(db.getData().sessions[0].entries.length, 1);
});

test("没填次数的组不能打勾", () => {
  reset();
  const s = repo.startSession({ templateId: "tpl_blank" }).session;
  repo.addExerciseToSession(s.id, "ex_leg_press");
  const entry = db.getData().sessions[0].entries[0];
  const set = entry.sets[0];

  const bad = repo.toggleSet(s.id, entry.id, set.id, true);
  assert.equal(bad.ok, false, "空组不该通过校验");

  repo.updateSet(s.id, entry.id, set.id, { weightKg: 60, reps: 10 });
  const good = repo.toggleSet(s.id, entry.id, set.id, true);
  assert.equal(good.ok, true);
  assert.equal(db.getData().sessions[0].entries[0].sets[0].done, true);
});

test("结束训练时丢掉没打勾的草稿组", () => {
  reset();
  const s = repo.startSession({ templateId: "tpl_upper_a" }).session;
  const entry = db.getData().sessions[0].entries[0];
  repo.updateSet(s.id, entry.id, entry.sets[0].id, { weightKg: 40, reps: 12 });
  repo.toggleSet(s.id, entry.id, entry.sets[0].id, true);
  const r = repo.finishSession(s.id, { feeling: "ok" });
  assert.equal(r.ok, true);

  const done = db.getData().sessions[0];
  assert.equal(done.status, "done");
  assert.equal(done.entries.length, 1, "只有练过的动作才留下");
  assert.equal(done.entries[0].sets.length, 1, "草稿组应被丢弃");
  assert.equal(calc.sessionSets(done), 1);
  assert.equal(calc.sessionVolume(done), 480);
  assert.ok(done.burnKcal > 0, "应冻结一个消耗值");
});

test("容量只算打勾的组", () => {
  reset();
  const s = repo.startSession({ templateId: "tpl_blank" }).session;
  repo.addExerciseToSession(s.id, "ex_leg_press");
  const e = db.getData().sessions[0].entries[0];
  repo.updateSet(s.id, e.id, e.sets[0].id, { weightKg: 100, reps: 10 });
  repo.toggleSet(s.id, e.id, e.sets[0].id, true);
  repo.addSet(s.id, e.id);
  const e2 = db.getData().sessions[0].entries[0];
  assert.equal(e2.sets.length, 2);
  assert.equal(calc.sessionVolume(db.getData().sessions[0]), 1000, "第二组没打勾不该计入");
});

console.log("\n饮食");

test("同一天同一餐不会记成两顿", () => {
  reset();
  const d = todayKey();
  repo.addFoodItem({ localDate: d, mealType: "lunch", foodId: "fd_rice", grams: 200 });
  repo.addFoodItem({ localDate: d, mealType: "lunch", foodId: "fd_chicken_breast", grams: 100 });
  const meals = db.getData().meals;
  assert.equal(meals.length, 1, "应该只有一份午餐记录");
  assert.equal(meals[0].items.length, 2);
  assert.equal(calc.dayIntake(db.getData(), d).kcal, 232 + 133);
});

test("热量按份量现算，并冻结成快照", () => {
  reset();
  const d = todayKey();
  repo.addFoodItem({ localDate: d, mealType: "breakfast", foodId: "fd_egg", grams: 50 });
  const item = db.getData().meals[0].items[0];
  assert.equal(item.kcal, 72, "143 kcal/100g × 0.5 ≈ 72");
  assert.equal(item.grams, 50);
});

test("删掉最后一条食物时整餐消失，不留空壳", () => {
  reset();
  const d = todayKey();
  repo.addFoodItem({ localDate: d, mealType: "snack", foodId: "fd_banana", grams: 120 });
  const meal = db.getData().meals[0];
  repo.removeFoodItem(meal.id, meal.items[0].id);
  assert.equal(db.getData().meals.length, 0);
});

test("空热量 / 空名字被拦住", () => {
  reset();
  assert.equal(repo.addFoodItem({ localDate: todayKey(), mealType: "lunch", custom: { name: "", kcal: 100 } }).ok, false);
  assert.equal(
    repo.addFoodItem({ localDate: todayKey(), mealType: "lunch", custom: { name: "怪东西", kcal: -5 } }).ok,
    false,
  );
});

console.log("\n身体数据");

test("同一天记两次体重是覆盖，不是两条", () => {
  reset();
  repo.saveBody({ localDate: todayKey(), weightKg: 70.2 });
  repo.saveBody({ localDate: todayKey(), weightKg: 69.8, waistCm: 80 });
  const bodies = db.getData().bodies;
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].weightKg, 69.8);
  assert.equal(db.getData().settings.bodyWeightKg, 69.8, "体重应同步给设置，热量估算才准");
});

test("体重超出范围会被拒绝", () => {
  reset();
  assert.equal(repo.saveBody({ localDate: todayKey(), weightKg: 900 }).ok, false);
  assert.equal(db.getData().bodies.length, 0);
});

console.log("\n存储健壮性");

test("重复 id 的记录读出来会被去重（保留更新时间新的）", () => {
  reset();
  const d = todayKey();
  const base = JSON.parse(JSON.stringify(db.getData()));
  base.sessions = [
    { id: "ses_x", localDate: d, startedAt: 1, status: "done", entries: [], updatedAt: 1, title: "旧" },
    { id: "ses_x", localDate: d, startedAt: 1, status: "done", entries: [], updatedAt: 9, title: "新" },
  ];
  mem.set(STORAGE_KEY, JSON.stringify(base));
  const data = db.reload();
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0].title, "新");
});

test("损坏的 JSON 不会清空历史，会另存一份原文", () => {
  reset();
  mem.set(STORAGE_KEY, "{这不是 json");
  const data = db.reload();
  assert.equal(data.sessions.length, 0);
  assert.ok(data.meta.loadError, "应标记加载失败");
  const backupKey = [...mem.keys()].find((k) => k.includes(".corrupt."));
  assert.ok(backupKey, "原文应被备份下来");
});

test("导入同一份备份两次，第二次不会翻倍", () => {
  reset();
  const d = todayKey();
  repo.addFoodItem({ localDate: d, mealType: "lunch", foodId: "fd_rice", grams: 150 });
  const s = repo.startSession({ templateId: "tpl_blank" }).session;
  repo.finishSession(s.id, {});
  const dump = db.exportJSON();

  const r1 = db.importJSON(dump);
  assert.equal(r1.ok, true);
  const r2 = db.importJSON(dump);
  assert.equal(r2.ok, true);
  assert.ok(r2.message.includes("跳过"), "第二次应全部跳过");
  assert.equal(db.getData().meals.length, 1);
  assert.equal(db.getData().sessions.length, 1);
});

test("导入非本应用的文件会被拒绝", () => {
  reset();
  const r = db.importJSON(JSON.stringify({ hello: "world" }));
  assert.equal(r.ok, false);
});

test("导入老版本（按日期存的 sessions）能转成新结构", () => {
  reset();
  const legacy = {
    app: "suishenjian",
    version: 3,
    sessions: {
      "2026-09-24": {
        date: "2026-09-24",
        dayId: "upper_a",
        dayLabel: "上肢 A",
        exercises: [{ name: "腿举机", sets: [{ weight: 60, reps: 12, rir: 1 }] }],
        updatedAt: 1758700000000,
      },
    },
    daily: { "2026-09-24": { date: "2026-09-24", weight: 70.5, waist: 81, updatedAt: 1758700000000 } },
  };
  const r = db.importJSON(JSON.stringify(legacy));
  assert.equal(r.ok, true);
  assert.equal(db.getData().sessions.length, 1);
  assert.equal(db.getData().sessions[0].entries[0].name, "腿举机");
  assert.equal(db.getData().bodies[0].weightKg, 70.5);
});

console.log("\n口径一致性");

test("同一天的汇总在任何入口都一致", () => {
  reset();
  const d = todayKey();
  const s = repo.startSession({ templateId: "tpl_blank" }).session;
  repo.addExerciseToSession(s.id, "ex_leg_press");
  const e = db.getData().sessions[0].entries[0];
  repo.updateSet(s.id, e.id, e.sets[0].id, { weightKg: 80, reps: 10 });
  repo.toggleSet(s.id, e.id, e.sets[0].id, true);
  repo.finishSession(s.id, { burnKcal: 300, burnSource: "manual" });
  repo.addFoodItem({ localDate: d, mealType: "lunch", foodId: "fd_rice", grams: 200 });

  const sum = calc.daySummary(db.getData(), d);
  assert.equal(sum.volume, 800);
  assert.equal(sum.sets, 1);
  assert.equal(sum.burn, 300);
  assert.equal(sum.intake.kcal, 232);
  assert.equal(sum.balance, 232 - sum.expenditure.total, "净收支 = 摄入 − (基础 + 训练)");
  const base = Math.round(calc.bmr(db.getData().settings) * db.getData().settings.activityFactor);
  assert.equal(sum.expenditure.base, base);
  assert.equal(sum.expenditure.total, base + 300);
});

console.log("\n排序与序号");

test("加组后 order 连续，读取顺序稳定", () => {
  reset();
  const s = repo.startSession({ templateId: "tpl_blank" }).session;
  repo.addExerciseToSession(s.id, "ex_leg_press");
  const e = db.getData().sessions[0].entries[0];
  repo.addSet(s.id, e.id);
  repo.addSet(s.id, e.id);
  repo.removeSet(s.id, e.id, e.sets[1].id);
  const sets = db.getData().sessions[0].entries[0].sets;
  assert.deepEqual(sets.map((x) => x.order), [0, 1]);
});

console.log(`\n${pass} 通过, ${failed} 失败\n`);
process.exit(failed ? 1 : 0);
