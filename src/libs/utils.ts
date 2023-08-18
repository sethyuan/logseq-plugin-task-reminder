import { IDatom } from "@logseq/libs/dist/LSPlugin.user"

const TASK_REGEX = /^(?:TODO|LATER|DOING|NOW|DONE|CANCELED|WAITING) /

export function findAttributeChange<T>(
  txData: IDatom[],
  attribute: string,
  from: T[],
  to: T[],
): [number, T, T] | null {
  let foundFrom: T | undefined
  let foundTo: T | undefined
  let foundEid: number | undefined

  for (const [eid, attr, val, , added] of txData) {
    if (attr === attribute && from.includes(val) && !added) {
      foundFrom = val
      foundEid = eid
      continue
    }
    if (
      foundFrom &&
      eid === foundEid &&
      attr === attribute &&
      to.includes(val) &&
      added
    ) {
      foundTo = val
      break
    }
  }

  if (foundFrom && foundTo) {
    return [foundEid!, foundFrom, foundTo]
  }

  return null
}

export function parseKeywords(settings: Settings) {
  const keywordsStr = settings?.onIf as string

  if (!keywordsStr) return []

  return keywordsStr.split(/[,，]/).map((kw) => kw.toLowerCase().trim())
}

export async function parseContent(content: string) {
  // Remove task markers.
  content = content.replace(TASK_REGEX, "")

  // Remove properties.
  content = content.replace(/\b[^:\n]+:: [^\n]+/g, "")

  // Replace block refs with their content.
  let match
  while ((match = /\(\(([^\)]+)\)\)/g.exec(content)) != null) {
    const start = match.index
    const end = start + match[0].length
    const refUUID = match[1]
    const refBlock = await logseq.Editor.getBlock(refUUID)
    if (refBlock == null) break
    const refContent = await parseContent(refBlock.content)
    content = `${content.substring(0, start)}${refContent}${content.substring(
      end,
    )}`
  }

  return content
}
