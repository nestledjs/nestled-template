import { CorePaging } from '@nestled-template/shared/sdk'

export function toCount(p: CorePaging | null) {
  if ((p?.take ?? 0) + (p?.skip ?? 0) > (p?.count ?? 0)) return p?.count
  return (p?.take ?? 0) + (p?.skip ?? 0)
}
