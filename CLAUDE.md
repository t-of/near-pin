# NEAR PIN

T.OF... のアプリ。https://t-of.github.io/near-pin/

- ルールは本部の `~/GitHub/tof/t-of.github.io/RULES.md` に従う（全アプリ共通）。ブランドは `docs/BRAND.md`。
- 直したら本部で `npm run audit:browser -- near-pin` を通す。
- 公開は本部の `docs/RELEASE.md` の手順。大きな作業は本部で Claude を起動すると、役割を分けて進められる。
- localStorage のキーは `near-pin.` で始める。SW のキャッシュ名は `near-pin-` で始める。
