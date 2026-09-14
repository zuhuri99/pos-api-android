export default function PostedBadge({ posted }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${
        posted
          ? "bg-blue-100 text-blue-700"
          : "bg-yellow-100 text-yellow-800"
      }`}
    >
      {posted ? "Posted" : "Belum Posted"}
    </span>
  );
}
