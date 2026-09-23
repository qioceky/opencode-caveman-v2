# opencode-caveman-v2

Caveman token-compression plugin for **OpenCode V2**. Terse responses, full technical accuracy.

## Install

```sh
# dari GitHub (tanpa npm publish)
opencode plugin add github:qioceky/opencode-caveman-v2

# atau lokal
opencode plugin add file:///path/ke/opencode-caveman-v2
```

Aktif sesi berikutnya. No config required.

## Commands

| Command | Effect |
|---------|--------|
| `/caveman` | Show current level |
| `/caveman lite` | Short, articles kept |
| `/caveman full` | Classic caveman (default) |
| `/caveman ultra` | Max compression |
| `/caveman wenyan[-lite\|-full\|-ultra]` | Classical Chinese |
| `/caveman off` | Normal mode (also: `stop caveman`) |
| `/caveman-commit` | Terse commit message |
| `/caveman-review` | Terse diff review, one finding per line |
| `/caveman-compress <file>` | Shrink markdown memory file, backup `.orig`, zero model calls |
| `/caveman-help` | One-screen reminder |

Natural triggers work too: `talk like caveman` → on, `stop caveman` → off.

## Where tokens are actually saved

Honest, per upstream measurements (JuliusBrussee/caveman):

- **Output terseness** (~8.5% output on coding tasks, JetBrains): free, always on.
- **Title short-circuit**: 1 skipped model call per session.
- **Compact summaries**: ultra-terse bullets keep future context small.
- **`/caveman-compress`**: memory files load every session; smaller file = fewer input tokens forever.
- Big reading-side savings (33% input) need the separate proxy (`caveman opencode`), not a plugin.

Level persists via plugin storage + survives `/compact`.
