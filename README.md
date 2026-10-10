# Sudoku Sprint (Vite + TypeScript + Phaser 3)

一个基于 Phaser 3 的单页数独闯关项目，使用 Vite + TypeScript 开发，包含 100 关、对局恢复、体力机制、难度分析与本地测试。

## 功能概览

- 100 个唯一解关卡，按实际分析分数非递减排列，每个难度档位 20 关
- 离线生成题库，进入关卡时无需搜索题面
- 技巧驱动的难度分析（裸单元、隐性单元、区块锁定）
- 失败判定（最大错误次数）与体力续关
- 对局自动存档与恢复（含候选笔记、失败状态和旧版题面兼容）
- 鼠标、触屏和触控笔长按数字仅高亮，不误填
- 本地存储异常时切换为内存存档，并显示可能丢失进度的提示
- 本地遥测事件记录（用于行为分析）
- Vitest 单元测试
- 基于 jsdom 的场景交互回归测试（使用真实棋盘 DOM 和游戏逻辑）
- 设置页：减少动画、关联格高亮、长按数字高亮，偏好自动保存
- 棋盘节点只在进入关卡时创建，操作时增量更新，保留键盘焦点
- 首页使用 SVG 齿轮与数独主题视觉，展示闯关进度、7 日签到和每日免费转盘

## 技术栈

- Vite
- TypeScript
- Phaser 3
- Vitest

## 目录结构

```text
.
├─ index.html
├─ src/
│  ├─ main.ts
│  ├─ style.css
│  ├─ game/
│  │  ├─ analytics/
│  │  │  └─ telemetry.ts
│  │  └─ simulation/
│  │     ├─ difficultyAnalyzer.ts
│  │     ├─ difficultyThresholds.ts
│  │     ├─ levelConfig.ts
│  │     ├─ progressStore.ts
│  │     └─ sudokuEngine.ts
│  └─ phaser/
│     ├─ GameBridge.ts
│     └─ scenes/
│        ├─ HomeScene.ts
│        ├─ LevelScene.ts
│        └─ GameScene.ts
├─ tests/
└─ scripts/
   └─ calibrate-difficulty.mjs
```

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 启动开发环境

```bash
npm run dev
```

默认端口为 `5724`。

### 3) 运行测试

```bash
npm test
```

监听模式：

```bash
npm run test:watch
```

### 4) 构建产物

```bash
npm run build
```

`build` 会先运行 TypeScript 类型检查，再构建。Phaser 输出为独立带内容哈希的分包，业务更新无需让用户重新下载未变更的引擎文件；首次访问仍需加载引擎。部署时应对带哈希的 `assets` 文件设置长期缓存，HTML 保持可重新验证。

### 5) 本地预览构建

```bash
npm run preview
```

## 核心机制说明

### 关卡与难度

- 关卡配置在 `src/game/simulation/levelConfig.ts`
- 固定题库在 `src/game/simulation/levelBank.json`
- 题面难度由 `src/game/simulation/difficultyAnalyzer.ts` 评估
- 分档阈值来自 `src/game/simulation/difficultyThresholds.ts`

运行时会结合技巧使用情况和未解空格数映射到：

- `easy`（新手热身）
- `normal`（稳定推进）
- `hard`（进阶挑战）
- `expert`（专家试炼）
- `master`（大师冲刺）

### 体力与续关

- 初始体力由 `START_STAMINA` 定义
- 使用提示会消耗体力
- 失败后可在体力足够时继续当前对局
- 失败状态在返回关卡页或刷新后保留，继续当前棋盘仍需消耗体力
- 也可免费重新开始本关，但会清空本关已填写内容和笔记
- 体力不足时仅停用提示，不阻止手动解题
- 部分通关情况会获得体力奖励

### 每日奖励

- 签到连续 7 天分别奖励 2、2、3、3、4、4、6 点体力；第 8 天开始新一轮，断签回到第 1 天
- 转盘每天免费一次，六个奖格等概率，分别为 2、3、5、2、3、8 点体力，无付费入口
- 以设备本地日期刷新；体力上限 99，满体力不消耗领取资格，临近上限只补满剩余体力
- 奖励金额与已领取记录写入同一条进度存档，转盘动画中离开页面不会丢失已发奖励
- 奖励属于单机本地存档，不提供跨设备同步或服务端防作弊；清除浏览器数据、修改日期可影响领取记录

### 存档恢复

`progressStore` 会保存两类状态：

- 进度状态：最高解锁关、已完成关卡、当前体力
- 活跃对局：当前棋盘、选中格、错误次数、候选笔记、失败状态和题库版本

重新进入同关时会尝试恢复未完成对局。旧版活跃对局继续使用原题面，新对局使用固定题库。

浏览器拒绝存储、空间不足或删除失败时，当次页面改用内存保存；游戏可继续，但刷新或关闭页面后可能丢失这部分进度。

### 重新生成题库

调整评分算法或难度阈值后执行：

```bash
node scripts/generate-levels.mjs
npm test
```

生成脚本按实际难度筛选题面；测试检查全部 100 关唯一解、难度档位和相邻分数非递减。评分是当前分析器的估计值，不代表玩家的主观难度严格递增。题库版本 2 发布后不应直接替换题面；再次更换需增加版本并保留对应旧题库，避免破坏进行中的存档。

## 离线难度校准

项目保留旧版校准脚本，根据目标线索分布估算阈值文件（不是技巧难度实测）：

```bash
npm run calibrate:difficulty
```

该命令会覆盖写入：

- `src/game/simulation/difficultyThresholds.ts`

运行后必须重新生成题库并通过上述测试，不能只替换阈值。

建议在以下场景执行：

- 调整了关卡线索配置
- 调整了难度评分公式
- 希望重新拟合难度分档区间

## 质量验证建议

提交前可执行：

```bash
npm run check
```

也可单独运行 `npm run typecheck`。交互测试覆盖失败恢复、续关扣费、体力耗尽、模拟触屏长按/中断、反复进入场景时监听器清理、设置保存与恢复默认、棋盘节点复用和焦点保留。jsdom 不模拟 Phaser 的图形渲染或真实手机系统手势，仍需浏览器和手机实测。

## 许可证

当前仓库未声明开源许可证。如需开源，请补充 `LICENSE` 文件。
