declare global {
  type Settings =
    | {
        [key: string]: any
      }
    | undefined

  interface TimerData {
    uuid: string
    content: string
    timerHandle: any
  }
}

export {}
