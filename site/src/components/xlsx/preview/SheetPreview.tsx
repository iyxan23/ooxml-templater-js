import XLSX from "xlsx";
import React from "react";

export default function SheetPreview({ file = null }: { file: File | null }) {
  const [rows, setRows] = React.useState<string[][]>([]);
  const longest = React.useMemo(() => findLongestChildArray(rows), [rows]);

  React.useEffect(() => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return;
      if (typeof e.target.result === "string") return;

      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      });

      setRows(rows);
    };

    reader.readAsArrayBuffer(file);
  }, [file]);
  console.log(rows);

  return (
    <div
      className="overflow-auto grid w-fit h-fit"
      style={{
        gridTemplateColumns: `repeat(${longest}, 1fr)`,
      }}
    >
      {rows.map((row, i) => (
        <>
          {Array(longest)
            .fill({})
            .map((_, li) => row[li] ?? "\xA0") // &nbsp;
            .map((cell, j) => (
              <div
                key={`${i}-${j}-${cell}`}
                className="px-2 py-1 border border-muted-foreground/50 text-sm font-mono"
              >
                {cell}
              </div>
            ))}
        </>
      ))}
    </div>
  );
}

function findLongestChildArray(data: any[][]): number {
  let longest = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].length > longest) longest = data[i].length;
  }
  return longest;
}
