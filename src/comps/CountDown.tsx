import { useEffect, useState } from "preact/hooks"
import { useTimers } from "reactutils"
import { formatTimeInterval } from "../libs/utils"

type Props = {
  at: number
}

export default function CountDown({ at }: Props) {
  const [timeInterval, setTimeInterval] = useState(() => at - Date.now())
  const { setInterval, clearInterval } = useTimers()

  useEffect(() => {
    const timer = setInterval(() => {
      const val = at - Date.now()
      setTimeInterval(val)
      if (val <= 0) {
        clearInterval(timer)
      }
    }, 1000)
  }, [])

  return timeInterval > 0 ? (
    <span class="kef-tr-countdown"> ⏲️ {formatTimeInterval(timeInterval)}</span>
  ) : null
}
