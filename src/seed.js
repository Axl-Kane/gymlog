/**
 * 内置数据：动作库、模板、食物库
 *
 * 为什么不写进 localStorage？
 *   这是"软件自带的内容"，不是"用户的记录"。放在代码里，以后能统一升级（加动作、改热量），
 *   也不会因为用户清数据而消失，更不会和用户记录混在一起。
 *
 * ⚠️ 记录里永远保存一份 nameSnapshot（当时的名字）和热量快照，
 *    这样以后改了这里的数据，历史记录也不会被改写 —— 这是"口径一致"的关键。
 */

import { uid } from "./schema.js";

/* ── 动作库 ───────────────────────────────────────────
 * met = 代谢当量，用于估算消耗。力量训练统一 5.0（中等强度、组间有休息）。
 * bodyweight = 自重动作，重量允许为 0。
 */

function ex(id, name, category, equipment, met = 5, opts = {}) {
  return { id: "ex_" + id, name, category, equipment, met, ...opts };
}

export const BUILTIN_EXERCISES = [
  // 胸
  ex("chest_press_machine", "推胸器", "胸", "器械", 5),
  ex("incline_press_machine", "上斜推胸器", "胸", "器械", 5),
  ex("pec_deck", "蝴蝶机夹胸", "胸", "器械", 4.5),
  ex("cable_fly", "绳索夹胸", "胸", "绳索", 4.5),
  ex("pushup", "俯卧撑", "胸", "自重", 6, { bodyweight: true }),

  // 背
  ex("lat_pulldown", "高位下拉", "背", "器械", 5),
  ex("seated_row", "坐姿划船机", "背", "器械", 5),
  ex("chest_supported_row", "俯卧划船机", "背", "器械", 5),
  ex("straight_arm_pulldown", "直臂下压", "背", "绳索", 4.5),
  ex("assisted_pullup", "辅助引体向上", "背", "器械", 6),

  // 腿
  ex("leg_press", "腿举机", "腿", "器械", 6),
  ex("smith_rdl", "史密斯罗马尼亚硬拉", "腿", "史密斯", 6),
  ex("hip_thrust", "臀推机", "腿", "器械", 6),
  ex("hip_abduction", "坐姿髋外展机", "腿", "器械", 4),
  ex("leg_extension", "坐姿腿屈伸", "腿", "器械", 4.5),
  ex("leg_curl", "坐姿腿弯举", "腿", "器械", 4.5),
  ex("calf_raise", "提踵机", "腿", "器械", 4),
  ex("goblet_squat", "高脚杯深蹲", "腿", "哑铃", 6),

  // 肩
  ex("shoulder_press_machine", "肩推机", "肩", "器械", 5),
  ex("lateral_raise_machine", "侧平举机", "肩", "器械", 4),
  ex("cable_lateral_raise", "绳索侧平举", "肩", "绳索", 4),
  ex("reverse_pec_deck", "反向蝴蝶机", "肩", "器械", 4),
  ex("face_pull", "面拉", "肩", "绳索", 4),
  ex("cable_external_rotation", "绳索外旋", "肩", "绳索", 3),

  // 手臂
  ex("cable_pushdown", "绳索下压", "手臂", "绳索", 4),
  ex("overhead_extension", "绳索过顶臂屈伸", "手臂", "绳索", 4),
  ex("cable_curl", "绳索弯举", "手臂", "绳索", 4),
  ex("hammer_curl", "锤式弯举", "手臂", "哑铃", 4),
  ex("preacher_curl_machine", "牧师凳弯举机", "手臂", "器械", 4),

  // 核心
  ex("dead_bug", "死虫式", "核心", "垫上", 3.5, { bodyweight: true }),
  ex("plank", "平板支撑", "核心", "垫上", 3.5, { bodyweight: true, timed: true }),
  ex("crunch", "卷腹", "核心", "垫上", 3.5, { bodyweight: true }),
  ex("hanging_leg_raise", "悬垂举腿", "核心", "自重", 4, { bodyweight: true }),
  ex("pallof_press", "帕洛夫抗旋推", "核心", "绳索", 3.5),

  // 有氧
  ex("treadmill_walk", "跑步机快走", "有氧", "跑步机", 3.8, { cardio: true }),
  ex("treadmill_run", "跑步机慢跑", "有氧", "跑步机", 8, { cardio: true }),
  ex("bike", "动感单车", "有氧", "单车", 6.8, { cardio: true }),
  ex("elliptical", "椭圆机", "有氧", "器械", 5, { cardio: true }),
  ex("rower", "划船机", "有氧", "器械", 7, { cardio: true }),
  ex("jump_rope", "跳绳", "有氧", "自重", 11, { cardio: true }),

  // 体态 / 康复
  ex("chin_tuck", "收下巴", "体态", "自重", 2.5, { bodyweight: true }),
  ex("wall_slide", "靠墙天使", "体态", "自重", 3, { bodyweight: true }),
  ex("band_pull_apart", "弹力带拉开", "体态", "弹力带", 3),
  ex("hip_flexor_stretch", "髋屈肌拉伸", "体态", "垫上", 2.5, { bodyweight: true }),
  ex("cat_cow", "猫牛式", "体态", "垫上", 2.5, { bodyweight: true }),
];

