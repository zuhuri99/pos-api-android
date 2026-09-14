export default function StatusBadge({ status }) {
  if (!status) return null;

  const map = {
    produksi: "bg-green-100 text-green-700",
    non_produksi: "bg-gray-200 text-gray-700",
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${
        map[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status === "produksi" ? "Produksi" : "Non Produksi"}
    </span>
  );
}
