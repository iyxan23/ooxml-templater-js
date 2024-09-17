import { EyeIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useDocxTemplater } from "./useDocxTemplater";

export default function InputFile() {
  const setFile = useDocxTemplater((state) => state.setInputFile);

  return (
    <article className="p-4 rounded-md border border-foreground/10 flex flex-col gap-4">
      <div className="flex flex-row justify-between">
        <Label htmlFor="input-file">Input file</Label>
        <Button size="icon" variant="ghost" className="p-0 h-4 w-4 scale-150">
          <EyeIcon size=".75em" />
        </Button>
      </div>
      <Input
        id="input-file"
        type="file"
        accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => {
          if (e.target.files) {
            setFile(e.target.files[0]);
          }
        }}
      />
    </article>
  );
}
