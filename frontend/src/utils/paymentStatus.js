export const getPaymentStatusText = (status, paymentLines = []) => {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "paid") return "LUNAS";
  if (normalizedStatus === "partial") return "BELUM LUNAS";
  if (normalizedStatus === "due") return "BELUM DIBAYAR";

  const hasPayment = paymentLines.some(
    (payment) => Math.max(0, Number(payment?.amount) || 0) > 0,
  );
  return hasPayment ? "BELUM LUNAS" : "BELUM DIBAYAR";
};
