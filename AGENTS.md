# Marp スライド作成ルール（Antigravity / AI エージェント向け）

## 推奨テーマ（既定テーマ）

新しい Marp スライドデックを作成する際、またはテーマの指定がない場合は、**`tsutawaru-simple`** を推奨（既定）テーマとして使用してください。

```yaml
---
marp: true
theme: tsutawaru-simple
paginate: true
size: 16:9
lang: ja
footer: ''
---
```

## 利用可能なテーマ一覧（`theme/*.css`）

| テーマ名（`theme:`） | ファイル | 特徴・用途 |
|---|---|---|
| **`tsutawaru-simple`**（**推奨**） | `theme/tsutawaru-simple.css` | ヘッダー帯のない、白地＋細い斜線の帯のシンプルで読みやすいテーマ。配置クラス（`lay-*`）と部品（`.takeaway` 等）をすべて利用可能。帯の位置（既定＝左細帯 / `band-top` / `band-wide` / `band-none`）や色（`blue` / `red` / `yellow` / `green` / `gray` / `teal` / `garnet`）を `_class` で切り替え可能。 |
| `tsutawaru-simple-cud` | `theme/tsutawaru-simple-cud.css` | `tsutawaru-simple` の配色をカラーユニバーサルデザイン（色覚の多様性に配慮した配色）に替えた版。 |
| `tsutawaru-academic` | `theme/tsutawaru-academic.css` | 上部ヘッダー帯＋ロゴ付きの学術発表枠組みに、『伝わるデザインの基本』準拠の本文組版・配置クラス（`lay-*`）・部品を組み合わせたテーマ。 |
| `tsutawaru-video-soft` | `theme/tsutawaru-video-soft.css` | オンデマンド講義・動画用（`tsutawaru-video` 基底、丸と角丸の A 案）。大きな文字と右下ワイプ枠つき。 |
| `tsutawaru-video-edit` | `theme/tsutawaru-video-edit.css` | オンデマンド講義・動画用（`tsutawaru-video` 基底、余白と罫の B 案）。 |
| `tsutawaru-video` | `theme/tsutawaru-video.css` | オンデマンド動画用の土台テーマ（通常は派生テーマの `tsutawaru-video-soft` または `tsutawaru-video-edit` を使用）。 |
| `academic` | `theme/academic.css` | 上部ヘッダー帯＋ロゴ付きの基底テーマ。 |
| `ponchie` | `theme/ponchie.css` | 1枚で全体像を見せるポンチ絵・概要図用テーマ。 |
