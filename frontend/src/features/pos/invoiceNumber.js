export async function resolveNextInvoiceNumber({
  transactionDate,
  userCode,
  online,
  refreshRemote,
  peekLocal,
}) {
  if (online) {
    try {
      await refreshRemote(transactionDate);
    } catch {
      // API dapat mati meski Android masih terhubung ke internet.
      // Counter SQLite tetap menjadi sumber nomor agar transaksi tidak terhenti.
    }
  }

  return peekLocal(transactionDate, userCode);
}
