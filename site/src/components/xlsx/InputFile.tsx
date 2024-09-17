import { EyeIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useXlsxTemplater } from "./useXlsxTemplater";
import SheetPreviewDialog from "./preview/SheetPreviewDialog";

export default function InputFile() {
  const setFile = useXlsxTemplater((state) => state.setInputFile);
  const file = useXlsxTemplater((state) => state.file);

  return (
    <article className="p-4 rounded-md border border-foreground/10 flex flex-col gap-4">
      <div className="flex flex-row justify-between">
        <Label htmlFor="input-file">Input file</Label>
        <SheetPreviewDialog file={file}>
          <Button
            size="icon"
            variant="ghost"
            className="p-0 h-4 w-4 scale-150"
            disabled={!file}
          >
            <EyeIcon size=".75em" />
          </Button>
        </SheetPreviewDialog>
      </div>
      <Input
        id="input-file"
        type="file"
        accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          if (e.target.files) {
            setFile(e.target.files[0]);
          }
        }}
      />
    </article>
  );
}
