import { FinanceNative, isNative } from "./native";

const asBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(",")[1]);
  reader.onerror = () => reject(new Error("Berkas gagal dibaca."));
  reader.readAsDataURL(blob);
});

export async function saveBlob(blob, filename) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (isNative) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const saved = await Filesystem.writeFile({ path: `exports/${Date.now()}-${safeName}`, data: await asBase64(blob), directory: Directory.Cache, recursive: true });
    await Share.share({ title: filename, files: [saved.uri], dialogTitle: "Simpan atau bagikan dokumen" });
  } else {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function savePdf(pdf, filename, print = false) {
  if (isNative && print === true) {
    await FinanceNative.printPdf({ name: filename, data: await asBase64(pdf.output("blob")) });
    return;
  }
  await saveBlob(pdf.output("blob"), filename);
}

export async function downloadUrl(url, filename) {
  const parsed = new URL(url, window.location.origin);
  if (!["https:", "http:", "blob:"].includes(parsed.protocol)) throw new Error("Alamat unduhan tidak valid.");
  if (isNative && parsed.protocol !== "blob:") {
    // Hand a short-lived signed URL to the browser: avoids buffering database backups in JS.
    const { openExternal } = await import("./native");
    await openExternal(parsed.href);
  } else {
    const link = document.createElement("a");
    link.href = parsed.href;
    link.download = filename || "download";
    link.referrerPolicy = "no-referrer";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
