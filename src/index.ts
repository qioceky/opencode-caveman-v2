import { Plugin } from "@opencode/plugin"
import { copyFile, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"

type Level = "lite" | "full" | "ultra" | "wenyan-lite" | "wenyan-full" | "wenyan-ultra" | "off"

const DEFAULT_LEVEL: Level = "full"
const STORAGE_KEY = "level"

const RULES: Record<Exclude<Level, "off">, string> = {
  lite: "Respond terse. Short sentences. No filler. Keep articles. Full technical accuracy.",
  full: "Respond terse like smart caveman. Drop articles where clear. Fragments OK. Few tokens. Full technical accuracy. Never shorten code, error messages, file paths, or security warnings.",
  ultra: "Max compression. Abbrev prose, arrows for causality. Fragments OK. Few tokens. Full technical accuracy. Never shorten code, error messages, file paths, or security warnings.",
  "wenyan-lite": "以淺近文言作答，簡潔完整，保留虛詞，技術準確。",
  "wenyan-full": "以文言作答，言簡意賅，省虛詞，存句讀。技術準確。代码、報錯、路徑、安全警示一字不改。",
  "wenyan-ultra": "以極簡文言作答，句式殘缺可也，義不可失。代码、報錯、路徑一字不改。",
}

export function parseLevel(text: string): Level | undefined {
  const t = (text ?? "").toLowerCase()
  if (/\bwenyan-ultra\b/.test(t)) return "wenyan-ultra"
  if (/\bwenyan-lite\b/.test(t)) return "wenyan-lite"
  if (/\bwenyan-full\b|\bwenyan\b/.test(t)) return "wenyan-full"
  if (/\bultra\b/.test(t)) return "ultra"
  if (/\blite\b/.test(t)) return "lite"
  if (/\bfull\b/.test(t)) return "full"
  if (/\b(off|normal|stop|biasa)\b/.test(t)) return "off"
  return undefined
}

function detectTrigger(text: string): Level | undefined {
  const t = (text ?? "").toLowerCase()
  if (/\bstop caveman\b|\bnormal mode\b|\bcaveman off\b/.test(t)) return "off"
  if (/\btalk like caveman\b|\bcaveman mode\b|\bspeak like caveman\b/.test(t)) return "full"
  return undefined
}

function normalizeLevel(v: unknown): Level {
  return typeof v === "string" &&
    ["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra", "off"].includes(v)
    ? (v as Level)
    : DEFAULT_LEVEL
}

function firstUserText(messages: any[]): string {
  for (const m of messages ?? []) {
    if (m?.role !== "user") continue
    const c = m?.content
    if (typeof c === "string" && c.trim()) return c.trim()
    if (Array.isArray(c)) {
      const t = c
        .map((p) => (typeof p === "string" ? p : (p?.text ?? "")))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      if (t) return t
    }
  }
  return ""
}

export function terseTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim()
  if (!oneLine) return "caveman session"
  return oneLine.length > 42 ? oneLine.slice(0, 42).trimEnd() + "…" : oneLine
}

// Deterministic markdown shrink: zero model calls. Keeps headings, code,
// paths, URLs, commands. Collapses filler whitespace + stock phrases.
const FILLER_RE =
  /\b(please note that|it is worth noting that|in other words|as mentioned (above|before|earlier)|needless to say|at the end of the day|due to the fact that|in order to|for all intents and purposes)\b/gi

