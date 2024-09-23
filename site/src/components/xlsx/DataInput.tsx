import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { useXlsxTemplater } from "./useXlsxTemplater";

export default function DataInput() {
  const data = useXlsxTemplater((state) => state.data);
  const isPending = useXlsxTemplater((state) => state.isPending);
  const setData = useXlsxTemplater((state) => state.setData);
  const doTemplate = useXlsxTemplater((state) => state.doTemplate);
  const file = useXlsxTemplater((state) => state.file);
  const logs = useXlsxTemplater((state) => state.logs);

  return (
    <>
      <Label>Input JSON</Label>
      <Textarea
        className="font-mono"
        disabled={isPending}
        value={data}
        onChange={(e) => setData(e.target.value)}
        rows={15}
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-row justify-between gap-4 items-end">
          <p className="text-sm text-muted-foreground">
            Note: This is all happening on the client! (≧▽≦)
          </p>
          <div className="flex flex-row gap-4">
            <Button
              variant="outline"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json";
                input.onchange = () => {
                  input.files?.[0] &&
                    input.files[0].text().then(setData);
                };
                input.click();
              }}
            >
              Import JSON
            </Button>
            <Button disabled={isPending || !file} onClick={() => doTemplate()}>
              Template
            </Button>
          </div>
        </div>

        <Textarea
          rows={3}
          disabled
          value={logs.join("\n")}
          className="font-mono resize-none"
        />
      </div>
    </>
  );
}
