/**
 * 数据结构的「宪法」
 *
 * 这个文件只放三样东西：常量的取值范围、ID 生成、日期工具。
 * 任何"一条记录长什么样"的定义都在这里，别处不许自己发明字段。
 *
 * 三条硬规矩（后面所有代码都遵守）：
 *   1. 每条记录都有全局唯一 id，**日期不是主键**（一天两练也不会互相覆盖）。
 *   2. 重量统一 kg、时长统一分钟、热量统一 kcal、宏量统一 g —— 存储层只存规范单位，
 *      界面上的换算（斤、千焦、大卡）都在显示层做。
 *   3. 所有"顺序"都显式写成 order 数字，不依赖数组下标，读取时按 order 排序。
 */

export const SCHEMA_VERSION = 1;

/** localStorage 的键。⚠️ 改这个键 = 手机里的旧数据全部读不到，必须配迁移 */
export const STORAGE_KEY = "gymlog.db.v1";

/** 导出文件里的应用标识，用来挡住"随便一个 JSON 也往里导" */
export const APP_ID = "suishenjian-gymlog";

/* ── 取值范围 ─────────────────────────────────────────
 * 校验层和输入框（min/max）共用这一份，避免"界面允许填、保存时被拒"的割裂。
 */
export const LIMITS = {
  weightKg: { min: 0, max: 500, step: 0.5 },
  reps: { min: 1, max: 200 },
  minutes: { min: 1, max: 600 },
  kcal: { min: 0, max: 8000 },
  grams: { min: 1, max: 3000 },
  bodyWeightKg: { min: 25, max: 300 },
  waistCm: { min: 40, max: 200 },
  bodyFatPct: { min: 3, max: 70 },
  rpe: { min: 1, max: 10 },
  wearFactor: { min: 1, max: 2 },
};

/** 餐次。顺序即界面上从上到下的顺序，不许在界面里另行排序 */
export const MEAL_TYPES = [
  { id: "breakfast", label: "早餐" },
  { id: "lunch", label: "午餐" },
  { id: "dinner", label: "晚餐" },
  { id: "snack", label: "加餐" },
];

export const MEAL_LABEL = Object.fromEntries(MEAL_TYPES.map((m) => [m.id, m.label]));

/** 动作分类 */
export const CATEGORIES = ["胸", "背", "腿", "肩", "手臂", "核心", "有氧", "体态"];

/** 训练整体感受 */
export const FEELINGS = [
  { id: "easy", label: "轻松" },
  { id: "ok", label: "刚好" },
  { id: "hard", label: "很累" },
];

export const FEELING_LABEL = Object.fromEntries(FEELINGS.map((f) => [f.id, f.label]));

/** 训练记录的状态：草稿（正在练）/ 完成 */
export const SESSION_STATUS = { active: "active", done: "done" };

/**
 * 一条空数据。首次打开、导入失败回退、清空后用这个。
 * 注意：内置动作库和模板不落库（在 seed.js 里），只有「自定义」的才写进 exercises。
 */
export function defaultData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    settings: {
      sex: "male",
      age: 22,
      heightCm: 177,
      /** 体重（kg）——热量估算用；每天的身体记录会覆盖它 */
      bodyWeightKg: 70,
      /** 日常活动系数：只描述"不训练时的活动量"，训练消耗另算，避免重复计算 */
      activityFactor: 1.35,
      /** 每日热量目标（kcal）；null = 按 BMR×系数−300 自动推算 */
      kcalTarget: null,
      /** 每日蛋白目标（g）；null = 按 1.8g/kg 自动推算 */
      proteinTarget: null,
      weeklySessionTarget: 4,
    },
    /** 自定义动作（内置的不存） */
    exercises: [],
    /** 自定义模板（内置的不存） */
    templates: [],
    /** 自定义食物（内置食物库在 seed.js，不落库） */
    foods: [],
    sessions: [],
    meals: [],
    bodies: [],
    meta: { lastWriteAt: 0, writeCount: 0 },
  };
}

/* ── ID ───────────────────────────────────────────── */

let seq = 0;

/**
 * 生成 id：前缀 + 时间 + 自增 + 随机。
 * 为什么不用自增数字：导入两份备份时数字会撞车，撞车就会"覆盖别人的记录"。
 */
export function uid(prefix) {
  seq = (seq + 1) % 1296;
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    seq.toString(36).padStart(2, "0") +
    Math.random().toString(36).slice(2, 6)
  );
}

/** 判断一个字符串像不像本 App 的 id（导入时用来剔除脏数据） */
export function looksLikeId(v, prefix) {
  return typeof v === "string" && v.startsWith(prefix + "_") && v.length >= 6;
}

/* ── 日期 ─────────────────────────────────────────────
 * 只处理"本地日历日"（YYYY-MM-DD）。记录里另外存毫秒时间戳表示具体时刻。
 * 为什么两个都存：日历日用于分组统计（用户心里的"今天"），时间戳用于排序和算时长。
 */

export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Date → 本地 YYYY-MM-DD */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 本地 YYYY-MM-DD → Date（当天 0 点） */
export function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** 今天 */
export function todayKey() {
  return dateKey(new Date());
}

/** 加减天数，返回 YYYY-MM-DD */
export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** 两个日期相差多少天（b - a） */
export function diffDays(a, b) {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime();
  return Math.round(ms / 86400000);
}

/** 本周一 */
export function startOfWeek(key = todayKey()) {
  const d = parseDateKey(key);
  const dow = (d.getDay() + 6) % 7; // 周一 = 0
  d.setDate(d.getDate() - dow);
  return dateKey(d);
}

/** 是否合法日期串（真正的日期，不是 2026-02-31 这种） */
export function isValidDateKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = parseDateKey(key);
  return dateKey(d) === key;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayCN(key) {
  return WEEKDAYS[parseDateKey(key).getDay()];
}

/** 11月22日 */
export function fmtMD(key) {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 今天 / 昨天 / 11月22日 */
export function fmtRelativeDay(key, today = todayKey()) {
  if (key === today) return "今天";
  if (key === addDays(today, -1)) return "昨天";
  if (key === addDays(today, 1)) return "明天";
  return fmtMD(key);
}

/** 毫秒 → 08:30 */
export function fmtTime(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 分钟 → 1 小时 20 分 */
export function fmtDuration(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} 小时 ${r} 分` : `${h} 小时`;
}

/* ── 数字 ─────────────────────────────────────────── */

/** 四舍五入到 n 位，避免 0.1+0.2 那种尾巴 */
export function round(v, n = 1) {
  const p = Math.pow(10, n);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
}

/** 安全转数字：空串 / null / 垃圾 → fallback */
export function num(v, fallback = 0) {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 千分位 */
export function fmtNum(v, digits = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