/** 常用动作的默认组数（新建模板时用） */
const DEFAULT_SETS = 3;

/* ── 模板 ─────────────────────────────────────────────
 * 和用户的真实计划对齐：上肢A / 上肢B / 下肢综合 / 体态日。
 * 只是"预填"，不是"必须照做"——记录以实际完成为准。
 */

function tpl(id, name, focus, items) {
  return {
    id: "tpl_" + id,
    name,
    focus,
    exercises: items.map(([exId, sets]) => ({ exerciseId: "ex_" + exId, sets })),
  };
}

export const BUILTIN_TEMPLATES = [
  tpl("upper_a", "上肢 A · 胸肩三头", "胸 · 肩 · 三头", [
    ["chest_press_machine", 4],
    ["shoulder_press_machine", 3],
    ["pec_deck", 3],
    ["cable_pushdown", 3],
    ["lateral_raise_machine", 2],
  ]),
  tpl("upper_b", "上肢 B · 背后束二头", "背 · 后束 · 二头", [
    ["lat_pulldown", 4],
    ["seated_row", 3],
    ["face_pull", 3],
    ["cable_curl", 3],
  ]),
  tpl("lower", "下肢综合", "臀 · 腿 · 核心", [
    ["leg_press", 4],
    ["smith_rdl", 3],
    ["hip_thrust", 3],
    ["hip_abduction", 2],
    ["leg_extension", 2],
    ["dead_bug", 3],
  ]),
  tpl("posture", "体态日 · 轻剂量", "臀髋 · 上背", [
    ["hip_abduction", 2],
    ["hip_thrust", 2],
    ["face_pull", 2],
    ["treadmill_walk", 1],
  ]),
  tpl("cardio", "有氧日", "心肺", [["treadmill_walk", 1]]),
];

/** 空模板（什么都不预填） */
export const BLANK_TEMPLATE = {
  id: "tpl_blank",
  name: "空训练",
  focus: "自己加动作",
  exercises: [],
};

export const ALL_TEMPLATES = [...BUILTIN_TEMPLATES, BLANK_TEMPLATE];

/* ── 食物库 ───────────────────────────────────────────
 * 数值都是「每 100g（或 100ml）」。
 * kcal / p 蛋白 / c 碳水 / f 脂肪，单位 g。
 * 数据为常见家常值，够用来估口径；精确到克请用包装营养成分表。
 */

function fd(id, name, kcal, p, c, f, opts = {}) {
  return { id: "fd_" + id, name, kcal, p, c, f, ...opts };
}

