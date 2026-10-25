import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ParsedMedicine } from "./scan.functions";

export type ReportScan = {
  id: string;
  file_name: string;
  created_at: string;
  ocr_text: string | null;
  medicines: ParsedMedicine[];
};

const PRIMARY: [number, number, number] = [37, 99, 235];
const MUTED: [number, number, number] = [100, 116, 139];

export function generateMedicalReport(scan: ReportScan, imageDataUrl?: string | null) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // Header banner
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("MedScan AI", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("AI-powered prescription analysis report", margin, 50);
  doc.setFontSize(9);
  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    pageW - margin,
    50,
    { align: "right" },
  );
  y = 90;

  // Patient / scan meta
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Prescription Details", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`File: ${scan.file_name}`, margin, y);
  y += 14;
  doc.text(`Scan date: ${new Date(scan.created_at).toLocaleString()}`, margin, y);
  y += 14;
  doc.text(`Medicines detected: ${scan.medicines.length}`, margin, y);
  y += 20;

  // Prescription image
  if (imageDataUrl) {
    try {
      const imgW = 180;
      const imgH = 130;
      doc.addImage(imageDataUrl, "JPEG", pageW - margin - imgW, 90, imgW, imgH);
    } catch {
      /* ignore image errors */
    }
  }

  // Medicines table
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Extracted Medicines", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y + 4,
    head: [["Medicine", "Generic", "Dosage", "Frequency", "Duration", "Conf."]],
    body: scan.medicines.map((m) => [
      m.name,
      m.generic || "—",
      m.dosage || "—",
      m.frequency || "—",
      m.duration || "—",
      `${Math.round((m.confidence || 0) * 100)}%`,
    ]),
    headStyles: { fillColor: PRIMARY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: margin, right: margin },
    theme: "striped",
  });

  // Per-medicine details
  for (const m of scan.medicines) {
    // @ts-expect-error lastAutoTable injected by plugin
    let cursor: number = doc.lastAutoTable?.finalY ?? y;
    if (cursor > 700) {
      doc.addPage();
      cursor = margin;
    }
    cursor += 24;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...PRIMARY);
    doc.text(m.name, margin, cursor);
    cursor += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);

    const block = (label: string, val: string | string[] | undefined) => {
      if (!val || (Array.isArray(val) && val.length === 0)) return;
      const text = Array.isArray(val) ? val.join(", ") : val;
      doc.setFont("helvetica", "bold");
      doc.text(`${label}: `, margin, cursor);
      doc.setFont("helvetica", "normal");
      const split = doc.splitTextToSize(text, pageW - margin * 2 - 60);
      doc.text(split, margin + 60, cursor);
      cursor += split.length * 11 + 4;
    };

    block("Category", m.category);
    block("Timing", m.timing);
    block("Uses", m.uses);
    block("Side effects", m.sideEffects);
    block("Precautions", m.precautions);
    block("Food interactions", m.foodInteractions);
    block("AI explanation", m.aiExplanation);
    if (m.equivalents?.length) {
      block(
        "Alternatives",
        m.equivalents.map((e) => `${e.name} (₹${e.price})`),
      );
    }

    // @ts-expect-error injected
    doc.lastAutoTable = { finalY: cursor };
  }

  // Footer disclaimer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      "This report is AI-generated and does not replace medical advice. Always consult a doctor.",
      margin,
      doc.internal.pageSize.getHeight() - 20,
    );
    doc.text(
      `Page ${i} / ${pageCount}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" },
    );
  }

  doc.save(`MedScan-Report-${scan.id.slice(0, 8)}.pdf`);
}
