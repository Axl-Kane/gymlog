/**
 * 「训练」页：历史列表 + 训练详情（也承担"训练中"的记录界面）
 *
 * 记录方式的关键设计：
 *   每行一组 = 重量 + 次数 + 一个勾。
 *   勾 = "这组真做了"，只有打了勾的组才进统计；没打勾的是草稿，结束训练时自动丢弃。
 *   这样预填的模板不会污染数据，也不会出现"计划 4 组、实际 3 组"却算成 4 组的情况。
 */

import { h, raw, dash } from "../ui/dom.js";
import { navBar, titleBlock } from "../ui/layout.js";
import {
  fmtMD,
  fmtDuration,
  fmtTime,
  fmtNum,
  weekdayCN,
  FEELING_LABEL,
  fmtRelativeDay,
  round,
} from "../schema.js";
import {
  bestSet,
  lastPerformance,
  personalBest,
  sessionBurn,
  sessionMinutes,
  sessionSets,
  sessionVolume,
  entrySets,
} from "../calc.js";
import { icons } from "../ui/icons.js";
import { findExercise } from "../seed.js";

/* ── 列表 ─────────────────────────────────────────── */

export function renderTrainList(data, ctx) {
  const list = [...(data.sessions ?? [])].sort((a, b) => b.startedAt - a.startedAt);
  const active = list.find((s) => s.status === "active");
  const done = list.filter((s) => s.status === "done");

  const monthKey = ctx.today.slice(0, 7);
  const monthSessions = done.filter((s) => s.localDate.startsWith(monthKey));

  return h`
  ${titleBlock("训练", `${done.length} 次记录`)}
  ${
    active
      ? h`<div class="card">
          <div class="row tappable" data-act="resume" data-id="${active.id}">
            <div class="grow">
              <div class="label" style="font-weight:600">${active.title}</div>
              <div class="sub">进行中 · 已 ${fmtDuration(sessionMinutes(active))} · ${sessionSets(active)} 组</div>
            </div>
            <span class="badge">继续</span>
          </div>
        </div>`
      : ""
  }

  <div class="card">
    <div class="grid-3">
      <div><div class="k">本月训练</div><div class="v">${monthSessions.length}<span class="u">次</span></div></div>
      <div><div class="k">本月容量</div><div class="v">${fmtNum(Math.round(monthSessions.reduce((n, s) => n + sessionVolume(s), 0) / 100) / 10)}<span class="u">吨</span></div></div>
      <div><div class="k">本月组数</div><div class="v">${monthSessions.reduce((n, s) => n + sessionSets(s), 0)}<span class="u">组</span></div></div>
    </div>
  </div>

  <div class="btn-row">
    <button class="btn" data-act="start">开始训练</button>
  </div>

  <div class="section-title">历史</div>
  ${
    done.length
      ? h`<div class="card">${done.map((s) => sessionRow(s, data))}</div>`
      : h`<div class="empty">还没有完成的训练。<br />点上面的「开始训练」，练完打勾，结束就存下来了。</div>`
  }
  `;
}

function sessionRow(s, data) {
  const sets = sessionSets(s);
  const vol = sessionVolume(s);
  const volText = vol >= 1000 ? `${round(vol / 1000, 1)} 吨` : `${Math.round(vol)} kg`;
  return h`<a class="row tappable" href="#/train/${s.id}" style="text-decoration:none;color:inherit">
    <div style="width:52px;flex:none">
      <div style="font-size:15px;font-weight:600">${fmtMD(s.localDate).replace("月", "/").replace("日", "")}</div>
      <div style="font-size:11px;color:var(--text-3)">${weekdayCN(s.localDate)}</div>
    </div>
    <div class="grow">
      <div class="label" style="font-weight:500">${s.title}</div>
      <div class="sub">${sessionMinutes(s)} 分钟 · ${sets} 组 · ${volText}</div>
    </div>
    <div class="value mono" style="min-width:56px;text-align:right">
      ${sessionBurn(s, data.settings)}<span style="font-size:11px"> kcal</span>
    </div>
    <span class="chevron">${raw(icons.chevron)}</span>
  </a>`;
}

/* ── 详情 / 训练中 ────────────────────────────────── */