export const BUILTIN_FOODS = [
  // 主食
  fd("rice", "米饭（熟）", 116, 2.6, 25.9, 0.3),
  fd("brown_rice", "糙米饭（熟）", 112, 2.6, 23, 0.9),
  fd("noodle", "面条（熟）", 110, 3.9, 22, 0.4),
  fd("mantou", "馒头", 223, 7, 47, 1.1),
  fd("bread_whole", "全麦面包", 246, 9, 43, 3.5),
  fd("oats", "燕麦片（干）", 377, 13, 66, 7),
  fd("sweet_potato", "红薯", 86, 1.6, 20, 0.1),
  fd("potato", "土豆", 77, 2, 17, 0.1),
  fd("corn", "玉米", 112, 4, 22, 1.2),
  fd("dumpling", "饺子（猪肉）", 240, 9, 28, 9),
  fd("baozi", "肉包", 227, 8, 32, 7),
  fd("rice_noodle", "米线（熟）", 109, 2, 24, 0.2),

  // 蛋白
  fd("egg", "鸡蛋", 143, 12.6, 1.1, 9.5, { servingGrams: 50, servingLabel: "1 个" }),
  fd("egg_white", "蛋清", 52, 11, 0.7, 0.2),
  fd("chicken_breast", "鸡胸肉（熟）", 133, 29, 0, 1.9),
  fd("chicken_thigh", "鸡腿肉（熟）", 181, 24, 0, 9),
  fd("beef_lean", "瘦牛肉（熟）", 125, 26, 0, 2.5),
  fd("pork_tenderloin", "猪里脊（熟）", 155, 27, 0, 5),
  fd("salmon", "三文鱼", 208, 20, 0, 13),
  fd("white_fish", "龙利鱼", 90, 18, 0, 2),
  fd("shrimp", "虾仁", 93, 18, 1, 1.4),
  fd("tofu", "北豆腐", 82, 8, 3, 4.5),
  fd("tofu_silken", "内酯豆腐", 50, 5, 2, 2.5),
  fd("milk", "牛奶", 54, 3.4, 5, 3.2),
  fd("soymilk", "无糖豆浆", 31, 3, 1.2, 1.6),
  fd("yogurt", "无糖酸奶", 60, 3.5, 5, 3),
  fd("greek_yogurt", "希腊酸奶", 97, 9, 4, 5),
  fd("whey", "乳清蛋白粉", 380, 78, 8, 5),
  fd("ham", "火腿肠", 212, 13, 10, 14),

  // 蔬菜 / 水果
  fd("broccoli", "西兰花", 34, 2.8, 7, 0.4),
  fd("lettuce", "生菜", 15, 1.4, 2.9, 0.2),
  fd("tomato", "番茄", 20, 0.9, 4, 0.2),
  fd("cucumber", "黄瓜", 16, 0.7, 3.6, 0.1),
  fd("spinach", "菠菜", 23, 2.9, 3.6, 0.4),
  fd("mushroom", "香菇", 26, 2.2, 5, 0.3),
  fd("banana", "香蕉", 93, 1.1, 23, 0.3, { servingGrams: 120, servingLabel: "1 根" }),
  fd("apple", "苹果", 53, 0.3, 14, 0.2, { servingGrams: 180, servingLabel: "1 个" }),
  fd("orange", "橙子", 48, 0.9, 12, 0.1),
  fd("blueberry", "蓝莓", 57, 0.7, 14, 0.3),

  // 油脂 / 零食
  fd("nuts", "混合坚果", 600, 20, 20, 50),
  fd("peanut_butter", "花生酱", 588, 25, 20, 50),
  fd("olive_oil", "橄榄油", 899, 0, 0, 100),
  fd("chocolate", "黑巧克力", 546, 5, 61, 31),

  // 外食 / 饮品（估算值，误差大，用来记个大概）
  fd("canteen_stir", "食堂炒菜（估）", 150, 7, 10, 9),
  fd("canteen_braise", "红烧菜（估）", 220, 12, 8, 15),
  fd("ramen", "拉面（含汤）", 130, 6, 18, 4),
  fd("malatang", "麻辣烫（估）", 120, 8, 8, 7),
  fd("fried_rice", "蛋炒饭", 186, 6, 25, 7),
  fd("coke", "可乐", 43, 0, 10.6, 0),
  fd("milk_tea", "奶茶（全糖）", 70, 1, 12, 2),
  fd("coffee_latte", "拿铁", 55, 3, 5, 2.5),
];

/* ── 查询 ─────────────────────────────────────────── */

/** 内置 + 自定义动作 */
export function allExercises(data) {
  return [...BUILTIN_EXERCISES, ...(data?.exercises ?? [])];
}

export function findExercise(data, id) {
  return allExercises(data).find((e) => e.id === id) ?? null;
}

/** 内置 + 自定义食物 */
export function allFoods(data) {
  return [...BUILTIN_FOODS, ...(data?.foods ?? [])];
}

export function findFood(data, id) {
  return allFoods(data).find((f) => f.id === id) ?? null;
}

/** 内置 + 自定义模板 */
export function allTemplates(data) {
  return [...ALL_TEMPLATES, ...(data?.templates ?? [])];
}

export function findTemplate(data, id) {
  return allTemplates(data).find((t) => t.id === id) ?? null;
}

/** 新建自定义动作（写库用，id 前缀 ex_） */
export function makeCustomExercise({ name, category, equipment = "其他", bodyweight = false }) {
  return {
    id: uid("ex"),
    name: String(name).trim(),
    category: category || "其他",
    equipment,
    met: 5,
    bodyweight: !!bodyweight,
    custom: true,
  };
}

/** 新建自定义食物（按"每 100g"存，和内置库口径一致） */
export function makeCustomFood({ name, kcal, protein = 0, carbs = 0, fat = 0 }) {
  return {
    id: uid("fd"),
    name: String(name).trim(),
    kcal: Number(kcal) || 0,
    p: Number(protein) || 0,
    c: Number(carbs) || 0,
    f: Number(fat) || 0,
    custom: true,
  };
}

export { DEFAULT_SETS };
