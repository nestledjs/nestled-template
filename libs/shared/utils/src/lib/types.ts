import { ForwardRefExoticComponent, SVGProps } from 'react'

export interface NavigationInterface {
  name: string
  href: string
  icon: ForwardRefExoticComponent<SVGProps<SVGSVGElement> & { title?: string; titleId?: string }>
  current: boolean
}
