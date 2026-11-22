/**
 * 迷你图表（纯 SVG，没有图表库）
 *
 * 为什么自己画：手机端只要两条线、几根柱子，引一个 200KB 的库不值当，
 * 而且自己画能保证配色和圆角跟界面一致。
 */

import { fmtMD } from "../schema.js";

let gid = 0;

function niceRange(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    max = min + 1;
    min = min - 1;
  }
  const pad = (max - min) * 0.15;
  return { min: min - pad, max: max + pad };
}

/**
 * 折线图（缺失值会断开，不会把两点硬连成一条假线）
 * @param {{date:string, value:number|null}[]} points
 */
export function lineChart(points, { height = 140, color = "var(--blue)", unit = "" } = {}) {
  const vals = points.map((p) => p.value).filter((v) => typeof v === "number");
  if (vals.length === 0) return `<div class="empty">还没有数据</div>`;

  const W = 320;
  const H = height;
  const padL = 38;
  const padR = 10;
  const padT = 12;
  const padB = 20;
  const { min, max } = niceRange(vals);

  const x = (i) =>
    padL + (points.length === 1 ? 0 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  // 把连续的非空点连成段落
  const segs = [];
  let cur = [];
  points.forEach((p, i) => {
    if (typeof p.value === "number") cur.push([x(i), y(p.value)]);
    else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  });
  if (cur.length) segs.push(cur);

  const id = "lg" + ++gid;
  const path = segs
    .map((seg) => seg.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" "))
    .join(" ");

  const lastSeg = segs[segs.length - 1] ?? [];
  const area =
    lastSeg.length > 1
      ? `${lastSeg.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ")} L${lastSeg[lastSeg.length - 1][0].toFixed(1)} ${H - padB} L${lastSeg[0][0].toFixed(1)} ${H - padB} Z`
      : "";

  const dots = points
    .map((p, i) =>
      typeof p.value === "number"
        ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${points.length > 14 ? 1.6 : 2.6}" fill="${color}" />`
        : "",
    )
    .join("");

  // 只标首尾日期，避免挤成一团
  const first = points[0]?.date ?? "";
  const last = points[points.length - 1]?.date ?? "";

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.18" />
        <stop offset="100%" stop-color="${color}" stop-opacity="0" />
      </linearGradient>
    </defs>
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="rgba(60,60,67,0.16)" stroke-width="1" />
    <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="rgba(60,60,67,0.08)" stroke-width="1" stroke-dasharray="3 3" />
    ${area ? `<path d="${area}" fill="url(#${id})" />` : ""}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
    <text x="${padL - 6}" y="${padT + 4}" text-anchor="end" font-size="9" fill="#8e8e93">${Math.round(max)}${unit}</text>
    <text x="${padL - 6}" y="${H - padB}" text-anchor="end" font-size="9" fill="#8e8e93">${Math.round(min)}${unit}</text>
    <text x="${padL}" y="${H - 5}" font-size="9" fill="#8e8e93">${first ? fmtMD(first) : ""}</text>
    <text x="${W - padR}" y="${H - 5}" text-anchor="end" font-size="9" fill="#8e8e93">${last ? fmtMD(last) : ""}</text>
  </svg>`;
}

/**
 * 柱状图（可多组对比，例如"摄入 vs 支出"）
 * @param {string[]} labels
 * @param {{name:string,color:string,values:number[]}[]} series
 */
export function barChart(labels, series, { height = 150, unit = "" } = {}) {
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length || all.every((v) => v === 0)) return `<div class="empty">还没有数据</div>`;

  const W = 320;
  const H = height;
  const padL = 38;
  const padR = 10;
  const padT = 14;
  const padB = 20;
  const max = Math.max(...all, 1) * 1.1;

  const n = labels.length;
  const groupW = (W - padL - padR) / Math.max(n, 1);
  const barW = Math.max(2, (groupW * 0.68) / series.length);

  const bars = series
    .map((s, si) =>
      s.values
        .map((v, i) => {
          const bh = (Math.max(0, v) / max) * (H - padT - padB);
          const bx = padL + i * groupW + groupW * 0.16 + si * barW;
          return `<rect x="${bx.toFixed(1)}" y="${(H - padB - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(2.5, barW / 2).toFixed(1)}" fill="${s.color}" />`;
        })
        .join(""),
    )
    .join("");

  const step = Math.ceil(n / 6);
  const ticks = labels
    .map((d, i) =>
      i % step === 0
        ? `<text x="${(padL + i * groupW + groupW / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#8e8e93">${fmtMD(d).replace("月", "/").replace("日", "")}</text>`
        : "",
    )
    .join("");

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="rgba(60,60,67,0.16)" stroke-width="1" />
    <text x="${padL - 6}" y="${padT + 4}" text-anchor="end" font-size="9" fill="#8e8e93">${Math.round(max)}${unit}</text>
    ${bars}
    ${ticks}
  </svg>`;
}

/** 图例 */
export function legend(items) {
  return `<div class="chart-legend">${items
    .map((i) => `<span><i class="dot" style="background:${i.color}"></i>${i.name}</span>`)
    .join("")}</div>`;
}
