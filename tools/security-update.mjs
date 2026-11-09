#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// tools/security-update.mjs — Node.js 本体（Homebrew）と npm 依存パッケージの脆弱性を点検し、
// 安全な範囲（メジャーバージョンを壊さない範囲）で自動的に更新・修正するスクリプト。
//
// 使い方:
//   node tools/security-update.mjs           点検＋自動修正（Node.js 更新 & npm audit fix）
//   node tools/security-update.mjs --check   点検のみ（変更しない）
//   node tools/security-update.mjs --hook    Antigravity SessionStart フック用（24時間に1回自動実行し JSON を出力）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/marp-env.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const IS_HOOK = process.argv.includes('--hook');
const FORCE_RUN = process.argv.includes('--force-run');

// GUI や LaunchAgent から起動された場合でも Homebrew の node / npm / brew を見つけられるようにする
const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', path.dirname(process.execPath)];
process.env.PATH = [...new Set([...extraPaths, ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)])].join(path.delimiter);

const logs = [];
const actions = [];
function log(msg) {
  logs.push(msg);
  if (!IS_HOOK) console.log(msg);
}

function run(cmd, args, cwd = ROOT) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ENV_HINTS: '1' },
    timeout: 5 * 60 * 1000,
  });
}

// 1. Homebrew の Node.js 本体の更新チェック・自動アップグレード
function checkAndUpgradeNode() {
  const brewBin = extraPaths.map((d) => path.join(d, 'brew')).find((p) => fs.existsSync(p));
  if (!brewBin) {
    log(`  · Homebrew が見つからないため、Node.js 本体 (${process.version}) の自動更新はスキップします`);
    return;
  }
  const out = run(brewBin, ['outdated', '--json=v2', 'node']);
  if (out.status !== 0) {
    log(`  ✔ Node.js 本体: ${process.version}（状態確認完了）`);
    return;
  }
  let outdatedInfo = null;
  try {
    const parsed = JSON.parse(out.stdout || '{}');
    if (parsed.formulae && parsed.formulae.length > 0) {
      outdatedInfo = parsed.formulae[0];
    }
  } catch { /* ignore */ }

  if (!outdatedInfo) {
    log(`  ✔ Node.js 本体: ${process.version}（最新です）`);
    return;
  }

  const installed = (outdatedInfo.installed_versions || []).join(', ') || process.version;
  const current = outdatedInfo.current_version || '最新版';
  if (CHECK_ONLY) {
    log(`  ⚠ Node.js 本体: 更新があります（現在 ${installed} → 最新 ${current}）`);
    actions.push(`Node.js 本体に更新があります（${installed} → ${current}）`);
    return;
  }

  log(`  ↻ Node.js 本体を更新しています（${installed} → ${current}）…`);
  const up = run(brewBin, ['upgrade', 'node']);
  if (up.status === 0) {
    log(`  ✔ Node.js 本体を ${current} に自動更新しました`);
    actions.push(`Node.js 本体を ${installed} から ${current} に自動更新しました`);
  } else {
    log(`  ✘ Node.js 本体の更新に失敗しました: ${(up.stderr || '').trim()}`);
  }
}

