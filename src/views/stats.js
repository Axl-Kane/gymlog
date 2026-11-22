/**
 * 「数据」页：统计 + 设置 + 备份
 *
 * 统计只讲三件事：体重/腰围的趋势、练了多少、吃的和消耗对不对得上。
 * 每个数字下面都标了口径（比如"支出 = 基础 + 训练"），避免看数的时候自己瞎猜。
 */

import { h, raw, dash } from "../ui/dom.js";
import { navBar } from "../ui/layout.js";
import { fmtMD, fmtNum, round, fmtRelativeDay, todayKey, num } from "../schema.js";
import {
  bodySeries,
  calorieSeries,
  rangeSummary,
  recentDays,
  targets,
  volumeSeries,
  dayIntake,
  latestBody,
  bmr,
} from "../calc.js";
import { barChart, legend, lineChart } from "../ui/chart.js";

export function renderStats(data, ctx) {
  const n = ctx.range || 7;
  const days = recentDays(ctx.today, n);
  const sum = rangeSummary(data, days);
  const t = targets(data.settings);

  const bodyPts = bodySeries(data, days).map((p) => ({ date: p.date, value: p.weight }));
  const waistPts = bodySeries(data, days).map((p) => ({ date: p.date, value: p.waist }));
  const volPts = volumeSeries(data, days);
  const calPts = calorieSeries(data, days);

  const weights = bodyPts.filter((p) => typeof p.value === "number").map((p) => p.value);
  const waistCount = waistPts.filter((p) => typeof p.value === "number").length;
  const wDelta = weights.length >= 2 ? round(weights[weights.length - 1] - weights[0], 1) : null;
  const latest = latestBody(data);

  return h`
  ${navBar({ title: "数据", back: undefined })}

  <div class="segmented" style="margin-top:2px">
    <button class="${n === 7 ? "on" : ""}" data-act="range" data-n="7">近 7 天</button>
    <button class="${n === 30 ? "on" : ""}" data-act="range" data-n="30">近 30 天</button>
  </div>

  <div class="section-title">身体</div>
  <div class="card">
    <div class="row">
      <div class="grow">
        <div class="label">体重</div>
        <div class="sub">${latest ? `最近 ${fmtRelativeDay(latest.localDate, ctx.today)}` : "还没有记录"}</div>
      </div>
      <div class="value" style="color:var(--text);font-size:22px;font-weight:600">
        ${latest?.weightKg ?? "—"}<span style="font-size:13px;color:var(--text-3);font-weight:400"> kg</span>
      </div>
      ${wDelta !== null ? h`<span class="badge ${wDelta > 0 ? "" : "green"}">${wDelta > 0 ? "+" : ""}${wDelta}</span>` : ""}
    </div>
    ${
      weights.length >= 2
        ? raw(lineChart(bodyPts, { color: "var(--blue)", unit: "" }))
        : h`<div class="empty" style="padding:18px 16px">${
            weights.length ? `最近 ${n} 天只有 1 条记录，切到「近 30 天」看趋势` : "还没有体重记录"
          }</div>`
    }
    <div class="row">
      <div class="grow label">腰围</div>
      <div class="value">${latest?.waistCm ? latest.waistCm + " cm" : "—"}</div>
    </div>
    ${waistCount >= 2 ? raw(lineChart(waistPts, { color: "var(--orange)", height: 110 })) : ""}
    <div class="row tappable" data-act="body-open">
      <div class="grow" style="color:var(--blue)">记录今天的身体数据</div>
      <span class="chevron">${raw("›")}</span>
    </div>
  </div>

  <div class="section-title">训练</div>
  <div class="card">
    <div class="grid-3">
      <div><div class="k">训练次数</div><div class="v">${sum.sessionCount}<span class="u">次</span></div></div>
      <div><div class="k">总组数</div><div class="v">${sum.sets}<span class="u">组</span></div></div>
      <div><div class="k">总容量</div><div class="v">${fmtNum(Math.round(sum.volume))}<span class="u">kg</span></div></div>
    </div>
    ${raw(barChart(days, [{ name: "容量", color: "var(--blue)", values: volPts.map((p) => p.volume) }], { unit: "" }))}
    <div class="row">
      <div class="grow sub" style="white-space:normal">柱子 = 当天训练容量（Σ 重量 × 次数，只算打勾的组）</div>
    </div>
  </div>

  <div class="section-title">热量</div>
  <div class="card">
    <div class="grid-3">
      <div><div class="k">平均摄入</div><div class="v">${sum.avgIntake || "—"}<span class="u">kcal</span></div></div>
      <div><div class="k">平均支出</div><div class="v">${Math.round(calPts.reduce((a, p) => a + p.expenditure, 0) / Math.max(1, calPts.length))}<span class="u">kcal</span></div></div>
      <div><div class="k">训练消耗</div><div class="v">${sum.burn}<span class="u">kcal</span></div></div>
    </div>
    ${raw(
      legend([
        { name: "摄入", color: "var(--blue)" },
        { name: "支出", color: "rgba(142,142,147,0.55)" },
      ]),
    )}
    ${raw(
      barChart(
        days,
        [
          { name: "摄入", color: "var(--blue)", values: calPts.map((p) => p.intake) },
          { name: "支出", color: "rgba(142,142,147,0.45)", values: calPts.map((p) => p.expenditure) },
        ],
        { unit: "" },
      ),
    )}
    <div class="row">
      <div class="grow sub" style="white-space:normal;line-height:1.5">
        支出 = BMR ${bmr(data.settings)} × 活动系数 ${data.settings.activityFactor} + 当天训练消耗；训练消耗在结束时冻结，不随体重变化回改。
      </div>
    </div>
  </div>

  ${renderSettings(data, t)}
  ${renderDataManage(data)}
  `;
}

