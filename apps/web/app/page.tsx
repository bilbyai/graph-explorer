import { Button } from "@workspace/ui/components/button"

import { connections } from "@/lib/env"

export default function Page() {
  const connectionCount = connections.length

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">Project ready!</h1>
          <p>You may now add components and start building.</p>
          <p>We&apos;ve already added the button component for you.</p>
          <p>
            Loaded {connectionCount} Neo4j{" "}
            {connectionCount === 1 ? "connection" : "connections"}.
          </p>
          <Button className="mt-2">Button</Button>
        </div>
        <div className="text-muted-foreground font-mono text-xs">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  )
}
