import { IDatom } from "@logseq/libs/dist/LSPlugin.user"

const TASK_REGEX = /^(?:TODO|LATER|DOING|NOW|DONE|CANCELED|WAITING) /

export function findAttributeChange<T>(
  txData: IDatom[],
  attribute: string,
  to: T[],
): [number, T | undefined, T] | null {
  let foundFrom: T | undefined
  let foundTo: T | undefined
  let foundEid: number | undefined

  for (const [eid, attr, val, , added] of txData) {
    if (attr === attribute && !added) {
      foundFrom = val
      continue
    }
    if (attr === attribute && to.includes(val) && added) {
      foundEid = eid
      foundTo = val
      break
    }
  }

  if (foundTo) {
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
  content = content.replace(/^.+:: .+$/gm, "")

  // Remove logbook
  content = content.replace(/:LOGBOOK:(.|\n)+:END:/g, "")

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

export function formatTimeInterval(diff: number) {
  const seconds = ~~(diff / 1000)
  const mins = ~~(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`
}

export function isHTMLElement(node: any): node is HTMLElement {
  return node.querySelector != null
}
