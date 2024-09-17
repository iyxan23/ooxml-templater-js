import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import SheetPreview from "./SheetPreview";

export default function SheetPreviewDialog({
  children,
  file,
  disabled,
}: {
  children: React.ReactNode;
  file: File | Blob | null;
  disabled?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild disabled={disabled}>
        {children}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] grid grid-rows-[auto_1fr]">
        <DialogHeader>
          <DialogTitle>preview sheet</DialogTitle>
          <DialogDescription>
            with the power of{" "}
            <a href="https://sheetjs.com" className="underline">
              sheetjs
            </a>
            , here is what the sheet looks like:
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto overflow-y-auto">
          <SheetPreview file={file} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
