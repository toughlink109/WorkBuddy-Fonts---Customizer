# WorkBuddy 字体 & 配色定制器

把 WorkBuddy 桌面端的界面字体换成你指定的任意字体，并可切换为 **Claude 暖色配色**（暖米白纸感 + 墨色文字 + 橙棕点缀）。

> 缘起：官方设置只能调字号、改不了字体样式，于是写了个脚本直接把字体"焊"进程序里。后来又想把配色改成 Obsidian 上 Claude 主题的暖色调，一并做了。这里把它做成了通用版，任何人都能用。

## 原理

WorkBuddy 是基于 Electron 的桌面应用，界面字体和配色硬编码在安装目录的 `app.asar` 里（CSS 变量的字体栈 + 设计 token）。新版 WorkBuddy 在 `WorkBuddy.exe` 里开启了 Electron 的 `EnableEmbeddedAsarIntegrityValidation`，改 `app.asar` 会被拒绝启动。本工具：

1. **关掉校验开关**：改 `WorkBuddy.exe` 里 1 个字节（改前自动备份 exe）；
2. **解析 `app.asar`**：自包含解析逻辑，**零第三方依赖**，只要有 Node.js 就能跑；
3. **字体**：把指定字体名插到界面字体栈最前面；
4. **配色**：在设计 token 主文件末尾追加一段 light 主题的变量覆盖；
5. **重新打包**：同步重算被改文件的 `integrity` 校验值，自动备份原文件。

**只改「界面 UI 字体」**，代码区/等宽字体不受影响（代码保持等宽，不会变楷体）。

## 兼容性

| 版本 | 资源结构 | 支持情况 |
|---|---|---|
| ≤ 5.8.2 | 全部打包在 `app.asar` 内 | ✅ 完整支持 |
| 5.8.3 ~ 5.9.x | 部分 `renderer/` 解包到磁盘，但 `index.html` 与 CSS 仍在 asar 内 | ✅ 走 asar 重打包流程（v4.2 起自动识别） |
| 5.8.3+ 全解包结构 | `app.asar.unpacked/renderer/index.html` 存在 | ⚠ 默认拒绝修改（带 SHA1 完整性校验，改了会白屏），只保留体检/还原 |

> 判断依据是**实际文件结构**，不是版本号。运行 `check` 会打印当前走哪条流程。

## 前置条件

1. **先安装好想要的字体**（否则改了也不显示）。下载 `.ttf`/`.otf` 后双击 → 点「安装」。
2. 电脑上有 **Node.js**。没装的话去 <https://nodejs.org> 下载安装。
   - 装了 WorkBuddy 的机器一般也自带 node，双击 `.bat` 会自动找到，无需手动装。

> 本仓库**不附带字体文件**。常用中文字体：仓耳今楷、霞鹜文楷（LXGW WenKai）、思源黑体、微软雅黑（系统自带）。

## 快速开始

### 方式一：双击运行（最简单）

**所有操作都从一个入口开始：双击 `wb-toolbox.bat`。**

```
[1] 改字体 + 配色（手动输入字体名）
[2] 更新后一键恢复（用上次的选择）
[3] 体检（只看当前状态，不改任何东西）
[4] 还原官方原样（字体配色、程序文件全部恢复默认）
[5] 查字体真实名字（改了没效果时先用这个）
```

- **首次使用**：选 `1`，输入字体名，配色那步按需选 `y`/`n`。脚本会**自动**先关校验开关再改字体配色，不需要分两步。
- **WorkBuddy 更新后**：选 `2`，用记住的选择一键恢复，全程无交互。
- **恢复默认**：选 `4`，把字体、配色、exe 校验开关一次性全还原。

> ⚠ 改字体/恢复前**记得先完全退出 WorkBuddy**（托盘图标右键 → 退出，不是关窗口）。文件被占用时脚本会直接停手，不会破坏任何文件。

### 方式二：命令行

```bash
# 换字体（会问要不要同时改配色）
node workbuddy-font-patcher.js "仓耳今楷03"

# 换多个字体（第一个优先，找不到就回退到第二个）
node workbuddy-font-patcher.js "霞鹜文楷, LXGW WenKai"

# 试运行：只生成新 asar，不替换、不动 exe
node workbuddy-font-patcher.js dry "LXGW WenKai"

# 体检：只看当前状态，不做任何修改
node workbuddy-font-patcher.js check

# 更新后一键恢复：用记住的设置，全程无交互
node workbuddy-font-patcher.js auto

# 总还原：把字体、配色、程序文件全部恢复成官方原样
node workbuddy-font-patcher.js restore
```

校验开关也可以单独操作：

