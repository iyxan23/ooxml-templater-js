import { docxFillTemplate } from "ooxml-templater/docx";
import { create } from "zustand";
import { streamToBlob } from "~/lib/utils";

interface DocxTemplaterState {
  data: string;
  setData: (data: string) => void;

  file: File | null;
  setInputFile: (file: File) => void;

  output: Blob | null;
  isPending: boolean;

  doTemplate: () => Promise<void>;
}

export const useDocxTemplater = create<DocxTemplaterState>()((set, get) => ({
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
    void docxFillTemplate(file.stream(), transform.writable, inputData);

    const blob = await streamToBlob(transform.readable);

    set({ isPending: false, output: blob });
  },
}));
