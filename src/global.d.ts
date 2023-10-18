declare global {
  type Settings =
    | {
        [key: string]: any
      }
    | undefined

  interface TimerData {
    uuid: string
    at: number
    content: string
    timerHandle: any
    loopNum: number
  }
}

export {}
