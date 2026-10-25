export interface Medicine {
  id: string;
  name: string;
  generic: string;
  dosage: string;
  uses: string[];
  sideEffects: string[];
  price: number;
  equivalents: { name: string; price: number }[];
  confidence: number;
}

export const mockMedicines: Medicine[] = [
  {
    id: "1",
    name: "Amoxicillin 500mg",
    generic: "Amoxicillin",
    dosage: "1 capsule, 3x daily for 7 days",
    uses: ["Bacterial infections", "Respiratory tract infections", "Ear infections"],
    sideEffects: ["Nausea", "Diarrhea", "Skin rash", "Headache"],
    price: 12.5,
    equivalents: [
      { name: "Mox 500", price: 9.0 },
      { name: "Novamox", price: 10.5 },
      { name: "Amoxil", price: 14.0 },
    ],
    confidence: 0.97,
  },
  {
    id: "2",
    name: "Paracetamol 650mg",
    generic: "Acetaminophen",
    dosage: "1 tablet every 6 hours as needed",
    uses: ["Fever", "Mild to moderate pain", "Headache"],
    sideEffects: ["Rare liver issues at high doses", "Allergic reaction (rare)"],
    price: 3.2,
    equivalents: [
      { name: "Crocin 650", price: 2.8 },
      { name: "Dolo 650", price: 3.0 },
      { name: "Calpol 650", price: 3.5 },
    ],
    confidence: 0.99,
  },
  {
    id: "3",
    name: "Pantoprazole 40mg",
    generic: "Pantoprazole",
    dosage: "1 tablet daily before breakfast",
    uses: ["Acid reflux", "GERD", "Stomach ulcers"],
    sideEffects: ["Headache", "Diarrhea", "Dizziness", "Joint pain"],
    price: 7.9,
    equivalents: [
      { name: "Pantop 40", price: 6.0 },
      { name: "Pantocid 40", price: 8.2 },
    ],
    confidence: 0.94,
  },
];

export interface ScanHistoryItem {
  id: string;
  date: string;
  fileName: string;
  medicinesFound: number;
  status: "completed" | "processing" | "failed";
  thumbnail?: string;
}

export const mockScanHistory: ScanHistoryItem[] = [
  { id: "s1", date: "2026-05-22", fileName: "prescription_dr_kumar.jpg", medicinesFound: 3, status: "completed" },
  { id: "s2", date: "2026-05-18", fileName: "rx_apollo_clinic.png", medicinesFound: 2, status: "completed" },
  { id: "s3", date: "2026-05-10", fileName: "pediatric_rx.jpg", medicinesFound: 4, status: "completed" },
  { id: "s4", date: "2026-04-29", fileName: "follow_up_rx.pdf", medicinesFound: 1, status: "completed" },
  { id: "s5", date: "2026-04-15", fileName: "dental_rx.jpg", medicinesFound: 2, status: "failed" },
];
