/**
 * 「今天」页
 *
 * 只回答三个问题：今天练了没、吃了多少、身体什么情况。
 * 不放大图表、不放励志文案 —— 打开就要能一眼看完，然后去做事。
 */

import { h, raw, dash } from "../ui/dom.js";
import { titleBlock } from "../ui/layout.js";
import { fmtMD, weekdayCN, fmtRelativeDay, fmtDuration, fmtNum, round } from "../schema.js";
import { daySummary, latestBody, recentDays, rangeSummary, sessionMinutes, sessionSets, sessionVolume } from "../calc.js";

export function renderToday(data, ctx) {
  const { today } = ctx;
  const s = daySummary(data, today);
  const t = s.target;
  const active = s.sessions.find((x) => x.status === "active");
  const doneToday = s.doneSessions;
  const pct = t.kcal > 0 ? Math.min(100, Math.round((s.intake.kcal / t.kcal) * 100)) : 0;
  const remain = Math.max(0, t.kcal - s.intake.kcal);

  const body = latestBody(data);
  const bodyToday = s.body;

  const week = rangeSummary(data, recentDays(today, 7));
  const lastDone = [...(data.sessions ?? [])]
    .filter((x) => x.status === "done" && x.localDate < today)
    .sort((a, b) => b.startedAt - a.startedAt)[0];

  return h`
  ${titleBlock("今天", `${fmtMD(today)} ${weekdayCN(today)}`)}
  ${renderTrainingCard(active, doneToday, lastDone)}
  ${renderNutritionCard(s, t, pct, remain)}
  ${renderBodyCard(body, bodyToday, today)}
  <div class="section-title">本周</div>
  <div class="card">
    <div class="grid-3">
      <div>
        <div class="k">训练</div>
        <div class="v">${week.sessionCount}<span class="u">次</span></div>
      </div>
      <div>
        <div class="k">总容量</div>
        <div class="v">${fmtNum(Math.round(week.volume / 100) / 10)}<span class="u">吨</span></div>
      </div>
      <div>
        <div class="k">平均摄入</div>
        <div class="v">${week.avgIntake ? week.avgIntake : "—"}${week.avgIntake ? h`<span class="u">kcal</span>` : ""}</div>
      </div>
    </div>
  </div>
  <div class="hint">数据只存在这台手机里。定期到「数据」页导出备份。</div>`;
}

/* ── 训练卡 ───────────────────────────────────────── */

function renderTrainingCard(active, doneToday, lastDone) {
  if (active) {
    const sets = sessionSets(active);
    return h`<div class="card pad">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="badge">进行中</span>
        <span class="muted mono" style="font-size:13px">${fmtDuration(sessionMinutes(active))} · ${sets} 组已完成</span>
      </div>
      <div style="font-size:20px;font-weight:600;letter-spacing:-0.3px;margin-bottom:14px">${active.title}</div>
      <button class="btn" data-act="resume" data-id="${active.id}">继续训练</button>
    </div>`;
  }

  if (doneToday.length) {
    const sc = doneToday[0];
    return h`<div class="card">
      <div class="row">
        <div class="grow">
          <div class="label" style="font-weight:600">${sc.title}</div>
          <div class="sub">${fmtDuration(sessionMinutes(sc))} · ${sessionSets(sc)} 组 · ${Math.round(sessionVolume(sc))} kg 容量</div>
        </div>
        <a class="value" href="#/train/${sc.id}" style="text-decoration:none;color:var(--blue);font-size:15px">查看</a>
      </div>
      <div class="row tappable" data-act="start">
        <div class="grow label">再练一次</div>
        <span class="chevron">${raw("›")}</span>
      </div>
    </div>`;
  }

  return h`<div class="card pad">
    <div style="font-size:17px;font-weight:600;margin-bottom:2px">今天练什么</div>
    <div class="sub">
      ${lastDone ? `上次训练：${fmtRelativeDay(lastDone.localDate)} · ${lastDone.title}` : "还没有训练记录"}
    </div>
    <div style="padding-top:14px">
      <button class="btn" data-act="start">开始训练</button>
    </div>
  </div>`;
}

/* ── 营养卡 ───────────────────────────────────────── */

function renderNutritionCard(s, t, pct, remain) {
  const p = s.intake;
  const macro = (label, now, target, color) => h`
    <div class="macro">
      <div class="k"><span>${label}</span><span>${round(now, 0)} / ${target}g</span></div>
      <div class="bar"><i style="width:${target ? Math.min(100, (now / target) * 100) : 0}%;background:${color}"></i></div>
    </div>`;

  return h`<div class="card">
    <div style="display:flex;gap:16px;padding:16px;align-items:center">
      <div class="ring-wrap">
        <div class="ring" style="--p:${pct}"><span>${pct}<em style="font-size:11px;font-style:normal;color:var(--text-3)">%</em></span></div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--text-3)">今日摄入</div>
        <div style="font-size:28px;font-weight:700;letter-spacing:-0.6px;line-height:1.2">
          ${fmtNum(p.kcal)}<span style="font-size:14px;color:var(--text-3);font-weight:400"> / ${t.kcal} kcal</span>
        </div>
        <div style="font-size:13px;color:var(--text-3);margin-top:4px">
          还能吃 ${remain} kcal · 消耗 ${s.burn} kcal
        </div>
      </div>
    </div>
    <div class="macro-row" style="border-top:0.5px solid var(--sep-weak)">
      ${macro("蛋白", p.p, t.protein, "var(--blue)")}
      ${macro("碳水", p.c, t.carbs, "var(--orange)")}
      ${macro("脂肪", p.f, t.fat, "var(--green)")}
    </div>
    <div class="row tappable" data-act="add-food-quick">
      <div class="grow label">记一笔饮食</div>
      <span class="chevron">${raw("›")}</span>
    </div>
  </div>`;
}

/* ── 身体卡 ───────────────────────────────────────── */

function renderBodyCard(latest, todayBody, today) {
  return h`<div class="card">
    <div class="row tappable" data-act="body-open">
      <div class="grow">
        <div class="label">身体数据</div>
        <div class="sub">${latest ? `最近一次 ${fmtRelativeDay(latest.localDate, today)}` : "还没记过"}</div>
      </div>
      <div class="value" style="color:var(--text)">
        ${latest ? `${dash(latest.weightKg, " kg")} · 腰 ${dash(latest.waistCm)}` : "记录"}
      </div>
      <span class="chevron">${raw("›")}</span>
    </div>
  </div>`;
}
