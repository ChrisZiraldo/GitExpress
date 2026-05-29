// ── Structured diff model ────────────────────────────────────────────────

export type DiffLineKind = 'add' | 'del' | 'context' | 'noeol'

export interface DiffLine {
  kind: DiffLineKind
  /** Line number on the OLD (pre-image) side. `null` for `add` and `noeol`. */
  oldNum: number | null
  /** Line number on the NEW (post-image) side. `null` for `del` and `noeol`. */
  newNum: number | null
  /** Raw line content with the leading +/- /space marker stripped. */
  content: string
}

export interface DiffHunk {
  /** Exact `@@ -x,y +x,y @@` header line as it appeared in the diff. */
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export interface DiffFile {
  /** Path resolved from `+++ b/<path>` (or `--- a/<path>` for deletes). */
  path: string
  /** Everything from `diff --git` through the `+++` line (no trailing \n). */
  header: string
  hunks: DiffHunk[]
}

// ── Backward-compat flat hunk view (used by the old DiffViewer) ─────────

export interface ParsedHunk {
  filePath: string
  fileHeader: string
  hunkHeader: string
  hunkBody: string
  patch: string
}

// ── Parser ────────────────────────────────────────────────────────────────

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function nextFileStart(lines: string[], from: number): number {
  for (let k = from; k < lines.length; k++) {
    if (lines[k].startsWith('diff --git')) return k
  }
  return lines.length
}

function nextHunkStart(lines: string[], from: number, end: number): number {
  for (let k = from; k < end; k++) {
    if (lines[k].startsWith('@@')) return k
  }
  return end
}

/**
 * Parse a unified diff (`git diff` or `git diff --cached`) into a hierarchy
 * of files → hunks → lines.  Each `DiffLine` carries the original old/new
 * line numbers so the renderer can show a familiar two-column gutter.
 *
 * Files with no hunks (binary, pure mode/rename) are skipped.
 */
export function parseDiff(text: string): DiffFile[] {
  if (!text) return []
  const lines = text.split('\n')
  const out: DiffFile[] = []
  let i = 0

  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git')) {
      i++
      continue
    }

    const fileStart = i
    const fileEnd = nextFileStart(lines, i + 1)
    const firstHunk = nextHunkStart(lines, i + 1, fileEnd)
    const header = lines.slice(fileStart, firstHunk).join('\n')

    let path = ''
    for (let k = fileStart; k < firstHunk; k++) {
      const ln = lines[k]
      if (ln.startsWith('+++ b/')) {
        path = ln.slice(6)
        break
      }
      if (ln.startsWith('+++ ') && ln !== '+++ /dev/null') {
        path = ln.slice(4)
        break
      }
    }
    if (!path) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(lines[fileStart])
      if (m) path = m[2]
    }

    const hunks: DiffHunk[] = []
    let h = firstHunk
    while (h < fileEnd) {
      const headerLine = lines[h]
      if (!headerLine.startsWith('@@')) {
        h++
        continue
      }
      const m = HUNK_RE.exec(headerLine)
      const oldStart = m ? parseInt(m[1], 10) : 0
      const oldCount = m && m[2] != null ? parseInt(m[2], 10) : 1
      const newStart = m ? parseInt(m[3], 10) : 0
      const newCount = m && m[4] != null ? parseInt(m[4], 10) : 1

      const bodyEnd = nextHunkStart(lines, h + 1, fileEnd)
      const entries: DiffLine[] = []
      let curOld = oldStart
      let curNew = newStart

      for (let k = h + 1; k < bodyEnd; k++) {
        const raw = lines[k]
        // Trailing empty line produced by split('\n') on a string ending in \n.
        if (k === bodyEnd - 1 && raw === '' && bodyEnd === lines.length) break

        if (raw.startsWith('\\ ')) {
          entries.push({ kind: 'noeol', oldNum: null, newNum: null, content: raw.slice(2) })
          continue
        }

        const marker = raw.charAt(0)
        const content = raw.slice(1)
        if (marker === '+') {
          entries.push({ kind: 'add', oldNum: null, newNum: curNew, content })
          curNew++
        } else if (marker === '-') {
          entries.push({ kind: 'del', oldNum: curOld, newNum: null, content })
          curOld++
        } else if (marker === ' ' || marker === '') {
          entries.push({ kind: 'context', oldNum: curOld, newNum: curNew, content })
          curOld++
          curNew++
        }
        // Any other prefix is unknown patch noise — skip silently.
      }

      hunks.push({
        header: headerLine,
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: entries
      })
      h = bodyEnd
    }

    if (path || hunks.length > 0) {
      out.push({ path, header, hunks })
    }
    i = fileEnd
  }
  return out
}

