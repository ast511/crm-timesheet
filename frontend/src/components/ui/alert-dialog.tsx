import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * The dialog that asks before something irreversible happens.
 *
 * It is a separate primitive from `Dialog` rather than a variant of it, and the
 * difference is the whole point: an alert dialog **cannot be dismissed by
 * clicking outside it or pressing Escape**, and it has no close button in the
 * corner. Somebody about to delete a record has to answer the question — with
 * either button — instead of dismissing it by reflex.
 *
 * Base UI implements the rest of the accessible behaviour: the focus trap, the
 * `role="alertdialog"`, the association of the title and the description with
 * it, and returning focus to whatever opened it.
 */
export const AlertDialog = ({ ...props }: AlertDialogPrimitive.Root.Props) => (
  <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
);

export const AlertDialogTrigger = ({ ...props }: AlertDialogPrimitive.Trigger.Props) => (
  <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
);

export const AlertDialogClose = ({ ...props }: AlertDialogPrimitive.Close.Props) => (
  <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
);

const AlertDialogOverlay = ({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) => (
  <AlertDialogPrimitive.Backdrop
    data-slot="alert-dialog-overlay"
    className={cn(
      'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
      className,
    )}
    {...props}
  />
);

export const AlertDialogContent = ({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Popup
      data-slot="alert-dialog-content"
      className={cn(
        'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
        className,
      )}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Popup>
  </AlertDialogPrimitive.Portal>
);

export const AlertDialogHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div data-slot="alert-dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
);

export const AlertDialogFooter = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="alert-dialog-footer"
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);

export const AlertDialogTitle = ({ className, ...props }: AlertDialogPrimitive.Title.Props) => (
  <AlertDialogPrimitive.Title
    data-slot="alert-dialog-title"
    className={cn('font-heading leading-none font-medium', className)}
    {...props}
  />
);

export const AlertDialogDescription = ({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) => (
  <AlertDialogPrimitive.Description
    data-slot="alert-dialog-description"
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
);