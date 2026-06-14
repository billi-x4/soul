import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isLoading?: boolean;
  }) {
  const classes = cn(buttonVariants({ variant, size, className }));

  // Radix Slot (asChild) requires EXACTLY one child, so we must not append the loader sibling.
  // Render the single child through the Slot and skip the loading affordance.
  if (asChild) {
    return (
      <Slot className={classes} data-slot="button" {...props}>
        {children}
      </Slot>
    );
  }

  if (size === "icon" && isLoading) {
    return (
      <button className={classes} data-slot="button" disabled={disabled || isLoading} {...props}>
        <Loader2 aria-hidden="true" className="animate-spin" />
      </button>
    );
  }

  return (
    <button className={classes} data-slot="button" disabled={disabled || isLoading} {...props}>
      {children}
      {isLoading && (
        <Loader2
          aria-hidden="true"
          className={cn("animate-spin", size === "lg" ? "size-5" : "size-4")}
        />
      )}
    </button>
  );
}

Button.displayName = "Button";

export { Button, buttonVariants };
