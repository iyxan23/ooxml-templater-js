import { xlsxFillTemplate, type SheetFinishStatus } from "ooxml-templater/xlsx";
import { create } from "zustand";
import { streamToBlob } from "~/lib/utils";

interface XlsxTemplaterState {
  data: string;
  setData: (data: string) => void;

  file: File | null;
  setInputFile: (file: File) => void;

  output: Blob | null;
  isPending: boolean;

  logs: string[];

  doTemplate: () => Promise<void>;
}

export const useXlsxTemplater = create<XlsxTemplaterState>()((set, get) => ({
  data: "",
  setData: (data: string) => set({ data }),

  file: null,
  setInputFile: (file: File) => set({ file }),

  output: null,
  isPending: false,

  logs: [],

  doTemplate: async () => {
    set({ logs: [] });
    if (get().isPending) return;

    const file = get().file;
    const rawData = get().data;
    if (!file) return;

    // parse to json if possible
    const inputData = (() => {
      try {
        return JSON.parse(rawData);
      } catch {
        set({ logs: ["JSON parse error, treating as string"] });
        return rawData;
      }
    })();

    set({ isPending: true });

    const transform = new TransformStream();
    void xlsxFillTemplate(file.stream(), transform.writable, inputData, {
      onSheetFinished: (sheetName: string, status: SheetFinishStatus) =>
        set({
          logs: [
            ...get().logs,
            status.status === "success"
              ? `[success] ${sheetName}${status.issues.length > 0 ? ", with issues" : ""}`
              : `[error] ${sheetName}. Fatal error: ${status.error.message} at column ${status.error.col + 1} and row ${status.error.row}`,
            ...status.issues.map(
              (i) =>
                `[issue] ${sheetName}: ${i.message} at column ${i.col + 1} and row ${i.row + 1}`,
            ),
          ],
        }),
    });

    const blob = await streamToBlob(transform.readable);

    set({ isPending: false, output: blob });
  },
}));
