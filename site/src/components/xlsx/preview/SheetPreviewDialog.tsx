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
}: {
  children: React.ReactNode;
  file: File | null;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)]">
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
