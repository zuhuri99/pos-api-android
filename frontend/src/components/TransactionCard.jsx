import { useNavigate } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import PostedBadge from "./PostedBadge";
import ReceiptImage from "./ReceiptImage";

export default function TransactionCard({ item }) {
  const navigate = useNavigate();
  const receipts = Array.isArray(item.receipts) ? item.receipts : [];

  return (
    <div
      onClick={() => navigate(`/expense/${item.id}`)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) navigate(`/expense/${item.id}`);
      }}
      role="link"
      tabIndex={0}
      className="bg-white p-4 rounded-lg shadow mb-3 cursor-pointer active:bg-gray-50"
    >
      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-gray-500">
            {item.date}
          </div>

          <div className="font-semibold text-sm">
            {item.transaction_code}
          </div>
        </div>

        {/* AMOUNT */}
        <div className="text-right">
          <div className="text-green-700 font-bold text-sm">
            Rp {Number(item.amount).toLocaleString("id-ID")}
          </div>
        </div>
      </div>

      {/* BADGES */}
      <div className="flex gap-2 mt-2">
        <StatusBadge status={item.status} />
        <PostedBadge posted={item.is_posted} />
      </div>

      {/* CATEGORY (STRING) */}
      {item.category && (
        <div className="text-xs text-gray-500 mt-2">
          {item.category}
        </div>
      )}

      {/* DETAIL */}
      {item.detail && (
        <div className="text-sm text-gray-600 mt-1 line-clamp-2">
          {item.detail}
        </div>
      )}

      {/* RECEIPT */}
      {receipts.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {receipts.map((receipt, index) => (
            <ReceiptImage
              key={receipt.id || receipt.url}
              expenseId={item.id}
              receipt={receipt}
              alt={`Bukti ${index + 1}`}
              className="h-28 w-full rounded border object-cover"
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-xs font-semibold text-[#0067b8]">Lihat detail</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/expense/${item.id}/edit`);
          }}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0067b8] hover:bg-blue-100"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
