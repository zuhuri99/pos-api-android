export const normalizedTransactionStatus = (value) =>
  String(value || "final").trim().toLowerCase();

export const isDraftTransaction = (transaction) =>
  normalizedTransactionStatus(transaction?.status) === "draft";

export const transactionStatusLabel = (value) =>
  normalizedTransactionStatus(value) === "draft" ? "DRAFT" : "FINAL";
