/**
 * 存储层（唯一读写 localStorage 的地方）
 *
 * 上层（repo.js / 界面）永远不直接碰 localStorage，只调这里的函数。
 * 好处：以后换 IndexedDB 或云端，只改这一个文件。
 *
 * 这里承担四件事：
 *   1. 读：解析 JSON，跑迁移和"修复"（repair），把脏数据整理干净再交给上层
 *   2. 写：整份写回，并更新 meta（lastWriteAt / writeCount）
 *   3. 导出：带版本号的 JSON
 *   4. 导入：按 id 合并，**旧的不覆盖新的**，并汇报合并结果
 *
 * 为什么要 repair 而不是"遇到脏数据就清空"：
 *   记录是用户的资产。宁可把一条读不懂的记录挪进 quarantine（隔离区）留证，
 *   也不能因为一条坏数据把整份历史清掉。
 */

import {
  APP_ID,
  SCHEMA_VERSION,
  STORAGE_KEY,
  defaultData,
  isValidDateKey,
  num,
  uid,
  dateKey,
} from "./schema.js";
import { BUILTIN_EXERCISES } from "./seed.js";

/** 内存缓存：一次会话里只解析一次，写的时候同步更新 */
let cache = null;

/** localStorage 不可用时的降级标记（隐私模式 / 被禁用） */
let degraded = false;

function hasStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readRaw() {
  if (!hasStorage()) {
    degraded = true;
    return null;
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    degraded = true;
    return null;
  }
}

/** 拿到当前数据（首次调用时读盘 + 修复） */
export function getData() {
  if (cache) return cache;
  const raw = readRaw();
  if (!raw) {
    cache = defaultData();
    return cache;
  }
  try {
    const parsed = JSON.parse(raw);
    cache = repair(migrate(parsed));
  } catch {
    // 解析失败：原文另存一份，绝不静默丢弃
    try {
      localStorage.setItem(STORAGE_KEY + ".corrupt." + Date.now(), raw);
    } catch {
      /* 存不下就算了，至少不崩 */
    }
    cache = defaultData();
    cache.meta.loadError = "本地数据损坏，已备份原文并新建一份空数据";
  }
  return cache;
}

/** 写盘（整份覆盖）。失败时抛错，由上层提示用户导出备份 */
export function save(data) {
  cache = data;
  data.meta = data.meta || { lastWriteAt: 0, writeCount: 0 };
  data.meta.lastWriteAt = Date.now();
  data.meta.writeCount = (data.meta.writeCount || 0) + 1;

  if (!hasStorage()) {
    degraded = true;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    const quota = e && (e.name === "QuotaExceededError" || e.code === 22);
    throw new Error(
      quota ? "手机存储空间满了，请先导出备份再清理旧记录" : "保存失败：" + (e?.message ?? "未知错误"),
    );
  }
}

export function isDegraded() {
  return degraded;
}

/** 丢掉内存缓存，下次 getData 重新读盘（测试用；也用于外部改了 storage 后强制刷新） */
export function reload() {
  cache = null;
  return getData();
}

/** 版本迁移（以后加字段时在这里补，不要直接改 repair 里的语义） */
function migrate(d) {
  if (!d || typeof d !== "object") return defaultData();
  if (!d.schemaVersion) d.schemaVersion = 1;
  // 以后：if (d.schemaVersion < 2) { ...升级...; d.schemaVersion = 2 }
  return d;
}

/* ── 修复 / 规整 ─────────────────────────────────────
 * 做四件事：补默认值、去重（按 id 保留最新）、重排 order、剔除致命脏数据到隔离区。
 * 这一步保证了"读出来的数据一定是干净的"，界面就不用到处写防御代码。
 */