/* ── 设置 ─────────────────────────────────────────── */

function renderSettings(data, t) {
  const s = data.settings;
  const numRow = (key, label, value, unit, step = 1, placeholder = "") => h`
    <div class="row">
      <div class="grow label">${label}</div>
      <input class="field flat" style="max-width:120px" type="number" inputmode="decimal"
        step="${step}" value="${value ?? ""}" placeholder="${placeholder}"
        data-act="setting" data-key="${key}" />
      <span class="value" style="width:34px">${unit}</span>
    </div>`;

  return h`
  <div class="section-title">设置</div>
  <div class="card">
    <div class="row">
      <div class="grow label">性别</div>
      <select class="field flat" style="max-width:120px" data-act="setting" data-key="sex" data-type="text">
        <option value="male" ${s.sex === "male" ? "selected" : ""}>男</option>
        <option value="female" ${s.sex === "female" ? "selected" : ""}>女</option>
      </select>
    </div>
    ${numRow("age", "年龄", s.age, "岁")}
    ${numRow("heightCm", "身高", s.heightCm, "cm")}
    ${numRow("bodyWeightKg", "体重", s.bodyWeightKg, "kg", 0.1)}
    <div class="row">
      <div class="grow">
        <div class="label">日常活动量</div>
        <div class="sub">不含训练，训练消耗另算</div>
      </div>
      <select class="field flat" style="max-width:120px" data-act="setting" data-key="activityFactor">
        <option value="1.2" ${num(s.activityFactor) === 1.2 ? "selected" : ""}>久坐</option>
        <option value="1.35" ${num(s.activityFactor) === 1.35 ? "selected" : ""}>日常走动</option>
        <option value="1.5" ${num(s.activityFactor) === 1.5 ? "selected" : ""}>很活跃</option>
      </select>
    </div>
    ${numRow("kcalTarget", "热量目标", s.kcalTarget, "kcal", 10, String(t.kcal))}
    ${numRow("proteinTarget", "蛋白目标", s.proteinTarget, "g", 5, String(t.protein))}
    <div class="row tappable" data-act="apply-targets">
      <div class="grow" style="color:var(--blue)">按推荐值填（${t.kcal} kcal / ${t.protein} g）</div>
    </div>
  </div>
  <div class="hint">留空 = 自动：热量按 BMR × 活动 − 300，蛋白按 1.8g/kg 体重。</div>`;
}

/* ── 数据管理 ─────────────────────────────────────── */

function renderDataManage(data) {
  const counts = {
    sessions: (data.sessions ?? []).length,
    meals: (data.meals ?? []).length,
    bodies: (data.bodies ?? []).length,
  };
  const last = data.meta?.lastWriteAt ? new Date(data.meta.lastWriteAt).toLocaleString("zh-CN") : "—";

  return h`
  <div class="section-title">数据</div>
  <div class="card">
    <div class="row">
      <div class="grow sub" style="white-space:normal;line-height:1.6">
        ${counts.sessions} 次训练 · ${counts.meals} 餐记录 · ${counts.bodies} 条身体数据<br />
        最后保存：${last}
      </div>
    </div>
    <div class="row tappable" data-act="export-json">
      <div class="grow" style="color:var(--blue)">导出备份（JSON）</div>
      <span class="chevron">${raw("›")}</span>
    </div>
    <div class="row tappable" data-act="export-csv">
      <div class="grow" style="color:var(--blue)">导出表格（CSV）</div>
      <span class="chevron">${raw("›")}</span>
    </div>
    <div class="row tappable" data-act="import-open">
      <div class="grow" style="color:var(--blue)">导入备份</div>
      <span class="chevron">${raw("›")}</span>
    </div>
    <div class="row tappable" data-act="clear-open">
      <div class="grow" style="color:var(--red)">清空本机数据</div>
      <span class="chevron">${raw("›")}</span>
    </div>
  </div>
  <div class="hint">换手机、清浏览器数据都会丢记录。建议每周导出一份 JSON 存到网盘。</div>`;
}
