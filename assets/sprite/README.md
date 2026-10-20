# Sprite 素材来源

## 当前使用：gwen-sheet.png（Chibi 格温 · 水晶玫瑰）

- 来源：腾讯 CDN `game.gtimg.cn/images/lol/SummonerEmotes/TFT/`
- ⚠️ **Riot Games 版权素材**（小小格温 / Chibi Gwen，非 CC0）。用户已知情并拍板使用，
  违背 spec §8 的 CC0 约定——公开仓库有版权风险，仅供个人练手。
- 3 帧（256×256，水平 768×256）：剪刀手势 / 搭车 / 爱心手（Crystal Rose 皮肤）。
- 帧映射（`main.ts` 里 `imageSheet(gwenImage, 256, 256, 3, ...)`，idle/run/jump 都指向这 3 帧循环）。

## 备选：hero.png（Kenney · CC0）

- 来源：Kenney「Pixel Platformer」主角（https://kenney.nl/assets/pixel-platformer）
- 授权：CC0 1.0（公有领域，可商用，无需署名）
- 处理：27 个 24×24 tile 中取主角 9 帧，4x 放大至 96×96/帧，合成 864×96 水平条。
- 帧映射：0 idle / 1-3 walk / 4 jump / 5 fall / 6 duck / 7 climb / 8 hurt。

> 蓝发「原皮」格温的 2D 素材腾讯 CDN 未公开；要原皮只能走 3D 渲染（见 lolping-assistant 记忆）。
