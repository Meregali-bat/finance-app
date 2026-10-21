import { getDocumentProxy } from "unpdf";
import type { PdfTextItem } from "@/lib/statement/nubank";

/** Os pedaços de texto de cada página, com a posição na página. */
export async function pdfTextItems(data: Uint8Array): Promise<PdfTextItem[][]> {
  const pdf = await getDocumentProxy(data);
  const pages: PdfTextItem[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    pages.push(
      content.items.flatMap((item) =>
        "str" in item
          ? [{ str: item.str, x: item.transform[4] as number, y: item.transform[5] as number }]
          : [],
      ),
    );
  }
  return pages;
}