/** Legacy flat-hunk view, kept for the smoke test and any external callers. */
export function parseDiffHunks(diff: string): ParsedHunk[] {
  const files = parseDiff(diff)
  const out: ParsedHunk[] = []
  for (const f of files) {
    for (const h of f.hunks) {
      const body = serializeHunk(h)
      out.push({
        filePath: f.path,
        fileHeader: f.header,
        hunkHeader: h.header,
        hunkBody: body,
        patch: f.header + '\n' + body + '\n'
      })
    }
  }
  return out
}

// ── Serializers ──────────────────────────────────────────────────────────

function serializeLine(line: DiffLine): string {
  if (line.kind === 'noeol') return '\\ ' + line.content
  const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
  return marker + line.content
}

/** Serialize a hunk back to its `@@ … @@\n<body>` form (no trailing \n). */
export function serializeHunk(hunk: DiffHunk): string {
  return hunk.header + '\n' + hunk.lines.map(serializeLine).join('\n')
}

/** Full single-hunk patch ready for `git apply`. */
export function buildHunkPatch(file: DiffFile, hunkIndex: number): string {
  const hunk = file.hunks[hunkIndex]
  if (!hunk) return ''
  return file.header + '\n' + serializeHunk(hunk) + '\n'
}

// ── Line-subset patch builder ────────────────────────────────────────────

/**
 * Selection keys are strings of the form `"<hunkIndex>:<lineIndex>"` (the
 * `lineIndex` is the index into `hunk.lines`).
 */
export interface LineSubsetResult {
  /** Patch text ready for `git apply` (empty string when nothing meaningful). */
  patch: string
  /** Total +/- lines that ended up in the patch. */
  changeCount: number
}

/**
 * Direction the resulting patch will be applied:
 *  - 'forward': stage selected unstaged lines (`git apply --cached`) — the
 *    patch's PRE-image must match the index, so unselected `-` are promoted
 *    to context (kept in the index) and unselected `+` are dropped.
 *  - 'reverse': discard selected unstaged lines (`git apply --reverse`) or
 *    unstage staged lines (`git apply --cached --reverse`) — the patch's
 *    POST-image must match the worktree/index, so unselected `+` are promoted
 *    to context (kept where they are) and unselected `-` are dropped.
 */
export type SubsetMode = 'forward' | 'reverse'

/**
 * Build a multi-hunk patch from a subset of change lines.
 *
 * `git diff` groups all `-` lines first and all `+` lines after them.  We
 * treat each contiguous `-…+…` run as a CHANGE BLOCK and pair `-`/`+` lines
 * positionally by their index within the block.  Inside a pair we emit the
 * kept lines as interleaved `-, +` so the +-line lands in the right
 * post-image position (immediately after its paired `-`, not after a trailing
 * context line).
 *
 * Each line's trailing `\ No newline at end of file` marker, if any, is
 * carried along with the line it qualifies (or dropped along with it).
 *
 * Hunks with no remaining change lines are omitted.  Hunk `@@` counts are
 * recomputed; we still pass `--recount` to `git apply` so any rounding
 * mismatch is tolerated.
 */