export function compressMarkdown(src: string): string {
  const out: string[] = []
  let inFence = false
  let blanks = 0
  for (const raw of src.split("\n")) {
    const line = raw.replace(/[ \t]+$/g, "")
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      out.push(line)
      blanks = 0
      continue
    }
    if (inFence || /^\s*(#{1,6}\s|>|\s*[-*+]\s|\s*\d+\.\s|\s*\|)/.test(line)) {
      out.push(line)
      blanks = line.trim() === "" ? blanks + 1 : 0
      continue
    }
    if (line.trim() === "") {
      blanks++
      if (blanks <= 1) out.push("")
      continue
    }
    blanks = 0
    out.push(line.replace(FILLER_RE, "").replace(/[ \t]{2,}/g, " ").trimEnd())
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n"
}

function stripCommand(text: string, name: string): string {
  return (text ?? "").replace(new RegExp(`^\\s*/?${name}\\b`, "i"), "").trim()
}

async function sessionDir(ctx: any, sessionID: string): Promise<string> {
  try {
    const info = (await ctx.session.get({ sessionID })) as any
    return info?.directory ?? info?.project?.directory ?? process.cwd()
  } catch {
    return process.cwd()
  }
}

export default Plugin.define({
  id: "caveman",
  async setup(ctx) {
    let level = normalizeLevel(await ctx.storage.get(STORAGE_KEY))

    const inject = (event: { system: { push: (m: { type: "text"; text: string }) => void } }) => {
      if (level === "off") return
      event.system.push({ type: "text", text: RULES[level as Exclude<Level, "off">] })
    }

    // Natural-language triggers, no model call burned.
    await ctx.session.hook("prompt", async (event: any) => {
      const next = detectTrigger(event?.prompt?.text ?? "")
      if (!next) return
      level = next
      if (level === "off") await ctx.storage.remove(STORAGE_KEY)
      else await ctx.storage.set(STORAGE_KEY, level)
      event.prompt.text = `[caveman:${level}]`
    })

    await ctx.session.hook("context", inject)
    await ctx.session.hook("generate", inject)

    // Compaction: keep summary ultra-compact so future context stays small.
    await ctx.session.hook("compaction", (event: any) => {
      if (level === "off") return
      event.system.push({ type: "text", text: RULES[level as Exclude<Level, "off">] })
      event.system.push({
        type: "text",
        text: "Summarize ultra-tersely: bullets only. Keep decisions, file paths, commands, open tasks. Drop prose.",
      })
    })

    // Title: short-circuit, skips one model call per session.
    await ctx.session.hook("title", (event: any) => {
      if (level === "off") return
      event.result = terseTitle(firstUserText(event?.messages))
    })

    await ctx.command.transform((editor) => {
      editor.add({
        name: "caveman",
        description: "Set caveman level: /caveman [lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra|off]",
        execute: async ({ sessionID, prompt }) => {
          const next = parseLevel(prompt.text ?? "")
          if (next) {
            level = next
            if (level === "off") await ctx.storage.remove(STORAGE_KEY)
            else await ctx.storage.set(STORAGE_KEY, level)
            await ctx.session.synthetic({ sessionID, text: `Caveman mode: ${level}.` })
          } else {
            await ctx.session.synthetic({
              sessionID,
              text: `Caveman: ${level}. Levels: lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra|off.`,
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
            text: "Review current diff tersely. One finding per line: L42: issue. Fix. Bugs first.",
            delivery,
          })
        },
      })

      editor.add({
        name: "caveman-compress",
        description: "Shrink a markdown memory file deterministically (backup .orig, zero model calls): /caveman-compress <file>",
        execute: async ({ sessionID, prompt }) => {
          try {
            const arg = stripCommand(prompt.text ?? "", "caveman-compress") || stripCommand(prompt.text ?? "", "caveman:compress")
            const attached = ((prompt as any)?.files ?? [])
              .map((f: any) => String(f?.uri ?? f?.path ?? ""))
              .filter((u: string) => u.startsWith("file://"))
              .map((u: string) => decodeURIComponent(u.slice("file://".length)))
            let target = attached[0]
            if (!target && arg) target = isAbsolute(arg) ? arg : resolve(await sessionDir(ctx, sessionID), arg)
            if (!target) {
              await ctx.session.synthetic({ sessionID, text: "Usage: /caveman-compress <file>. Attach file or give path." })
              return
            }
            const before = await readFile(target, "utf8")
            const after = compressMarkdown(before)
            await copyFile(target, target + ".orig")
            await writeFile(target, after, "utf8")
            const pct = before.length ? Math.round((1 - after.length / before.length) * 100) : 0
            await ctx.session.synthetic({
              sessionID,
              text: `Compressed ${target}: ${before.length}→${after.length} chars (${pct}%). Backup: ${target}.orig`,
            })
          } catch (err) {
            await ctx.session.synthetic({
              sessionID,
              text: `Compress failed: ${err instanceof Error ? err.message : err}`,
            })
          }
        },
      })

      editor.add({
        name: "caveman-help",
        description: "One-screen caveman modes and commands",
        execute: async ({ sessionID }) => {
          await ctx.session.synthetic({
            sessionID,
            text: "Caveman: lite|full|ultra|wenyan-…|off. /caveman-commit /caveman-review /caveman-compress <file>. Say `stop caveman` for normal.",
          })
        },
      })
    })
  },
})
