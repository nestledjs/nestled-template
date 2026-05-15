import React, { useState } from 'react'
import { Maybe } from '@nestled-template/shared/sdk'

interface EditableTextProps {
  text: Maybe<string> | undefined
  onSave?: (text: Maybe<string> | undefined) => void
  multiline?: boolean
  defaultText?: string
  highlight?: boolean
}

export function WebUiEditableText({
  text,
  onSave,
  multiline = false,
  defaultText = 'Click to edit',
}: Readonly<EditableTextProps>) {
  const [isEditing, setIsEditing] = useState(false)
  const [currentText, setCurrentText] = useState(text)

  const isTextEmpty = (text: string) => {
    return !text || !text.trim().replace(/\n/g, '')
  }

  const handleSave = async () => {
    try {
      if (onSave) {
        onSave(currentText?.trim() ?? '')
      }
      setIsEditing(false)
    } catch (error) {
      console.error('Error updating text:', error)
    }
  }

  return (
    <div>
      {isEditing ? (
        multiline ? (
          <>
            <textarea
              value={currentText ?? ''}
              onChange={e => setCurrentText(e.target.value)}
              onBlur={handleSave}
              autoFocus
              rows={4}
              className={'w-full'}
              style={{ paddingRight: '24px' }}
            />
            <span className={'text-sky-600'}>Save</span>
          </>
        ) : (
          <>
            <input
              type="text"
              value={currentText ?? defaultText}
              onChange={e => setCurrentText(e.target.value)}
              onBlur={handleSave}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleSave().catch(console.error)
                }
              }}
              autoFocus
            />
            Save
          </>
        )
      ) : (
        <p
          className={`cursor-pointer ${isTextEmpty(currentText ?? '') ? 'bg-amber-200 p-2' : ''}`}
          onClick={() => setIsEditing(true)}
        >
          {isTextEmpty(currentText ?? '') ? defaultText : currentText}
        </p>
      )}
    </div>
  )
}