```bash
node workbuddy-fuse-tool.js status    # 只看状态
node workbuddy-fuse-tool.js off       # 关闭校验（改界面的前提）
node workbuddy-fuse-tool.js on        # 恢复官方默认
node workbuddy-fuse-tool.js restore   # 用备份还原整个 exe
```

## 安装位置：自定义目录也支持

安装程序允许自选目录，所以程序不一定在默认位置。脚本按三级顺序探测，**不需要把本工具放进安装目录**：

1. 环境变量 `WB_INSTALL_DIR`（手动指定，优先级最高）
2. 常见路径：`%LOCALAPPDATA%\Programs\WorkBuddy`、`%ProgramFiles%\WorkBuddy`、`C:\Software\WorkBuddy`、`D:\Software\WorkBuddy` 等
3. **注册表卸载项里登记的安装目录**（能覆盖任意自定义路径）

```bash
# 手动指定（装在非常规位置时）
set WB_INSTALL_DIR=D:\Apps\WorkBuddy
node workbuddy-font-patcher.js check
```

> v4.1 及更早版本只认默认路径，装在 `C:\Software\WorkBuddy` 这类自定义目录会直接报「没找到 app.asar」——这是 v4.2 修复的主要问题。

## 怎么知道字体名？

**别靠翻系统设置猜名字**，直接用工具查——同一个字体在系统里常有两套名字，猜错不报错、只静默失效。

```bash
node font-resolver.js 仓耳      # 或双击工具箱选 [5]
```

输出会明确标注：

```
  仓耳今楷03       ★浏览器用名（推荐填这个）      [仓耳今楷03-W01.ttf]
  仓耳今楷03 W04   ⚠ GDI 注册表名（浏览器可能认不出）  [仓耳今楷03-W04.ttf]
```

**认准带 ★ 的那个**。原因：TTF 的 name 表里通常有两套家族名——

| 名称 | 字段 | 谁在用 |
|---|---|---|
| `仓耳今楷03 W04` | `nid=1 Family` | GDI / 注册表 / 「Windows 字体设置」里显示的名字 |
| `仓耳今楷03` | `nid=16 TypographicFamily` | **Chromium / DirectWrite 实际用的名字（浏览器优先取这个）** |

浏览器优先取 `nid=16`。把「Windows 设置」里看到的名字填进 CSS，浏览器**认不出来 → 静默回退默认字体**——不报错、看着像改了其实没生效。

### 已知盲区

`font-resolver.js` 只扫描 `.ttf` / `.otf`。系统自带字体多是 `.ttc` 集合文件（如微软雅黑的 `msyh.ttc`），会显示「未找到」，但**实际是装着的**，直接填英文家族名即可：

- 微软雅黑 → `Microsoft YaHei`
- 宋体 → `SimSun`、黑体 → `SimHei`、楷体 → `KaiTi`

> 注意：雅黑本来就是 Windows 上中文的默认回退字体，改它观感几乎不变，只有英文/数字会变。想明显变样请用楷体系。

## 配色改了什么

只改 **light（浅色）主题**，dark 主题不受影响。功能色（红/绿/黄/蓝）一律不动。

| 变量 | 原值 | 改后 |
|---|---|---|
| 主强调色（品牌色） | 青绿 `#00C29A` | 橙棕 `#b7791f` |
| 主背景 | 纯白 `#FFFFFF` | 暖米白 `#f8f7f2` |
| 主文字 | 纯黑 `#000000` | 墨色 `#49432f` |
| 灰阶 1~5 | 冷灰 `#FAFAFA`~`#E6E6E6` | 暖灰 `#faf9f4`~`#ddd7c6` |
| 侧边栏背景 | 冷灰 | `#f6f5ef` |

挂载点按内容特征自动识别（找定义 `--wb-palette-brand-8` 的 CSS），官方改文件名也不会失效。

## 还原与更新

- **改完需要重启 WorkBuddy 才生效。**
- **官方更新会覆盖补丁**——字体、配色、校验开关都会被恢复原样，这是程序决定的，工具无法提前预防。更新后跑一次 `2` 即可。
- 备份位置：
  - `resources/app.asar.backup`（原始 asar）
  - `WorkBuddy.exe.backup`（原始 exe，含校验开关状态）
  - 解包模式下为 `resources/.wb-patch-backup/`
- 重复运行不会把字体名叠加（自动以原始备份为基底重新生成）。
- exe 备份带**过期检测**：官方升级后 exe 变了，旧备份会被识别为过期并自动刷新，还原时不会拿旧版 exe 覆盖新版。

## 常见问题

