/**
 * 极简渲染工具
 *
 * 没有框架，用模板字符串拼 HTML，然后整体替换。为了不手滑写出 XSS 或漏转义，
 * 这里用 h`` 标签：**插值默认转义**，需要插原始 HTML 时显式 raw()。
 */

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

const RAW = Symbol("raw");

/** 标记一段"已经是 HTML"的字符串 */
export function raw(s) {
  return { [RAW]: String(s ?? "") };
}

function serialize(v) {
  if (v === null || v === undefined || v === false) return "";
  if (Array.isArray(v)) return v.map(serialize).join("");
  if (typeof v === "object" && RAW in v) return v[RAW];
  return esc(v);
}

/**
 * 模板标签：h`<div>${userInput}</div>`
 *
 * 返回的是一个「带 RAW 标记的 String 对象」：
 *   - 能直接拼字符串（+ 会调用 valueOf 变成普通字符串）
 *   - 再被嵌进别的 h`` 时，serialize 认得出它是 HTML，不会二次转义
 * 这就是"嵌套模板不会变成一堆尖括号"的原因。
 */
export function h(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += serialize(values[i]) + strings[i + 1];
  }
  const boxed = new String(out);
  boxed[RAW] = out;
  return boxed;
}

/** 把 HTML 字符串变成节点 */
export function toNode(str) {
  const tpl = document.createElement("template");
  tpl.innerHTML = str.trim();
  return tpl.content.firstElementChild;
}

/** 数字角标：没有值显示 — */
export function dash(v, suffix = "") {
  if (v === null || v === undefined || v === "") return "—";
  return `${v}${suffix}`;
}

/** 生成一串 data-* 属性 */
export function attrs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ");
}
