import { useRef, useState } from "react";
import api from "../api/axios";

export default function ReceiptImage({ expenseId, receipt, alt, ...imageProps }) {
  const [refreshed, setRefreshed] = useState(null);
  const failedUrl = useRef("");
  const src = refreshed?.originalUrl === receipt?.url
    ? refreshed.url
    : receipt?.url || "";

  const refreshExpiredUrl = async () => {
    if (!expenseId || !receipt?.id || failedUrl.current === src) {
      setRefreshed({ originalUrl: receipt?.url, url: "" });
      return;
    }

    failedUrl.current = src;
    try {
      const response = await api.get(
        `/expenses/${expenseId}/receipts/${receipt.id}/`,
      );
      setRefreshed({
        originalUrl: receipt.url,
        url: response.data?.url || "",
      });
    } catch (error) {
      console.error("Gagal memperbarui akses bukti transaksi:", error);
      setRefreshed({ originalUrl: receipt.url, url: "" });
    }
  };

  if (!src) return null;

  return (
    <img
      {...imageProps}
      src={src}
      alt={alt}
      onError={refreshExpiredUrl}
      referrerPolicy="no-referrer"
    />
  );
}
