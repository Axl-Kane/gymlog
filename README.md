# 随身健 · 记录版（gymlog）

手机优先的训练 + 饮食记录网页。**零依赖、零构建**：没有 npm 包，没有编译，改完刷新就生效。
数据只存在浏览器的 localStorage 里，可一键导出 JSON / CSV。

- 产品与数据设计：`../产品文档/03_记录版_产品与数据设计.md`
- 旧版（计划驱动）：`../suishenjian/`，继续可用，不再迭代

## 线上地址

| 用途 | 地址 | 说明 |
|---|---|---|
| **长期使用（推荐）** | https://axl-kane.github.io/gymlog/ | GitHub Pages，链接固定；改完推送后自动重建 |
| 备用（WorkBuddy 沙箱） | https://forma-shape.app.workbuddy.host/?sharecode=7HBAGVQJ4Q | 平台应用入口，**必须带 sharecode**；缺参数会显示"链接不完整" |

代码仓库：https://github.com/Axl-Kane/gymlog（公开仓库，只有代码，没有任何训练/饮食记录）

手机上打开上面的地址 → 分享 → 添加到主屏幕，即可全屏离线使用。

## 本地跑起来

```bash
cd 健身工作台/gymlog
python -m http.server 5178
# 浏览器打开 http://localhost:5178
```

> 必须用 http:// 打开，不能双击 index.html（`file://` 下浏览器会拦 ES module）。

手机上试用：电脑和手机连同一个 Wi-Fi，手机访问 `http://<电脑局域网 IP>:5178`。
想"像 App 一样"用，需要 https（本地 http 下不能装到主屏）。

## 数据层测试

```bash
node tests/data.test.mjs
```

18 条用例，覆盖：一天两练不覆盖、同动作不重复、未完成的组不入统计、草稿组在结束时丢弃、
同餐不重复、热量快照、体重同日覆盖、脏数据隔离、损坏文件备份、导入幂等、老版本迁移、口径一致、order 连续。

## 目录

| 文件 | 职责 |
|---|---|
| `src/schema.js` | 字段定义、取值范围、id 生成、日期工具 |
| `src/validate.js` | 纯校验（errors 拦截 / warnings 提示） |
| `src/db.js` | 唯一的 localStorage 读写、数据修复、导入导出 |
| `src/repo.js` | 业务操作，界面只能调这里 |
| `src/calc.js` | 所有计算（容量、消耗、BMR、日汇总、图表序列） |
| `src/seed.js` | 内置动作库 / 模板 / 食物库 |
| `src/main.js` | 路由与事件分发 |
| `src/views/` | 页面与弹出面板 |
| `src/ui/` | 渲染工具、图标、导航、SVG 图表 |

## 改代码前先知道这四条

1. **不要给记录加"按日期存"的结构**。id 是主键，`localDate` 只是字段；否则一天两练会互相覆盖。
2. **不要在界面里直接改 `data`**。所有写入走 `repo.js`，它负责校验和落盘。
3. **不要改 `STORAGE_KEY`（`gymlog.db.v1`）而不写迁移**。改了等于手机里的历史全部读不到。
4. **不要在各个页面各算一套**。容量、消耗、日汇总只在 `calc.js` 算一次，别处调用。

口径提醒：`activityFactor` 是"不训练时的活动量"，训练消耗单独加，不要重复计算。

## 部署

纯静态，任何静态托管都能放。目前线上用 **GitHub Pages**（仓库根目录直接托管，无需构建）。

改完代码后同步到线上：

```bash
python scripts/publish-pages.py
```

脚本走 GitHub API 提交（因为本机代理会掐断 `git push` 到 github.com），约 1 分钟后 Pages 自动重建。
首次开启 Pages 需要在仓库 Settings → Pages 里选 `main` / `/ (root)`，已经开好了。

发版时记得改 `sw.js` 里的 `VERSION`，否则手机会一直用旧缓存。
