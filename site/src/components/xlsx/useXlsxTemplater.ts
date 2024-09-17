import { create } from "zustand";

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
    set({ isPending: true });

    // fake
    await new Promise((resolve) => setTimeout(resolve, 1000));

    set({ isPending: false, output: new Blob([]) });
  },
}));
