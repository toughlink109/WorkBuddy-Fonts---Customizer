'use strict';
/**
 * WorkBuddy 安装位置探测（零依赖，供各脚本共用）
 *
 * 解决的问题：
 *   安装程序允许用户自选安装目录（例如 C:\Software\WorkBuddy、D:\Program Files\WorkBuddy）。
 *   如果只写死 %LOCALAPPDATA%\Programs\WorkBuddy，自定义安装的用户会直接报
 *   「没找到 WorkBuddy 的 app.asar」，看起来像脚本坏了。
 *
 * 探测顺序（先快后慢）：
 *   1. 环境变量 WB_INSTALL_DIR（手动指定，最高优先级）
 *   2. 常见安装目录（官方默认路径 + 几个高频自定义目录）
 *   3. 注册表卸载项里登记的安装目录（最可靠，能覆盖任意自定义路径）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// 可能的程序目录名（WorkBuddy 早期叫 Tencent CodeBuddy）
const APP_NAMES = ['WorkBuddy', 'Tencent CodeBuddy'];

// 注册表卸载项根路径
const UNINSTALL_ROOTS = [
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

// 常见安装目录（官方默认 + 高频自定义）
function commonInstallDirs() {
  const dirs = [];
  const home = os.homedir();
  const bases = [];

  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) bases.push(path.join(process.env.LOCALAPPDATA, 'Programs'));
    bases.push(path.join(home, 'AppData', 'Local', 'Programs'));
    if (process.env.ProgramFiles) bases.push(process.env.ProgramFiles);
    if (process.env['ProgramFiles(x86)']) bases.push(process.env['ProgramFiles(x86)']);
    // 用户常见的手动安装位置
    bases.push('C:\\Software', 'C:\\Program', 'D:\\Software', 'D:\\Program Files');
  } else if (process.platform === 'darwin') {
    return ['/Applications', path.join(home, 'Applications')];
  } else {
    return ['/opt', path.join(home, '.config')];
  }

  for (const base of bases) {
    for (const app of APP_NAMES) dirs.push(path.join(base, app));
  }
  return dirs;
}

// 从注册表卸载项里读安装目录（覆盖任意自定义路径）
function registryInstallDirs() {
  if (process.platform !== 'win32') return [];
  const dirs = [];
  for (const root of UNINSTALL_ROOTS) {
    let out = '';
    try {
      out = execFileSync('reg', ['query', root, '/s', '/f', 'WorkBuddy.exe'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (e) {
      continue; // 该根路径不存在或无匹配，继续下一个
    }
    // 匹配 DisplayIcon / UninstallString 里的安装目录，如 C:\Software\WorkBuddy\WorkBuddy.exe
    const re = /([A-Za-z]:\\[^"\r\n]*?)\\(?:Uninstall )?WorkBuddy\.exe/gi;
    let m;
    while ((m = re.exec(out)) !== null) {
      const dir = m[1];
      if (dir && !dirs.includes(dir)) dirs.push(dir);
    }
  }
  return dirs;
}

// 汇总所有候选安装目录
function candidateInstallDirs() {
  const dirs = [];
  const push = d => { if (d && !dirs.includes(d)) dirs.push(d); };
  if (process.env.WB_INSTALL_DIR) push(process.env.WB_INSTALL_DIR);
  commonInstallDirs().forEach(push);
  registryInstallDirs().forEach(push);
  return dirs;
}

// 定位 app.asar；找不到返回 null
function findAppAsar() {
  for (const dir of candidateInstallDirs()) {
    const p = path.join(dir, 'resources', 'app.asar');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 由 app.asar 路径反推 WorkBuddy.exe（resources 的上一级）
function findExeFromAsar(asarPath) {
  const root = path.dirname(path.dirname(asarPath)); // .../WorkBuddy
  const name = path.basename(root);
  for (const exeName of [name + '.exe', 'WorkBuddy.exe', 'CodeBuddy.exe']) {
    const p = path.join(root, exeName);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 直接定位可执行文件
function findExe() {
  const asar = findAppAsar();
  if (asar) {
    const exe = findExeFromAsar(asar);
    if (exe) return exe;
  }
  for (const dir of candidateInstallDirs()) {
    for (const exeName of ['WorkBuddy.exe', 'CodeBuddy.exe']) {
      const p = path.join(dir, exeName);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

module.exports = {
  APP_NAMES,
  commonInstallDirs,
  registryInstallDirs,
  candidateInstallDirs,
  findAppAsar,
  findExeFromAsar,
  findExe,
};
