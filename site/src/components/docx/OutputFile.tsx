import { DownloadIcon, EyeIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { useDocxTemplater } from "./useDocxTemplater";

export default function OutputFile() {
  const output = useDocxTemplater((state) => state.output);
  const isPending = useDocxTemplater((state) => state.isPending);

  return (
    <article className="p-4 rounded-md border border-foreground/10 flex flex-col gap-4">
      <div className="flex flex-row justify-between">
        <Label htmlFor="output-file">Output File</Label>
        <Button size="icon" variant="ghost" className="p-0 h-4 w-4 scale-150">
          <EyeIcon size=".75em" />
        </Button>
      </div>
      <Button
        id="output-file"
        variant="outline"
        className="flex flex-row gap-2"
        disabled={!output || isPending}
        onClick={() => {
          if (!output) return;

          const url = URL.createObjectURL(output);
          const a = document.createElement("a");
          a.href = url;
          a.download = "ooxml-templater-js-output.xlsx";
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <DownloadIcon size="1em" />
        Download
      </Button>
    </article>
  );
}
