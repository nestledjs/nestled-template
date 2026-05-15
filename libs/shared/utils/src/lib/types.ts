import { ForwardRefExoticComponent, SVGProps } from 'react'

export interface NavigationInterface {
  name: string
  href: string
  icon: ForwardRefExoticComponent<
    SVGProps<SVGSVGElement> & { title?: string | undefined; titleId?: string | undefined }
  >
  current: boolean
}