function repair(d) {
  const base = defaultData();
  const out = {
    ...base,
    ...d,
    settings: { ...base.settings, ...(d.settings || {}) },
    meta: { ...base.meta, ...(d.meta || {}) },
    quarantine: Array.isArray(d.quarantine) ? d.quarantine : [],
  };

  out.exercises = dedupeById(asArray(d.exercises));
  out.foods = dedupeById(asArray(d.foods));
  out.templates = dedupeById(asArray(d.templates));

  /* 训练 */
  out.sessions = dedupeById(asArray(d.sessions))
    .filter((s) => {
      const ok = s && s.id && isValidDateKey(s.localDate);
      if (!ok) out.quarantine.push({ kind: "session", at: Date.now(), raw: s });
      return ok;
    })
    .map((s) => {
      const entries = dedupeById(asArray(s.entries))
        .filter((e) => e && e.id && (e.exerciseId || e.name))
        .map((e, i) => ({
          ...e,
          order: i,
          sets: dedupeById(asArray(e.sets))
            .filter((x) => x && x.id)
            .map((x, j) => normalizeSet(x, j)),
        }));
      return {
        ...s,
        entries,
        status: s.status === "done" ? "done" : "active",
        startedAt: num(s.startedAt, Date.now()),
        updatedAt: num(s.updatedAt, num(s.startedAt, Date.now())),
      };
    })
    .sort((a, b) => a.startedAt - b.startedAt);

  /* 饮食：天然键 = 日期 + 餐次，同键合并条目（防止重复记账） */
  const mealMap = new Map();
  dedupeById(asArray(d.meals))
    .filter((m) => m && isValidDateKey(m.localDate) && m.mealType)
    .forEach((m) => {
      const key = m.localDate + "|" + m.mealType;
      const items = dedupeById(asArray(m.items)).map((it, i) => ({ ...it, order: i }));
      const prev = mealMap.get(key);
      if (!prev) {
        mealMap.set(key, { ...m, items });
      } else {
        // 同一天同一餐出现两份 → 合并条目，保留更晚的更新时间
        const merged = dedupeById([...prev.items, ...items]).map((it, i) => ({ ...it, order: i }));
        mealMap.set(key, {
          ...(num(m.updatedAt) > num(prev.updatedAt) ? m : prev),
          items: merged,
        });
      }
    });
  out.meals = [...mealMap.values()]
    .filter((m) => m.items.length > 0)
    .sort((a, b) => (a.localDate + a.mealType).localeCompare(b.localDate + b.mealType));

  /* 身体数据：天然键 = 日期（一天多条时保留最新那条） */
  const bodyMap = new Map();
  dedupeById(asArray(d.bodies))
    .filter((b) => b && isValidDateKey(b.localDate))
    .forEach((b) => {
      const prev = bodyMap.get(b.localDate);
      if (!prev || num(b.updatedAt) > num(prev.updatedAt)) bodyMap.set(b.localDate, b);
    });
  out.bodies = [...bodyMap.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));

  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** 按 id 去重，保留 updatedAt 更大的那条（没有 updatedAt 就保留后出现的） */
function dedupeById(list) {
  const map = new Map();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = item.id;
    if (!id) continue;
    const prev = map.get(id);
    if (!prev || num(item.updatedAt, 0) >= num(prev.updatedAt, 0)) map.set(id, item);
  }
  return [...map.values()];
}

/** 一组数字的规范化：重量/次数转成数字，order 重排 */
function normalizeSet(x, i) {
  return {
    ...x,
    order: i,
    weightKg: num(x.weightKg, 0),
    reps: num(x.reps, 0),
    done: !!x.done,
    createdAt: num(x.createdAt, Date.now()),
  };
}

/* ── 导出 ─────────────────────────────────────────── */

export function exportJSON() {
  const data = getData();
  return JSON.stringify(
    {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      counts: {
        sessions: data.sessions.length,
        meals: data.meals.length,
        bodies: data.bodies.length,
      },
      data,
    },
    null,
    2,
  );
}

