export const getSaleNote = (invoice = {}) => {
  const saleNote = String(invoice.sale_note || "").trim();
  if (saleNote) return saleNote;

  return [invoice.additional_notes, invoice.staff_note]
    .map((note) => String(note || "").trim())
    .filter(Boolean)
    .join(" | ");
};
