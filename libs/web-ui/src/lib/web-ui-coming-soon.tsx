import { cn } from '@nestled-template/shared/utils'

interface WebUiComingSoonProps {
  readonly fullScreen?: boolean
}
export function WebUiComingSoon({ fullScreen = true }: WebUiComingSoonProps) {
  return (
    <div
      className={cn(
        ' flex flex-col items-center justify-center',
        fullScreen ? 'h-[calc(100vh-20rem)] w-screen' : 'h-fit w-full',
      )}
    >
      <p className={'text-4xl'}>More Content</p>
      <p className="text-6xl">Coming Soon</p>
    </div>
  )
}
