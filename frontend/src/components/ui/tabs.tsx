import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "../../utils/index"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: 'default' | 'pills' | 'underline';
  }
>(({ className, variant = 'default', ...props }, ref) => {
  const variants = {
    default: "bg-muted/50 p-1 rounded-lg",
    pills: "bg-transparent space-x-1",
    underline: "border-b border-border bg-transparent rounded-none p-0"
  }
  
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex items-center justify-start transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: 'default' | 'pills' | 'underline';
  }
>(({ className, variant = 'default', ...props }, ref) => {
  const variants = {
    default: cn(
      "px-4 py-2 text-sm font-medium rounded-md transition-all",
      "text-muted-foreground hover:text-foreground/80",
      "data-[state=active]:bg-background data-[state=active]:text-foreground",
      "data-[state=active]:shadow-sm"
    ),
    pills: cn(
      "px-4 py-2 text-sm font-medium rounded-full transition-colors",
      "text-muted-foreground hover:text-foreground/80 hover:bg-muted/50",
      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
      "data-[state=active]:shadow-sm"
    ),
    underline: cn(
      "relative px-4 py-3 text-sm font-medium transition-colors",
      "text-muted-foreground hover:text-foreground/80",
      "data-[state=active]:text-foreground",
      "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-transparent",
      "data-[state=active]:after:bg-primary data-[state=active]:after:animate-underline"
    )
  }
  
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "data-[state=inactive]:hidden",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
