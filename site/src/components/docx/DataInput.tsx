import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { useDocxTemplater } from "./useDocxTemplater";

export default function DataInput() {
  const data = useDocxTemplater((state) => state.data);
  const isPending = useDocxTemplater((state) => state.isPending);
  const setData = useDocxTemplater((state) => state.setData);
  const doTemplate = useDocxTemplater((state) => state.doTemplate);
  const file = useDocxTemplater((state) => state.file);

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
