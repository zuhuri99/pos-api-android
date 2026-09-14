export default function ErrorAlert({ message, onClose }) {
  if (!message) return null;

  let text = message;

  // ⬇️ INI KUNCI ANTI-CRASH
  if (typeof message === "object") {
    text = Object.entries(message)
      .map(([field, errors]) => {
        if (Array.isArray(errors)) {
          return `${field}: ${errors.join(", ")}`;
        }
        return `${field}: ${String(errors)}`;
      })
      .join("\n");
  }

  return (
    <div className="bg-red-100 text-red-700 p-3 rounded mb-4 whitespace-pre-line">
      <div className="flex justify-between items-start">
        <span>{text}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-2 text-red-700 font-bold"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