export function renderSession(data, ctx, id) {
  const s = (data.sessions ?? []).find((x) => x.id === id);
  if (!s) {
    return h`${navBar({ title: "训练", back: "#/train" })}
      <div class="empty">找不到这次训练，可能已经被删掉了。</div>`;
  }

  const activeMode = s.status === "active";
  const sets = sessionSets(s);
  const vol = sessionVolume(s);
  const burn = sessionBurn(s, data.settings);

  return h`
  ${navBar({
    title: activeMode ? "训练中" : fmtMD(s.localDate),
    back: "#/train",
    rightLabel: activeMode ? "" : "编辑",
    rightAct: "reopen",
    rightAttrs: `data-id="${s.id}"`,
  })}

  <div class="card pad" style="margin-top:4px">
    <div style="display:flex;align-items:flex-start;gap:8px">
      <div style="flex:1;min-width:0">
        <input class="field text" style="font-size:20px;font-weight:600;padding:0;background:transparent"
          value="${s.title}" data-act="session-title" data-id="${s.id}" ${activeMode ? "" : "readonly"} />
        <div class="sub" style="margin-top:6px">
          ${fmtMD(s.localDate)} ${weekdayCN(s.localDate)} ·
          ${fmtTime(s.startedAt)}${s.endedAt ? "–" + fmtTime(s.endedAt) : " 开始"}
        </div>
      </div>
      <span class="badge ${activeMode ? "" : "gray"}">${activeMode ? "进行中" : "已完成"}</span>
    </div>

    <div class="grid-3" style="margin:14px -16px -16px;background:var(--sep-weak)">
      <div><div class="k">时长</div><div class="v">${sessionMinutes(s)}<span class="u">分</span></div></div>
      <div><div class="k">组数</div><div class="v">${sets}<span class="u">组</span></div></div>
      <div><div class="k">容量</div><div class="v">${fmtNum(Math.round(vol))}<span class="u">kg</span></div></div>
    </div>
  </div>

  ${s.entries.map((e) => entryCard(data, s, e, activeMode))}

  ${activeMode ? h`<div class="btn-row">
      <button class="btn secondary" data-act="add-exercise" data-id="${s.id}">+ 添加动作</button>
    </div>` : ""}

  ${
    !activeMode
      ? h`<div class="card">
          <div class="row">
            <div class="grow label">训练消耗</div>
            <div class="value mono" style="color:var(--text)">${burn} kcal
              <span class="badge gray" style="margin-left:6px">${s.burnSource === "manual" ? "手动" : "估算"}</span>
            </div>
          </div>
          <div class="row">
            <div class="grow label">感受</div>
            <div class="value">${s.feeling ? FEELING_LABEL[s.feeling] : "—"}</div>
          </div>
          <div class="row" style="align-items:flex-start">
            <div class="grow">
              <div class="label" style="margin-bottom:4px">备注</div>
              <textarea class="field text" rows="2" placeholder="状态、疼痛、动作感受…"
                data-act="session-note" data-id="${s.id}">${s.note ?? ""}</textarea>
            </div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn danger" data-act="del-session" data-id="${s.id}">删除这次训练</button>
        </div>`
      : ""
  }
  ${activeMode ? actionBar(s) : h`<div style="height:16px"></div>`}
  `;
}

function actionBar(s) {
  return h`<div class="actionbar">
    <div style="flex:1;min-width:0">
      <div style="font-size:11px;color:var(--text-3)">总容量</div>
      <div style="font-size:17px;font-weight:600" class="mono">${fmtNum(Math.round(sessionVolume(s)))} kg</div>
    </div>
    <button class="btn" style="width:auto;padding:12px 24px" data-act="finish-open" data-id="${s.id}">结束训练</button>
  </div>`;
}

/* ── 单个动作卡 ───────────────────────────────────── */

function entryCard(data, session, entry, editable) {
  const last = lastPerformance(data, entry.exerciseId, session.id);
  const pb = personalBest(data, entry.exerciseId);
  const doneCount = entrySets(entry);
  // 自重动作：老数据里可能没存 bodyweight 标记，这里按动作库兜底判断
  const bodyweight = entry.bodyweight ?? !!findExercise(data, entry.exerciseId)?.bodyweight;

  const lastText = last
    ? last.best.weightKg > 0
      ? `上次 ${last.date} · ${last.best.weightKg}kg × ${last.best.reps}`
      : `上次 ${last.date} · ${last.best.reps} 次`
    : "第一次练这个动作";

  return h`<div class="entry">
    <div class="entry-head">
      <div style="flex:1;min-width:0">
        <div class="entry-name">${entry.name}
          ${pb && pb.weightKg > 0 ? h`<span class="badge gray" style="margin-left:6px">最好 ${pb.weightKg}×${pb.reps}</span>` : ""}
        </div>
        <div class="entry-meta" ${editable && last ? raw(`data-act="prefill" data-id="${session.id}" data-entry="${entry.id}" style="cursor:pointer"`) : ""}>
          ${lastText}${editable && last ? h`<span style="color:var(--blue)"> · 套用</span>` : ""}
          ${doneCount ? ` · 本次 ${doneCount} 组` : ""}
        </div>
      </div>
      ${
        editable
          ? h`<button class="link-muted" data-act="del-entry" data-id="${session.id}" data-entry="${entry.id}">移除</button>`
          : ""
      }
    </div>

    <div class="set-head"><span>组</span><span>重量 kg</span><span>次数</span><span></span></div>
    ${entry.sets.map((set, i) => setRow(session, entry, set, i, editable, bodyweight))}

    ${editable ? h`<button class="set-add" data-act="add-set" data-id="${session.id}" data-entry="${entry.id}">+ 加一组</button>` : ""}
    ${!editable && entry.sets.length === 0 ? h`<div class="hint" style="padding:0 16px 14px">这次没有完成的组</div>` : ""}
  </div>`;
}

function setRow(session, entry, set, i, editable, bodyweight) {
  return h`<div class="set-row ${set.done ? "done" : ""}">
    <span class="set-idx">${i + 1}</span>
    <input class="field" type="number" inputmode="decimal" step="0.5" min="0" max="500"
      value="${set.weightKg ? set.weightKg : ""}" placeholder="${bodyweight ? "自重" : "kg"}"
      data-act="set-weight" data-id="${session.id}" data-entry="${entry.id}" data-set="${set.id}"
      ${editable ? "" : "readonly"} />
    <input class="field" type="number" inputmode="numeric" step="1" min="1" max="200"
      value="${set.reps ? set.reps : ""}" placeholder="次"
      data-act="set-reps" data-id="${session.id}" data-entry="${entry.id}" data-set="${set.id}"
      ${editable ? "" : "readonly"} />
    <button class="check ${set.done ? "on" : ""}" data-act="toggle-set"
      data-id="${session.id}" data-entry="${entry.id}" data-set="${set.id}"
      ${editable ? "" : "disabled"}>${set.done ? raw(icons.check) : ""}</button>
  </div>`;
}