export function buildLineSubsetPatch(
  file: DiffFile,
  selected: Set<string>,
  mode: SubsetMode = 'forward'
): LineSubsetResult {
  const subHunks: string[] = []
  let totalChange = 0

  for (let hi = 0; hi < file.hunks.length; hi++) {
    const hunk = file.hunks[hi]
    const out: DiffLine[] = []
    let hunkChangeCount = 0

    let i = 0
    while (i < hunk.lines.length) {
      const ln = hunk.lines[i]

      if (ln.kind === 'context') {
        out.push(ln)
        i++
        continue
      }

      if (ln.kind === 'noeol') {
        const last = out[out.length - 1]
        if (last && last.kind !== 'noeol') out.push(ln)
        i++
        continue
      }

      // Collect the change block: run of `-` lines, then run of `+` lines.
      const minus: { ln: DiffLine; idx: number; noeol?: DiffLine }[] = []
      const plus: { ln: DiffLine; idx: number; noeol?: DiffLine }[] = []

      while (i < hunk.lines.length && hunk.lines[i].kind === 'del') {
        const entry: { ln: DiffLine; idx: number; noeol?: DiffLine } = {
          ln: hunk.lines[i],
          idx: i
        }
        i++
        if (i < hunk.lines.length && hunk.lines[i].kind === 'noeol') {
          entry.noeol = hunk.lines[i]
          i++
        }
        minus.push(entry)
      }
      while (i < hunk.lines.length && hunk.lines[i].kind === 'add') {
        const entry: { ln: DiffLine; idx: number; noeol?: DiffLine } = {
          ln: hunk.lines[i],
          idx: i
        }
        i++
        if (i < hunk.lines.length && hunk.lines[i].kind === 'noeol') {
          entry.noeol = hunk.lines[i]
          i++
        }
        plus.push(entry)
      }

      const n = Math.max(minus.length, plus.length)
      for (let k = 0; k < n; k++) {
        const m = minus[k]
        const p = plus[k]
        const mSel = m ? selected.has(`${hi}:${m.idx}`) : false
        const pSel = p ? selected.has(`${hi}:${p.idx}`) : false

        if (m) {
          if (mSel) {
            out.push(m.ln)
            if (m.noeol) out.push(m.noeol)
            hunkChangeCount++
          } else if (mode === 'forward') {
            // Stage: unselected `-` must remain in the index → context.
            out.push({
              kind: 'context',
              oldNum: m.ln.oldNum,
              newNum: m.ln.oldNum,
              content: m.ln.content
            })
            if (m.noeol) out.push(m.noeol)
          }
          // mode === 'reverse' + unselected `-`: drop entirely.
        }
        if (p) {
          if (pSel) {
            out.push(p.ln)
            if (p.noeol) out.push(p.noeol)
            hunkChangeCount++
          } else if (mode === 'reverse') {
            // Discard/Unstage: unselected `+` stays where it is → context.
            out.push({
              kind: 'context',
              oldNum: p.ln.newNum,
              newNum: p.ln.newNum,
              content: p.ln.content
            })
            if (p.noeol) out.push(p.noeol)
          }
          // mode === 'forward' + unselected `+`: drop entirely.
        }
      }
    }

    if (hunkChangeCount === 0) continue

    let oldCount = 0
    let newCount = 0
    for (const ln of out) {
      if (ln.kind === 'noeol') continue
      if (ln.kind === 'context' || ln.kind === 'del') oldCount++
      if (ln.kind === 'context' || ln.kind === 'add') newCount++
    }

    const headerLine = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`
    const body = out.map(serializeLine).join('\n')
    subHunks.push(headerLine + '\n' + body)
    totalChange += hunkChangeCount
  }

  if (subHunks.length === 0) return { patch: '', changeCount: 0 }
  return {
    patch: file.header + '\n' + subHunks.join('\n') + '\n',
    changeCount: totalChange
  }
}
