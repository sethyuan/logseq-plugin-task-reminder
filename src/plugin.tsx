import "@logseq/libs"
import { BlockEntity, IDatom } from "@logseq/libs/dist/LSPlugin.user"
import { setup, t } from "logseq-l10n"
import { findAttributeChange, parseContent, parseKeywords } from "./libs/utils"
import zhCN from "./translations/zh-CN.json"

let keywords: string[] = []

const workTimers = new Map<number, TimerData>()
const breakTimers = new Map<number, TimerData>()

async function main() {
  await setup({ builtinTranslations: { "zh-CN": zhCN } })

  // provideStyles()

  logseq.useSettingsSchema([
    {
      key: "workLength",
      type: "number",
      default: 25,
      title: "",
      description: t("Work time in minutes."),
    },
    {
      key: "breakLength",
      type: "number",
      default: 5,
      title: "",
      description: t("Break time in minutes."),
    },
    {
      key: "onByDefault",
      type: "boolean",
      default: false,
      title: "",
      description: t("Whether reminding is on all tasks by default."),
    },
    {
      key: "onIf",
      type: "string",
      default: "",
      title: "",
      description: t(
        "A list of keywords separated by comma, reminding is on for a task if it has any of the keywords.",
      ),
    },
  ])

  const settingsOff = logseq.onSettingsChanged((newSettings) => {
    keywords.length = 0
    keywords.push(...parseKeywords(newSettings))
  })

  keywords = parseKeywords(logseq.settings)

  const transactionOff = logseq.DB.onChanged(onTransaction)

  logseq.beforeunload(async () => {
    settingsOff()
    transactionOff()
  })

  console.log("#task-reminder loaded")
}

// function provideStyles() {
//   logseq.provideStyle({
//     key: "kef-tr",
//     style: `
//     `,
//   })
// }

async function onTransaction({
  blocks,
  txData,
  txMeta,
}: {
  blocks: Array<BlockEntity>
  txData: Array<IDatom>
  txMeta?: {
    outlinerOp: string
    [key: string]: any
  }
}) {
  if (!txMeta || txMeta["undo?"]) return

  if (txMeta.outlinerOp === "saveBlock" && txMeta["transact?"]) {
    const change = findAttributeChange(
      txData,
      "marker",
      ["LATER", "TODO", "DONE", "CANCELED", "WAITING"],
      ["NOW", "DOING"],
    )

    if (!change) return

    const [eid] = change
    const block = blocks.find(({ id }) => id === eid)

    if (block == null) return

    if (
      logseq.settings?.onByDefault ||
      keywords.some((kw) => block.content.includes(kw))
    ) {
      await triggerWorkTimer(eid, block)
    }
  }
}

async function triggerWorkTimer(eid: number, block: BlockEntity) {
  // Stop existing timers.
  const workData = workTimers.get(eid)
  if (workData) {
    clearTimeout(workData.timerHandle)
  }
  const breakData = breakTimers.get(eid)
  if (breakData) {
    clearTimeout(breakData.timerHandle)
    breakTimers.delete(eid)
  }

  const timerHandle = setTimeout(
    () => onWorkTimer(eid),
    3000, //(+logseq.settings?.workLength ?? 25) * 60 * 1000,
  )
  workTimers.set(eid, {
    uuid: block.uuid,
    content: await parseContent(block.content),
    timerHandle,
  })
}

function triggerBreakTimer(eid: number, data: TimerData) {
  const timerHandle = setTimeout(
    () => onBreakTimer(eid),
    3000, //(+logseq.settings?.breakLength ?? 5) * 60 * 1000,
  )
  breakTimers.set(eid, { ...data, timerHandle })
}

async function onWorkTimer(eid: number) {
  const workData = workTimers.get(eid)
  if (!workData) return

  workTimers.delete(eid)

  const block = await logseq.Editor.getBlock(eid)
  if (block == null) return
  if (!["DOING", "NOW"].includes(block.marker)) return

  showNotification(t("Break Time"), workData.content, workData.uuid)

  await changeTaskStatusBackToTodo(block)

  triggerBreakTimer(eid, workData)
}

async function onBreakTimer(eid: number) {
  const breakData = breakTimers.get(eid)
  if (!breakData) return

  breakTimers.delete(eid)

  const block = await logseq.Editor.getBlock(eid)
  if (block == null) return
  if (!["TODO", "LATER"].includes(block.marker)) return

  showNotification(t("Work Time Again"), breakData.content, breakData.uuid)
}

function showNotification(title: string, content: string, uuid: string) {
  const notif = new Notification(title, {
    body: content,
    requireInteraction: true,
  })

  notif.onclick = () => {
    logseq.Editor.openInRightSidebar(uuid)
  }
}

async function changeTaskStatusBackToTodo(block: BlockEntity) {
  const newContent = block.content.replace(/^(DOING|NOW) /, (matched) => {
    switch (matched) {
      case "DOING ":
        return "TODO "
      case "NOW ":
        return "LATER "
      default:
        return "LATER "
    }
  })
  await logseq.Editor.updateBlock(block.uuid, newContent)
}

logseq.ready(main).catch(console.error)