// 2. npm audit による脆弱性チェックと非破壊の自動修正（npm audit fix）
function checkAndFixNpmDir(dir, label) {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return;
  const audit = run('npm', ['audit', '--json'], dir);
  let report = null;
  try {
    report = JSON.parse(audit.stdout || '{}');
  } catch {
    log(`  · ${label}: npm audit の取得をスキップしました（オフラインまたはエラー）`);
    return;
  }

  const vulns = report.vulnerabilities || {};
  const entries = Object.values(vulns);
  // 破壊的変更（isSemVerMajor）を伴わずに修正できる脆弱性だけを抽出
  // （SECURITY.md にある通り、--force は marp-cli を古い版へ巻き戻して壊すため使わない）
  const fixable = entries.filter((v) => v && (v.fixAvailable === true || (typeof v.fixAvailable === 'object' && !v.fixAvailable.isSemVerMajor)));
  const unfixableHigh = entries.filter((v) => v && !fixable.includes(v) && (v.severity === 'high' || v.severity === 'critical'));

  if (fixable.length === 0) {
    log(`  ✔ ${label}: 自動修正可能な脆弱性はありません${unfixableHigh.length ? `（上流 Marp 待ちの既知項目 ${unfixableHigh.length} 件は SECURITY.md 参照）` : ''}`);
    return;
  }

  const names = fixable.map((v) => `${v.name}(${v.severity})`).join(', ');
  if (CHECK_ONLY) {
    log(`  ⚠ ${label}: 修正可能な脆弱性が ${fixable.length} 件あります → ${names}`);
    actions.push(`${label} に修正可能な脆弱性が ${fixable.length} 件あります（${names}）`);
    return;
  }

  log(`  ↻ ${label}: 脆弱性 ${fixable.length} 件（${names}）を npm audit fix で自動修正しています…`);
  const fix = run('npm', ['audit', 'fix', '--no-audit', '--no-fund'], dir);
  if (fix.status === 0) {
    log(`  ✔ ${label}: 脆弱性を自動修正しました（${names}）`);
    actions.push(`${label} の脆弱性（${names}）を npm audit fix で自動修正しました`);
  } else {
    log(`  ✘ ${label}: npm audit fix に失敗しました: ${(fix.stderr || '').trim()}`);
  }
}

function main() {
  // フックモードのときは 24 時間（86,400,000 ms）に 1 回だけ実行して起動を遅くしない
  const stampFile = path.join(ROOT, '.git', 'security-check-last.json');
  if (IS_HOOK && !FORCE_RUN) {
    try {
      const prev = JSON.parse(fs.readFileSync(stampFile, 'utf8'));
      if (prev && prev.at && Date.now() - prev.at < 24 * 60 * 60 * 1000) {
        process.stdout.write('{}\n');
        return;
      }
    } catch { /* 初回は実行 */ }
  }

  log(`\n== Node.js / npm セキュリティ点検・自動更新 ${CHECK_ONLY ? '[点検のみ]' : '[自動修正]'} ==`);
  log(`[1] Node.js 本体 (Homebrew)`);
  checkAndUpgradeNode();

  log(`\n[2] npm パッケージの脆弱性点検 (npm audit)`);
  const targets = [
    { dir: ROOT, label: `${path.basename(ROOT)} (ルート)` },
    { dir: path.join(ROOT, 'tools', 'marp-scroll-sync'), label: `${path.basename(ROOT)} (同期プレビュー拡張)` },
  ];
  // 隣に marp-GUI / marp-share があればそちらも一緒に保護する
  const siblingName = path.basename(ROOT) === 'marp-share' ? 'marp-GUI' : 'marp-share';
  const siblingRoot = path.resolve(ROOT, '..', siblingName);
  if (fs.existsSync(path.join(siblingRoot, 'package.json'))) {
    targets.push(
      { dir: siblingRoot, label: `${siblingName} (ルート)` },
      { dir: path.join(siblingRoot, 'tools', 'marp-scroll-sync'), label: `${siblingName} (同期プレビュー拡張)` },
    );
  }

  for (const t of targets) {
    checkAndFixNpmDir(t.dir, t.label);
  }

  try {
    fs.mkdirSync(path.dirname(stampFile), { recursive: true });
    fs.writeFileSync(stampFile, JSON.stringify({ at: Date.now(), actions }, null, 2));
  } catch { /* ignore */ }

  if (IS_HOOK) {
    if (actions.length > 0) {
      const summary = `🛡️ **Node.js / npm セキュリティ自動更新**:\n` + actions.map((a) => `- ${a}`).join('\n');
      process.stdout.write(JSON.stringify({
        injectSteps: [
          {
            systemMessage: {
              systemMessage: summary,
              metadata: { user_markdown: summary },
            },
          },
        ],
      }) + '\n');
    } else {
      process.stdout.write('{}\n');
    }
    return;
  }

  log(`\n完了しました。\n`);
}

main();
