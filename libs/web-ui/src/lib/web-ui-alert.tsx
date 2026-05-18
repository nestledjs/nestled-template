import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid'
import React, { ReactNode } from 'react'
import { Link } from 'react-router'

export interface WebUiAlertProps {
  alertType: 'success' | 'info' | 'warning' | 'error'
  title?: string
  message?: string | ReactNode
  messageLink?: string
  messageLinkText?: string
}

export function WebUiAlert(props: Readonly<WebUiAlertProps>) {
  let bgColor, headingColor, textColor, hoverColor
  let icon = null
  switch (props?.alertType) {
    case 'success':
      bgColor = 'bg-green-50'
      headingColor = 'text-green-800'
      textColor = 'text-green-700'
      hoverColor = 'hover:text-green-600'
      icon = <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
      break
    case 'info':
      bgColor = 'bg-blue-50'
      headingColor = 'text-blue-800'
      textColor = 'text-blue-700'
      hoverColor = 'hover:text-blue-600'
      icon = <InformationCircleIcon className="h-5 w-5 text-blue-400" aria-hidden="true" />
      break
    case 'warning':
      bgColor = 'bg-orange-50'
      headingColor = 'text-orange-800'
      textColor = 'text-orange-700'
      hoverColor = 'hover:text-orange-600'
      icon = <ExclamationCircleIcon className="h-5 w-5 text-orange-400" aria-hidden="true" />
      break
    case 'error':
      bgColor = 'bg-red-50'
      headingColor = 'text-red-800'
      textColor = 'text-red-700'
      hoverColor = 'hover:text-red-600'
      icon = <XCircleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
      break
  }

  return (
    <div className={`rounded-md p-4 mb-5 ${bgColor}`}>
      <div className="flex">
        <div className="flex-shrink-0">{icon}</div>
        {props?.title && !props?.message ? (
          <div className="ml-3">
            <h4 className={`text-sm font-medium ${headingColor}`}>{props?.title}</h4>
          </div>
        ) : null}
        {props?.message && props?.title ? (
          <div className="ml-3">
            <h4 className={`text-sm font-medium ${headingColor}`}>{props?.title}</h4>
            <div className={`mt-2 text-sm ${textColor}`}>
              <p>
                {props.message}{' '}
                {props?.messageLink ? (
                  <Link to={props.messageLink}>
                    <span className={`font-medium underline ${textColor} ${hoverColor}`}>
                      {props?.messageLinkText ?? props.messageLink}
                    </span>
                  </Link>
                ) : null}
              </p>
            </div>
          </div>
        ) : null}
        {props?.message && !props?.title ? (
          <div className={`ml-3`}>
            <p className={`text-sm ${textColor}`}>
              {props.message}{' '}
              <a
                href={props?.messageLink}
                className={`font-medium underline ${textColor} ${hoverColor}`}
              >
                {props?.messageLinkText}
              </a>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default WebUiAlert
