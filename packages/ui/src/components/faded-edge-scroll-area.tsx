"use client"

import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"

type FadedEdgeElement = "aside" | "div" | "nav" | "section"

type FadedEdgeScrollAreaProps = React.ComponentPropsWithoutRef<"div"> & {
  as?: FadedEdgeElement
  disabled?: boolean
  edgeSize?: number
}

function FadedEdgeScrollArea({
  as: Component = "div",
  children,
  className,
  disabled = false,
  edgeSize = 32,
  onScroll,
  style,
  ...props
}: FadedEdgeScrollAreaProps) {
  const scrollAreaRef = React.useRef<HTMLElement | null>(null)
  const [overflow, setOverflow] = React.useState({
    start: false,
    end: false,
  })

  const updateOverflow = React.useCallback(() => {
    const scrollArea = scrollAreaRef.current

    if (!scrollArea) {
      return
    }

    const maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight
    const nextOverflow = {
      start: scrollArea.scrollTop > 1,
      end: scrollArea.scrollTop < maxScrollTop - 1,
    }

    setOverflow((current) =>
      current.start === nextOverflow.start && current.end === nextOverflow.end
        ? current
        : nextOverflow
    )
  }, [])

  React.useEffect(() => {
    updateOverflow()
  })

  React.useEffect(() => {
    const scrollArea = scrollAreaRef.current

    if (!scrollArea) {
      return
    }

    updateOverflow()

    const resizeObserver = new ResizeObserver(updateOverflow)
    resizeObserver.observe(scrollArea)

    for (const child of scrollArea.children) {
      resizeObserver.observe(child)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [updateOverflow])

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      updateOverflow()
      onScroll?.(event)
    },
    [onScroll, updateOverflow]
  )

  const startSize = !disabled && overflow.start ? `${edgeSize}px` : "0px"
  const endSize = !disabled && overflow.end ? `${edgeSize}px` : "0px"
  const maskImage = disabled
    ? undefined
    : "linear-gradient(to bottom, transparent 0, black var(--faded-edge-start-size), black calc(100% - var(--faded-edge-end-size)), transparent 100%)"

  return (
    <Component
      className={cn("overflow-y-auto", className)}
      data-overflow-y-end={overflow.end ? "" : undefined}
      data-overflow-y-start={overflow.start ? "" : undefined}
      data-slot="faded-edge-scroll-area"
      onScroll={handleScroll}
      ref={scrollAreaRef as React.Ref<HTMLDivElement>}
      style={
        {
          "--faded-edge-start-size": startSize,
          "--faded-edge-end-size": endSize,
          maskImage,
          maskRepeat: disabled ? undefined : "no-repeat",
          WebkitMaskImage: maskImage,
          WebkitMaskRepeat: disabled ? undefined : "no-repeat",
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Component>
  )
}

export { FadedEdgeScrollArea }