**Q：提示「没找到 WorkBuddy 的 app.asar」**
程序装在自定义目录且 v4.1 及更早版本不认识。升级到 v4.2，或临时用 `WB_INSTALL_DIR` 指定目录。可先跑 `node tools/fuse-check.js` 看能否自动找到 exe。

**Q：改完界面白屏 / 一直刷新**
说明该版本对界面资源做了完整性校验。先跑 `node workbuddy-font-patcher.js restore` 还原；如果还原无效，重装 WorkBuddy。v4.2 在检测到全解包结构时会直接拒绝修改，避免踩这个坑。

**Q：字体填了没反应，看着没变**
名字填错了（填成了 GDI 名），或字体没装。用工具箱 `[5]` 查 ★ 名字；`ttc` 字体见上文盲区。

**Q：程序打不开，提示被占用**
WorkBuddy 没完全退出。托盘图标右键 → 退出，再重试。

**Q：想自己深入定位（只读）**

```bash
node tools/asar-probe.js   # asar 结构、文件数、token 主文件、补丁状态
node tools/fuse-check.js   # exe 的 fuse 开关逐项状态
```

## 文件说明

| 文件 | 作用 |
|---|---|
| `wb-toolbox.bat` | **唯一入口**：双击后弹菜单，5 个常用操作全包了 |
| `workbuddy-font-patcher.js` | 核心脚本（纯 Node，零依赖） |
| `find-workbuddy.js` | 安装位置探测：常见路径 + 注册表登记目录，支持自定义安装目录 |
| `workbuddy-fuse-tool.js` | 校验开关专用工具（status / off / on / restore） |
| `font-resolver.js` | 查字体名：区分 ★浏览器用名 与 ⚠GDI注册表名 |
| `tools/asar-probe.js` | asar 结构诊断（只读） |
| `tools/fuse-check.js` | fuse 校验开关探测（只读） |

## 更新日志

### v4.2

修复三处实际缺陷：

- **修复「找不到 WorkBuddy」**：原来只写死默认安装路径，装在自定义目录（如 `C:\Software\WorkBuddy`）会直接报错。新增 `find-workbuddy.js`，按「常见路径 → 注册表登记目录」探测，三个脚本共用。
- **修复「exe 备份永远显示已过期」**：备份有效性原来做逐字节 MD5 比对，而补丁本身就会改 fuse 那 1 个字节，导致刚建的备份立刻被判过期——后果是 `restore` 跳过 exe（校验开关关着回不去），重复打补丁还会覆盖掉干净备份。现在比对时忽略该字节。
- **修复 `dry` 模式会动 exe**：试运行原来也会关校验开关、写 exe 备份。现在 dry 只生成新 asar。

### v4.1

实测确认解包后的文件同样受完整性保护：`app.asar` header 里 renderer 条目都带 `integrity`，直接改磁盘文件会「界面空白 + 一直刷新」，随后被官方自动还原。因此解包模式**默认拒绝修改**，只保留 `check` / `restore`；确需尝试须显式加 `--unsafe`（高风险）。

### v4.0

适配 5.8.3+ 的资源结构识别（检测到解包目录走新流程，否则回落 asar 流程）。补丁部分已被 v4.1 撤回。

### v3.3

- 修正 v3.2 的方向性错误：`仓耳今楷03`（nid=16）才是浏览器认的名字，`仓耳今楷03 W04`（nid=1）填进去会静默回退。
- 新增字体名预校验：命中 GDI 名或查无此名时给出警告 + 建议名，需确认才继续（`--force` / `-y` 跳过）。

### v3.1

exe 备份加入过期检测（比对大小 + 哈希），避免升级后还原退回旧版程序；诊断脚本改为真实读取 fuse 开关。

### v3.0

自动检测并关闭 `EnableEmbeddedAsarIntegrityValidation`，解决「改完打不开」；`restore` 升级为总还原；新增 `auto` 模式。

### v2.0

配色挂载点改为按内容特征识别，不再依赖文件名；配色变量加 `!important`；新增 `check` 体检。

## 许可协议

**个人使用免费，商业使用禁止。**

- ✅ 允许：个人学习、研究、美化自用；修改代码；非商业性分享（需保留版权声明与本协议）
- ❌ 禁止：销售、收费服务、嵌入商业产品、在营利组织内部用于生产运营、流量变现
- 商业授权请联系作者

完整条款见 [LICENSE](LICENSE)。

## 免责声明

本工具通过修改本地安装的程序文件实现，属于非官方手段，仅供个人美化使用。使用前会自动备份，但请知悉：改动程序文件有极小概率导致异常（可随时 `wb-toolbox.bat → 4` 还原）；WorkBuddy 升级后需重新应用。使用者应自行确认其行为符合当地法律法规及 WorkBuddy 官方服务条款。
