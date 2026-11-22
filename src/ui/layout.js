/** 页面骨架：导航条 */
import { h, raw } from "./dom.js";
import { icons } from "./icons.js";

/**
 * 顶部导航条
 * @param {object} o
 * @param {string} [o.title] 中间标题（空 = 不显示）
 * @param {string} [o.back] 返回链接（undefined = 不显示返回键）
 * @param {string} [o.rightLabel] 右侧按钮文字
 * @param {string} [o.rightAct] 右侧按钮的 data-act
 * @param {string} [o.rightAttrs] 右侧按钮额外的 data 属性
 */
export function navBar({ title = "", back, rightLabel = "", rightAct = "", rightAttrs = "" } = {}) {
  return h`<header class="nav">
    ${back !== undefined ? h`<a class="nav-btn" href="${back}" style="text-decoration:none">${raw(icons.back)}</a>` : h`<span class="nav-btn" style="visibility:hidden"></span>`}
    <div class="nav-title">${title}</div>
    ${
      rightLabel
        ? h`<button class="nav-btn right strong" data-act="${rightAct}" ${raw(rightAttrs)}>${rightLabel}</button>`
        : h`<span class="nav-btn right"></span>`
    }
  </header>`;
}

/** 大标题区 */
export function titleBlock(title, subtitle = "") {
  return h`<div class="title-block">
    <h1 class="large-title">${title}</h1>
    ${subtitle ? h`<div class="subtitle">${subtitle}</div>` : ""}
  </div>`;
}
