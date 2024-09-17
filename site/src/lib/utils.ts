import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function streamToBlob(
  stream: ReadableStream<Uint8Array>,
): Promise<Blob> {
  return new Response(stream).blob()
}
