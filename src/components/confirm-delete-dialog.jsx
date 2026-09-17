"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Ask before deleting. Returns `[confirm, dialog]`: render `dialog` anywhere
 * in the component, then `if (!(await confirm({ title, description }))) return;`
 * before the delete runs.
 *
 * Every delete in the app goes through this: trash icons sit right under a
 * thumb on a phone, and a mistaken tap shouldn't cost a record.
 */
export function useConfirmDelete() {
  const [request, setRequest] = React.useState(null);
  // Keeps the text on screen while the dialog animates closed.
  const last = React.useRef(null);
  if (request) last.current = request;
  const shown = request || last.current;

  const confirm = React.useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        setRequest({ ...options, resolve });
      }),
    []
  );

  function close(result) {
    request?.resolve(result);
    setRequest(null);
  }

  const dialog = (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{shown?.title || "Delete this?"}</DialogTitle>
          <DialogDescription>
            {shown?.description || "This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => close(true)}>
            {shown?.confirmLabel || "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog];
}
