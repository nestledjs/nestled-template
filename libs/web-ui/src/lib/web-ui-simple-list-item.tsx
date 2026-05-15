import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { ReactNode } from 'react'
import { cn } from '@nestled-template/shared/utils'

export interface WebUiSimpleListItemProps {
  type?: 'li' | 'div'
  onClick?: () => void
  lineOne?: string
  lineTwo?: string
  avatar?: ReactNode
  avatar2?: ReactNode
  selected?: boolean
}

function InnerList(props: WebUiSimpleListItemProps): ReactNode {
  return (
    <div className="flex items-center justify-between w-full gap-x-4">
      <div className="flex items-center gap-x-4 flex-grow">
        {props?.avatar ? <div className="hidden sm:block flex-shrink-0">{props.avatar}</div> : null}
        {props?.avatar2 ? (
          <div className="hidden sm:block flex-shrink-0">{props.avatar2}</div>
        ) : null}

        <div className="w-0 flex-grow">
          {props?.lineOne ? (
            <p className="text-xs sm:text-lg font-semibold leading-6 text-gray-900 ">
              {props.lineOne}
            </p>
          ) : null}
          {props?.lineTwo ? (
            <p className="mt-1 text-xs sm:text-sm leading-5 text-gray-500 ">{props.lineTwo}</p>
          ) : null}
        </div>
      </div>

      {props?.onClick ? (
        <div className="hidden sm:block flex-shrink-0">
          <ChevronRightIcon className="w-8 h-8 text-zinc-400" data-testid="chevron-icon" />
        </div>
      ) : null}
    </div>
  )
}
export function WebUiSimpleListItem(props: WebUiSimpleListItemProps) {
  const globalClasses = 'flex items-center justify-between gap-x-6 py-5 rounded-lg px-6 max-w-full'
  const selectedClasses = props?.selected ? 'bg-sky-100' : 'bg-white'
  return props?.type === 'div' ? (
    <div
      className={cn(globalClasses, selectedClasses, 'border-2 border-zinc-100')}
      onClick={props?.onClick}
    >
      <InnerList {...props} />
    </div>
  ) : (
    <li
      className={cn(globalClasses, selectedClasses, 'border-2 border-zinc-100')}
      onClick={props?.onClick}
    >
      <InnerList {...props} />
    </li>
  )
}
