import { xlsxFillTemplate } from "ooxml-templater/xlsx";
import { create } from "zustand";
import { streamToBlob } from "~/lib/utils";

interface XlsxTemplaterState {
  data: string;
  setData: (data: string) => void;

  file: File | null;
  setInputFile: (file: File) => void;

  output: Blob | null;
  isPending: boolean;

  doTemplate: () => Promise<void>;
}

export const useXlsxTemplater = create<XlsxTemplaterState>()((set, get) => ({
  data: "",
  setData: (data: string) => set({ data }),

  file: null,
  setInputFile: (file: File) => set({ file }),

  output: null,
  isPending: false,

  doTemplate: async () => {
    if (get().isPending) return;

    const file = get().file;
    const rawData = get().data;
    if (!file) return;

    // parse to json if possible
    const inputData = (() => {
      try {
        return JSON.parse(rawData);
      } catch {
        return rawData;
      }
    })();

    set({ isPending: true });

    const transform = new TransformStream();
    void xlsxFillTemplate(file.stream(), transform.writable, inputData);

    const blob = await streamToBlob(transform.readable);

    set({ isPending: false, output: blob });
  },
}));
