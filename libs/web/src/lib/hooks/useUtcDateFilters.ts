import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

export function useUtcDateFilters() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const buildFilters = useCallback(() => {
    const filters: Record<string, any> = {}
    if (startDate || endDate) {
      filters.createdAt = {}
      if (startDate) filters.createdAt.gte = dayjs.utc(startDate).toDate()
      if (endDate) filters.createdAt.lte = dayjs.utc(endDate).endOf('day').toDate()
    }
    return Object.keys(filters).length ? filters : undefined
  }, [startDate, endDate])

  const chips = {
    startLabel: startDate ? dayjs.utc(startDate).format('MM.DD.YYYY') : '',
    endLabel: endDate ? dayjs.utc(endDate).format('MM.DD.YYYY') : '',
  }

  return { startDate, endDate, setStartDate, setEndDate, buildFilters, chips }
}
