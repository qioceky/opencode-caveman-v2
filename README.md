# opencode-caveman-v2

Caveman token-compression plugin for **OpenCode V2**. Terse responses, full technical accuracy.

## Install

```sh
# dari GitHub (tanpa npm publish)
opencode plugin add github:USERNAME/opencode-caveman-v2

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
| `/caveman off` | Normal mode |
| `/caveman-commit` | Terse commit message |
| `/caveman-review` | Terse diff review |

Level persists via plugin storage + survives `/compact` (compaction hook).
