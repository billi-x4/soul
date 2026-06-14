"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

interface CopyButtonProps extends React.ComponentProps<typeof Button> {}

export function CopyButton({ value, ...props }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = async () => {
    // Only show the success check when the clipboard actually took the value.
    if (!(await copyText(String(value)))) {
      toast.error("Couldn't copy to the clipboard.");
      return;
    }
    setHasCopied(true);
    setTimeout(() => {
      setHasCopied(false);
    }, 2000);
  };

  return (
    <Button onClick={handleCopy} size="sm" {...props} className="size-6.5 p-0">
      {hasCopied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      <span className="sr-only">{hasCopied ? "Copied" : "Copy to clipboard"}</span>
    </Button>
  );
}