/** 导出成 CSV（给 Excel 看），只导训练组明细和饮食条目 */
export function exportCSV() {
  const d = getData();
  const rows = [["类型", "日期", "时间", "名称", "重量kg", "次数", "组号", "热量kcal", "蛋白g", "碳水g", "脂肪g", "备注"]];

  d.sessions.forEach((s) => {
    s.entries.forEach((e) => {
      e.sets.filter((x) => x.done).forEach((x, i) => {
        rows.push([
          "训练",
          s.localDate,
          new Date(s.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
          e.name,
          x.weightKg,
          x.reps,
          i + 1,
          "",
          "",
          "",
          "",
          s.note || "",
        ]);
      });
    });
  });

  d.meals.forEach((m) => {
    m.items.forEach((it) => {
      rows.push([
        "饮食",
        m.localDate,
        "",
        it.name,
        "",
        "",
        "",
        it.kcal,
        it.protein,
        it.carbs,
        it.fat,
        m.mealType,
      ]);
    });
  });

  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

/* ── 导入 ─────────────────────────────────────────── */

/**
 * 导入备份。
 * 合并规则：**同一 id 比 updatedAt，新的赢**；本地没有的才新增。
 * 所以重复导入同一份文件是安全的（第二次什么都不会变）—— 这条很重要，避免"越导越乱"。
 */
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "不是合法的 JSON 文件" };
  }

  // 兼容随身健 v1/v2/v3 的老备份（训练记录以日期为键）
  const legacy = parsed?.sessions && !Array.isArray(parsed.sessions) ? parsed.sessions : null;
  if (parsed?.app !== APP_ID && legacy) {
    return importLegacy(parsed);
  }

  if (parsed?.app !== APP_ID || !parsed?.data) {
    return { ok: false, message: "不是本应用导出的备份文件" };
  }

  const incoming = parsed.data;
  if (!Array.isArray(incoming.sessions) || !Array.isArray(incoming.meals)) {
    return { ok: false, message: "备份内容不完整，已取消导入" };
  }

  const data = getData();
  const stat = { added: 0, updated: 0, skipped: 0 };

  const merge = (target, list, keyFn = (x) => x.id) => {
    const index = new Map(target.map((x) => [keyFn(x), x]));
    (list || []).forEach((item) => {
      if (!item) return;
      const key = keyFn(item);
      if (!key) return;
      const prev = index.get(key);
      if (!prev) {
        target.push(item);
        index.set(key, item);
        stat.added++;
      } else if (num(item.updatedAt, 0) > num(prev.updatedAt, 0)) {
        Object.assign(prev, item);
        stat.updated++;
      } else {
        stat.skipped++;
      }
    });
  };

  merge(data.sessions, incoming.sessions);
  merge(data.meals, incoming.meals);
  merge(data.bodies, incoming.bodies, (b) => b.localDate);
  merge(data.exercises, incoming.exercises);
  merge(data.foods, incoming.foods);
  merge(data.templates, incoming.templates);

  // 设置属于"这台手机的偏好"，导入时保留本地的；只在本地是空壳时才采纳
  if (!data.settings.kcalTarget && incoming.settings?.kcalTarget) {
    data.settings = { ...data.settings, ...incoming.settings };
  }

  // 合并完必须再过一遍 repair：补 order、去重、合并同餐
  cache = repair(data);
  save(cache);

  return {
    ok: true,
    message: `导入完成：新增 ${stat.added}，更新 ${stat.updated}，跳过 ${stat.skipped}`,
  };
}

/**
 * 老版本备份（suishenjian 那套：{ sessions: { "2026-09-24": {...} }, daily: {...} }）
 * 转成新结构：一天一条训练、组全部标记为已完成。
 */
function importLegacy(parsed) {
  const data = getData();
  let added = 0;
  let skipped = 0;

  Object.entries(parsed.sessions || {}).forEach(([date, s]) => {
    if (!isValidDateKey(date) || !s) return;
    const startedAt = num(s.updatedAt, new Date(date + "T18:00:00").getTime());
    const entries = (s.exercises || []).map((e, i) => {
      const builtin = BUILTIN_EXERCISES.find((b) => b.name === e.name);
      return {
        id: uid("en"),
        exerciseId: builtin?.id ?? "ex_legacy_" + encodeURIComponent(e.name),
        name: e.name,
        nameSnapshot: e.name,
        order: i,
        sets: (e.sets || []).map((x, j) => ({
          id: uid("st"),
          order: j,
          weightKg: num(x.weight, 0),
          reps: num(x.reps, 0),
          done: true,
          createdAt: startedAt,
        })),
      };
    });
    if (entries.every((e) => e.sets.length === 0)) {
      skipped++;
      return;
    }
    data.sessions.push({
      id: uid("ses"),
      localDate: date,
      startedAt,
      endedAt: startedAt + 60 * 60000,
      title: s.dayLabel || "训练",
      templateId: null,
      status: "done",
      entries,
      feeling: s.feeling ?? null,
      note: s.note ?? "",
      burnKcal: null,
      burnSource: "estimate",
      createdAt: startedAt,
      updatedAt: num(s.updatedAt, startedAt),
      legacy: true,
    });
    added++;
  });

  Object.entries(parsed.daily || {}).forEach(([date, d]) => {
    if (!isValidDateKey(date) || !d) return;
    if (!d.weight && !d.waist) return;
    data.bodies.push({
      id: uid("bd"),
      localDate: date,
      weightKg: d.weight ? num(d.weight) : null,
      waistCm: d.waist ? num(d.waist) : null,
      bodyFatPct: null,
      note: "",
      createdAt: num(d.updatedAt, Date.now()),
      updatedAt: num(d.updatedAt, Date.now()),
      legacy: true,
    });
  });

  cache = repair(data);
  save(cache);
  return {
    ok: true,
    message: `已把老版本记录转换成新格式：${added} 次训练（跳过 ${skipped} 条空记录）`,
  };
}

/* ── 危险操作 ─────────────────────────────────────── */

/** 清空全部记录（界面必须二次确认，且先提示导出） */
export function clearAll() {
  cache = defaultData();
  save(cache);
}

/** 只清某一类，方便排错 */
export function clearCategory(kind) {
  const data = getData();
  if (Array.isArray(data[kind])) data[kind] = [];
  save(data);
}

export { dateKey };
