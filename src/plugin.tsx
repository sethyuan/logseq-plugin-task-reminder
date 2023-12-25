import "@logseq/libs"
import { BlockEntity, IDatom } from "@logseq/libs/dist/LSPlugin.user"
import { setup, t } from "logseq-l10n"
import { render } from "preact"
import CountDown from "./comps/CountDown"
import {
  findAttributeChange,
  isHTMLElement,
  parseContent,
  parseKeywords,
} from "./libs/utils"
import zhCN from "./translations/zh-CN.json"

let keywords: string[] = []

const workTimers = new Map<number, TimerData>()
const breakTimers = new Map<number, TimerData>()

async function main() {
  await setup({ builtinTranslations: { "zh-CN": zhCN } })

  provideStyles()

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
      key: "loopNum",
      type: "number",
      default: 1,
      title: "",
      description: t("Loop automatically the number of times specified."),
    },
    {
      key: "onByDefault",
      type: "boolean",
      default: false,
      title: "",
      description: t("Whether reminding is on for all tasks by default."),
    },
    {
      key: "onIf",
      type: "string",
      default: "#.remind",
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

  const appContainer = parent.document.getElementById("app-container")!
  const taskObserver = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target as HTMLElement | null
      if (target?.closest(".editor-wrapper")) continue

      for (const node of mutation.addedNodes) {
        if (!isHTMLElement(node)) continue

        const blockEl = node.closest(".ls-block[blockid]")
        renderTimerIfAny(blockEl)

        const blockEls = node.querySelectorAll(".ls-block[blockid]")
        for (const el of blockEls) {
          renderTimerIfAny(el)
        }
      }
    }
  })
  taskObserver.observe(appContainer, { childList: true, subtree: true })

  logseq.beforeunload(async () => {
    taskObserver.disconnect()
    settingsOff()
    transactionOff()
  })

  console.log("#task-reminder loaded")
}

function provideStyles() {
  logseq.provideStyle({
    key: "kef-tr",
    style: `
    .kef-tr-countdown {
      font-size: 0.875em;
      color: var(--ls-active-primary-color);
    }
    `,
  })
}

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

  if (txMeta.outlinerOp === "save-block" && txMeta["transact?"]) {
    const doingChange = findAttributeChange(txData, "marker", ["NOW", "DOING"])

    if (doingChange) {
      const [eid] = doingChange
      const block = blocks.find(({ id }) => id === eid)

      if (block == null) return

      if (
        logseq.settings?.onByDefault ||
        keywords.some((kw) => block.content.includes(kw))
      ) {
        await triggerWorkTimer(eid, block)
        renderTimer(eid, block.uuid)
      }
    } else {
      const todoChange = findAttributeChange(txData, "marker", [
        "LATER",
        "TODO",
        "DONE",
        "CANCELED",
        "CANCELLED",
        "WAITING",
      ])

      if (todoChange) {
        const [eid] = todoChange
        const block = blocks.find(({ id }) => id === eid)

        if (block == null) return

        unrenderTimer(eid, block.uuid)
      }
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

  const now = Date.now()
  const workLenMs = (+logseq.settings?.workLength ?? 25) * 60 * 1000
  const timerHandle = setTimeout(() => onWorkTimer(eid), workLenMs)
  workTimers.set(eid, {
    uuid: block.uuid,
    at: now + workLenMs,
    content: await parseContent(block.content),
    timerHandle,
    loopNum: workData?.loopNum != null ? workData.loopNum + 1 : 1,
  })
}

function triggerBreakTimer(eid: number, data: TimerData) {
  const now = Date.now()
  const breakLenMs = (+logseq.settings?.breakLength ?? 5) * 60 * 1000
  const timerHandle = setTimeout(() => onBreakTimer(eid), breakLenMs)
  breakTimers.set(eid, { ...data, at: now + breakLenMs, timerHandle })
}

async function onWorkTimer(eid: number) {
  const workData = workTimers.get(eid)
  if (!workData) return

  if (workData.loopNum >= logseq.settings?.loopNum) {
    workTimers.delete(eid)
  }

  const block = await logseq.Editor.getBlock(eid)
  if (block == null) return
  if (!["DOING", "NOW"].includes(block.marker)) return

  showNotification(t("Break Time"), workData.content, workData.uuid)

  await changeTaskStatus(block, false)

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

  if (breakData.loopNum < +logseq.settings?.loopNum) {
    await changeTaskStatus(block, true)
  }
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

async function changeTaskStatus(block: BlockEntity, doing: boolean) {
  const newContent = block.content.replace(
    !doing ? /^(DOING|NOW) / : /^(TODO|LATER) /,
    (matched) => {
      if (!doing) {
        switch (matched) {
          case "DOING ":
            return "TODO "
          case "NOW ":
            return "LATER "
          default:
            return "LATER "
        }
      } else {
        switch (matched) {
          case "TODO ":
            return "DOING "
          case "LATER ":
            return "NOW "
          default:
            return "NOW "
        }
      }
    },
  )
  await logseq.Editor.updateBlock(block.uuid, newContent)
}

function renderTimer(eid: number, uuid: string) {
  const data = workTimers.get(eid)
  if (data == null) return

  const key = `countdown-${eid}`
  const path = `.ls-block[blockid="${uuid}"]:not([data-query]) span.inline`

  if (parent.document.querySelector(path) == null) return

  logseq.provideUI({
    key,
    path,
    template: `<span id="${key}"></span>`,
    style: {
      display: "inline",
    },
  })

  setTimeout(() => {
    const root = parent.document.getElementById(key)
    if (root == null) return
    render(<CountDown at={data.at} />, root)
  }, 0)
}

function unrenderTimer(eid: number, uuid: string) {
  const key = `countdown-${eid}`
  const path = `.ls-block[blockid="${uuid}"]:not([data-query]) span.inline`

  logseq.provideUI({
    key,
    path,
    template: "",
    style: {
      display: "inline",
    },
  })
}

async function renderTimerIfAny(blockEl: Element | null) {
  const selfRefs = blockEl?.getAttribute("data-refs-self")

  if (selfRefs == null || !/"(?:now|doing)"/.test(selfRefs)) return

  const block = await logseq.Editor.getBlock(blockEl!.getAttribute("blockid")!)

  if (block == null) return

  const key = `countdown-${block.id}`

  if (parent.document.getElementById(key) != null) return

  const timerData = workTimers.get(block.id)

  if (timerData && timerData.at > Date.now()) {
    renderTimer(block.id, block.uuid)
    return
  }
}

logseq.ready(main).catch(console.error)
