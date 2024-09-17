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
      <Button disabled={isPending || !file} onClick={() => doTemplate()}>
        Template
      </Button>
    </>
  );
}
