import { Plugin } from "@opencode/plugin"

type Level = "lite" | "full" | "ultra" | "off"

const DEFAULT_LEVEL: Level = "full"
const STORAGE_KEY = "level"

const RULES: Record<Exclude<Level, "off">, string> = {
  lite: "Respond terse. Short sentences. No filler. Keep articles. Full technical accuracy.",
  full: "Respond terse like smart caveman. Drop articles where clear. Fragments OK. Few tokens. Full technical accuracy.",
  ultra: "Max compression. Abbrev prose, arrows for causality. Fragments OK. Few tokens. Full technical accuracy.",
}

function parseLevel(text: string): Level | undefined {
  const t = (text ?? "").toLowerCase()
  if (/\bultra\b/.test(t)) return "ultra"
  if (/\blite\b/.test(t)) return "lite"
  if (/\bfull\b/.test(t)) return "full"
  if (/\b(off|normal|stop|biasa)\b/.test(t)) return "off"
  return undefined
}

function normalizeLevel(v: unknown): Level {
  return v === "lite" || v === "full" || v === "ultra" || v === "off" ? v : DEFAULT_LEVEL
}

export default Plugin.define({
  id: "caveman",
  async setup(ctx) {
    let level = normalizeLevel(await ctx.storage.get(STORAGE_KEY))

    const inject = (event: { system: { push: (m: { type: "text"; text: string }) => void } }) => {
      if (level === "off") return
      event.system.push({ type: "text", text: RULES[level] })
    }

    // Agent loop + transient calls + compaction summary (survive /compact)
    await ctx.session.hook("context", inject)
    await ctx.session.hook("generate", inject)
    await ctx.session.hook("compaction", inject)

    await ctx.command.transform((editor) => {
      editor.add({
        name: "caveman",
        description: "Set caveman terseness: /caveman [lite|full|ultra|off]",
        execute: async ({ sessionID, prompt }) => {
          const next = parseLevel(prompt.text ?? "")
          if (next) {
            level = next
            if (level === "off") await ctx.storage.remove(STORAGE_KEY)
            else await ctx.storage.set(STORAGE_KEY, level)
            // Synthetic = no model call, no token burn for confirmation
            await ctx.session.synthetic({ sessionID, text: `Caveman mode: ${level}.` })
          } else {
            await ctx.session.synthetic({
              sessionID,
              text: `Caveman: ${level}. /caveman lite|full|ultra|off.`,
            })
          }
        },
      })

      editor.add({
        name: "caveman-commit",
        description: "Terse conventional commit for staged changes",
        execute: async ({ sessionID, prompt, delivery }) => {
          await ctx.session.prompt({
            ...prompt,
            sessionID,
            text: "Generate one conventional commit message for staged changes. Terse. Output only message.",
            delivery,
          })
        },
      })

      editor.add({
        name: "caveman-review",
        description: "Terse review of current diff",
        execute: async ({ sessionID, prompt, delivery }) => {
          await ctx.session.prompt({
            ...prompt,
            sessionID,
            text: "Review current diff tersely. Bugs first, then nits. Few tokens.",
            delivery,
          })
        },
      })
    })
  },
})
