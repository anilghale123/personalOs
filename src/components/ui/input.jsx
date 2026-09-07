import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-md border border-border bg-surface px-3 py-1 text-base caret-primary transition-colors file:border-0 file:bg-transparent file:text-sm placeholder:text-sand-500 hover:border-sand-500 focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-[0.45] sm:h-9 sm:text-sm",
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
