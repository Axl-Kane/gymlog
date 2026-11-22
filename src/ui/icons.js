/** 底部标签栏和通用图标（纯 SVG，不用图片，省流量也不糊） */

export const icons = {
  today: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="M8 13.5h3M8 17h6"/></svg>`,
  train: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9.5v5M21.5 9.5v5M5.5 7v10M18.5 7v10M5.5 12h13"/></svg>`,
  diet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z"/><path d="M9 11.5V8M13 11.5V7M17 11.5V8"/><path d="M3 21h18"/></svg>`,
  stats: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V13M10 20V4M16 20v-9M22 20H2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c1.2-4 4-5.8 7.5-5.8S18.3 16 19.5 20"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>`,
};

export const TABS = [
  { id: "today", href: "#/today", label: "今天", icon: "today" },
  { id: "train", href: "#/train", label: "训练", icon: "train" },
  { id: "diet", href: "#/diet", label: "饮食", icon: "diet" },
  { id: "stats", href: "#/stats", label: "数据", icon: "stats" },
];

export function renderTabbar(active) {
  return `<nav class="tabbar">${TABS.map(
    (t) =>
      `<a href="${t.href}" class="${t.id === active ? "on" : ""}">${icons[t.icon]}<span>${t.label}</span></a>`,
  ).join("")}</nav>`;
}
