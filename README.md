# Sudoku Sprint (Vite + TypeScript + Phaser 3)

一个基于 Phaser 3 的单页数独闯关项目，使用 Vite + TypeScript 开发，包含 100 关、对局恢复、体力机制、难度分析与本地测试。

## 功能概览

- 100 关卡，按关卡区间逐步提高目标线索数难度
- 数独题面唯一解生成
- 技巧驱动的难度分析（裸单元、隐性单元、区块锁定）
- 失败判定（最大错误次数）与体力续关
- 对局自动存档与恢复（含候选笔记）
- 本地遥测事件记录（用于行为分析）
- Vitest 单元测试

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

### 5) 本地预览构建

```bash
npm run preview
```

## 核心机制说明

### 关卡与难度

- 关卡配置在 `src/game/simulation/levelConfig.ts`
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
- 部分通关情况会获得体力奖励

### 存档恢复

`progressStore` 会保存两类状态：

- 进度状态：最高解锁关、已完成关卡、当前体力
- 活跃对局：当前棋盘、选中格、错误次数、候选笔记

重新进入同关时会尝试恢复未完成对局。

## 离线难度校准

项目提供校准脚本，根据关卡目标线索分布生成阈值文件：

```bash
npm run calibrate:difficulty
```

该命令会覆盖写入：

- `src/game/simulation/difficultyThresholds.ts`

建议在以下场景执行：

- 调整了关卡线索配置
- 调整了难度评分公式
- 希望重新拟合难度分档区间

## 质量验证建议

提交前可执行：

```bash
npx tsc --noEmit && npm test && npm run build
```

## 许可证

当前仓库未声明开源许可证。如需开源，请补充 `LICENSE` 文件。
