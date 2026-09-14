package id.pos.mobile;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "FinanceNative",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        )
    }
)
public class FinanceNativePlugin extends Plugin {
    private static final String KEY_ALIAS = "pos.session.key";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("pos.secure.session", Context.MODE_PRIVATE);
    }
    private SharedPreferences printerPreferences() {
        return getContext().getSharedPreferences("pos.thermal.printer", Context.MODE_PRIVATE);
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }
    private String slot(String accountId) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(accountId.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(digest, Base64.NO_WRAP | Base64.URL_SAFE).replace("=", "");
    }
    private byte[] aad(String server, String accountId) {
        return (server + "\n" + accountId).getBytes(StandardCharsets.UTF_8);
    }
    private boolean storeToken(String accountId, String token, String server) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(aad(server, accountId));
        String name = slot(accountId);
        String encrypted = Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        return preferences().edit()
            .putString("token." + name, encrypted)
            .putString("server." + name, server)
            .putString("iv." + name, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .commit();
    }
    @PluginMethod
    public void setToken(PluginCall call) {
        try {
            String accountId = call.getString("accountId");
            String token = call.getString("token");
            String server = call.getString("server");
            if (accountId == null || token == null || server == null) { call.reject("Sesi tidak lengkap."); return; }
            boolean saved = storeToken(accountId, token, server);
            if (!saved) { call.reject("Sesi gagal disimpan."); return; }
            call.resolve();
        } catch (Exception e) { call.reject("Sesi gagal dienkripsi."); }
    }
    @PluginMethod
    public void getToken(PluginCall call) {
        JSObject result = new JSObject();
        String accountId = call.getString("accountId", "");
        try {
            SharedPreferences prefs = preferences();
            String server = call.getString("server", "");
            String name = slot(accountId);
            String encrypted = prefs.getString("token." + name, null);
            String storedServer = prefs.getString("server." + name, null);
            String iv = prefs.getString("iv." + name, "");
            boolean legacy = false;
            if (encrypted == null && server.equals(prefs.getString("server", null))) {
                encrypted = prefs.getString("token", null);
                storedServer = prefs.getString("server", null);
                iv = prefs.getString("iv", "");
                legacy = encrypted != null;
            }
            if (encrypted != null && server.equals(storedServer)) {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
                cipher.updateAAD(legacy ? server.getBytes(StandardCharsets.UTF_8) : aad(server, accountId));
                String token = new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8);
                result.put("token", token);
                if (legacy && storeToken(accountId, token, server)) {
                    prefs.edit().remove("token").remove("server").remove("iv").commit();
                }
            }
            call.resolve(result);
        } catch (Exception e) {
            // Kerusakan satu sesi tidak boleh menghapus sesi akun lainnya.
            try {
                String name = slot(accountId);
                preferences().edit().remove("token." + name).remove("server." + name).remove("iv." + name).commit();
            } catch (Exception ignored) { /* Akun akan diminta login ulang. */ }
            call.resolve(result);
        }
    }
    @PluginMethod
    public void clearToken(PluginCall call) {
        try {
            String accountId = call.getString("accountId");
            if (accountId == null) {
                if (preferences().edit().clear().commit()) call.resolve();
                else call.reject("Sesi gagal dihapus.");
                return;
            }
            String name = slot(accountId);
            if (preferences().edit().remove("token." + name).remove("server." + name).remove("iv." + name).commit()) call.resolve();
            else call.reject("Sesi gagal dihapus.");
        } catch (Exception e) { call.reject("Sesi gagal dihapus."); }
    }
    @PluginMethod
    public void clearAllTokens(PluginCall call) {
        if (preferences().edit().clear().commit()) call.resolve();
        else call.reject("Sesi gagal dihapus.");
    }
    @PluginMethod
    public void printPdf(PluginCall call) {
        try {
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            if (bytes.length < 5 || !new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) {
                call.reject("Dokumen PDF tidak valid."); return;
            }
            String name = call.getString("name", "Finance.pdf");
            getActivity().runOnUiThread(() -> {
                try {
                    PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                    manager.print(name, new PrintDocumentAdapter() {
                        @Override
                        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellation,
                                LayoutResultCallback callback, android.os.Bundle extras) {
                            if (cancellation.isCanceled()) { callback.onLayoutCancelled(); return; }
                            callback.onLayoutFinished(new PrintDocumentInfo.Builder(name)
                                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN).build(), true);
                        }
                        @Override
                        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellation, WriteResultCallback callback) {
                            if (cancellation.isCanceled()) { callback.onWriteCancelled(); return; }
                            try (FileOutputStream output = new FileOutputStream(destination.getFileDescriptor())) {
                                output.write(bytes);
                                if (cancellation.isCanceled()) callback.onWriteCancelled();
                                else callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                            } catch (Exception e) { callback.onWriteFailed("PDF gagal dicetak."); }
                        }
                    }, null);
                    call.resolve();
                } catch (Exception e) { call.reject("Layanan cetak tidak tersedia."); }
            });
        } catch (Exception e) { call.reject("PDF gagal dibaca."); }
    }

    private JSObject printerSettings() {
        SharedPreferences prefs = printerPreferences();
        JSObject result = new JSObject();
        result.put("mode", prefs.getString("mode", "lan"));
        result.put("lanHost", prefs.getString("lanHost", "192.168.2.124"));
        result.put("lanPort", prefs.getInt("lanPort", 9100));
        result.put("paperWidth", prefs.getInt("paperWidth", 80));
        result.put("bluetoothAddress", prefs.getString("bluetoothAddress", ""));
        result.put("bluetoothName", prefs.getString("bluetoothName", ""));
        result.put("autoPrint", prefs.getBoolean("autoPrint", false));
        result.put("autoOpenDrawer", prefs.getBoolean("autoOpenDrawer", false));
        result.put("drawerPin", prefs.getInt("drawerPin", 0));
        result.put("feedLines", prefs.getInt("feedLines", 6));
        result.put("cutPaper", prefs.getBoolean("cutPaper", true));
        return result;
    }

    @PluginMethod
    public void getPrinterSettings(PluginCall call) {
        call.resolve(printerSettings());
    }

    @PluginMethod
    public void savePrinterSettings(PluginCall call) {
        String mode = call.getString("mode", "lan");
        String host = call.getString("lanHost", "192.168.2.124").trim();
        Integer port = call.getInt("lanPort", 9100);
        Integer width = call.getInt("paperWidth", 80);
        String address = call.getString("bluetoothAddress", "").trim();
        String name = call.getString("bluetoothName", "").trim();
        Integer drawerPin = call.getInt("drawerPin", 0);
        Integer feedLines = call.getInt("feedLines", 6);
        if (!mode.equals("lan") && !mode.equals("bluetooth")) { call.reject("Jenis printer tidak valid."); return; }
        if (mode.equals("lan") && host.isEmpty()) { call.reject("Alamat IP printer wajib diisi."); return; }
        if (port == null || port < 1 || port > 65535) { call.reject("Port printer tidak valid."); return; }
        if (width == null || (width != 58 && width != 80)) { call.reject("Lebar kertas tidak valid."); return; }
        if (drawerPin == null || (drawerPin != 0 && drawerPin != 1)) { call.reject("Pin laci tidak valid."); return; }
        if (feedLines == null || feedLines < 0 || feedLines > 20) { call.reject("Jumlah feed kertas harus 0 sampai 20."); return; }
        boolean saved = printerPreferences().edit()
            .putString("mode", mode)
            .putString("lanHost", host)
            .putInt("lanPort", port)
            .putInt("paperWidth", width)
            .putString("bluetoothAddress", address)
            .putString("bluetoothName", name)
            .putBoolean("autoPrint", Boolean.TRUE.equals(call.getBoolean("autoPrint", false)))
            .putBoolean("autoOpenDrawer", Boolean.TRUE.equals(call.getBoolean("autoOpenDrawer", false)))
            .putInt("drawerPin", drawerPin)
            .putInt("feedLines", feedLines)
            .putBoolean("cutPaper", Boolean.TRUE.equals(call.getBoolean("cutPaper", true)))
            .commit();
        if (saved) call.resolve(printerSettings());
        else call.reject("Pengaturan printer gagal disimpan.");
    }

    private boolean requestBluetoothIfNeeded(PluginCall call, String callback) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || getPermissionState("bluetooth") == PermissionState.GRANTED) return false;
        requestPermissionForAlias("bluetooth", call, callback);
        return true;
    }

    @PluginMethod
    public void listBluetoothPrinters(PluginCall call) {
        if (requestBluetoothIfNeeded(call, "bluetoothListPermissionCallback")) return;
        listBondedBluetooth(call);
    }

    @PermissionCallback
    private void bluetoothListPermissionCallback(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("Izin Bluetooth ditolak."); return; }
        listBondedBluetooth(call);
    }

    private void listBondedBluetooth(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) { call.reject("Bluetooth tidak tersedia pada perangkat ini."); return; }
            if (!adapter.isEnabled()) { call.reject("Aktifkan Bluetooth terlebih dahulu."); return; }
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            JSArray devices = new JSArray();
            for (BluetoothDevice device : bonded) {
                JSObject item = new JSObject();
                item.put("name", device.getName() == null ? "Printer Bluetooth" : device.getName());
                item.put("address", device.getAddress());
                devices.put(item);
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException e) { call.reject("Izin Bluetooth belum diberikan."); }
    }

    @PluginMethod
    public void testThermalPrinter(PluginCall call) {
        if (printerPreferences().getString("mode", "lan").equals("bluetooth") &&
            requestBluetoothIfNeeded(call, "bluetoothTestPermissionCallback")) return;
        runPrinterTest(call);
    }

    @PermissionCallback
    private void bluetoothTestPermissionCallback(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("Izin Bluetooth ditolak."); return; }
        runPrinterTest(call);
    }

    private void runPrinterTest(PluginCall call) {
        new Thread(() -> {
            try {
                ByteArrayOutputStream data = new ByteArrayOutputStream();
                data.write(new byte[]{0x1b, 0x40, 0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01});
                data.write("ASAS POS\n".getBytes(StandardCharsets.US_ASCII));
                data.write(new byte[]{0x1b, 0x45, 0x00});
                data.write("Tes printer berhasil\n".getBytes(StandardCharsets.US_ASCII));
                appendFeedAndCut(data);
                writeToConfiguredPrinter(data.toByteArray());
                call.resolve();
            } catch (Exception e) { call.reject("Tes printer gagal: " + safeMessage(e)); }
        }).start();
    }

    @PluginMethod
    public void printThermal(PluginCall call) {
        if (printerPreferences().getString("mode", "lan").equals("bluetooth") &&
            requestBluetoothIfNeeded(call, "bluetoothPrintPermissionCallback")) return;
        runThermalPrint(call);
    }

    @PermissionCallback
    private void bluetoothPrintPermissionCallback(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("Izin Bluetooth ditolak."); return; }
        runThermalPrint(call);
    }

    private void runThermalPrint(PluginCall call) {
        new Thread(() -> {
            try {
                String encoded = call.getString("data", "");
                int comma = encoded.indexOf(',');
                if (comma >= 0) encoded = encoded.substring(comma + 1);
                byte[] imageBytes = Base64.decode(encoded, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
                if (bitmap == null) { call.reject("Gambar nota tidak valid."); return; }
                int paperWidth = printerPreferences().getInt("paperWidth", 80);
                byte[] commands = bitmapToEscPos(bitmap, paperWidth == 58 ? 384 : 576);
                bitmap.recycle();
                writeToConfiguredPrinter(commands);
                call.resolve();
            } catch (Exception e) { call.reject("Cetak thermal gagal: " + safeMessage(e)); }
        }).start();
    }

    @PluginMethod
    public void printThermalReceipt(PluginCall call) {
        if (printerPreferences().getString("mode", "lan").equals("bluetooth") &&
            requestBluetoothIfNeeded(call, "bluetoothReceiptPermissionCallback")) return;
        runThermalReceipt(call);
    }

    @PermissionCallback
    private void bluetoothReceiptPermissionCallback(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("Izin Bluetooth ditolak."); return; }
        runThermalReceipt(call);
    }

    private void runThermalReceipt(PluginCall call) {
        new Thread(() -> {
            try {
                JSObject receipt = call.getObject("receipt");
                if (receipt == null) { call.reject("Data nota tidak valid."); return; }
                writeToConfiguredPrinter(receiptToEscPos(receipt));
                call.resolve();
            } catch (Exception e) { call.reject("Cetak thermal gagal: " + safeMessage(e)); }
        }).start();
    }

    @PluginMethod
    public void openCashDrawer(PluginCall call) {
        if (printerPreferences().getString("mode", "lan").equals("bluetooth") &&
            requestBluetoothIfNeeded(call, "bluetoothDrawerPermissionCallback")) return;
        runCashDrawer(call);
    }

    @PermissionCallback
    private void bluetoothDrawerPermissionCallback(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("Izin Bluetooth ditolak."); return; }
        runCashDrawer(call);
    }

    private void runCashDrawer(PluginCall call) {
        new Thread(() -> {
            try {
                int pin = printerPreferences().getInt("drawerPin", 0);
                writeToConfiguredPrinter(new byte[]{0x1b, 0x40, 0x1b, 0x70, (byte) pin, 0x19, (byte) 0xfa});
                call.resolve();
            } catch (Exception e) { call.reject("Laci kasir gagal dibuka: " + safeMessage(e)); }
        }).start();
    }

    private byte[] receiptToEscPos(JSONObject receipt) throws Exception {
        boolean narrowPaper = printerPreferences().getInt("paperWidth", 80) == 58;
        int columns = narrowPaper ? 32 : 48;
        int rasterWidth = narrowPaper ? 384 : 576;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(new byte[]{0x1b, 0x40, 0x1b, 0x61, 0x01});
        if (printerPreferences().getBoolean("autoOpenDrawer", false)) appendDrawerPulse(output);
        Bitmap header = BitmapFactory.decodeResource(getContext().getResources(), R.drawable.header_asas);
        if (header == null) {
            String headerImage = value(receipt, "headerImage", "");
            if (!headerImage.isEmpty()) {
            int comma = headerImage.indexOf(',');
            if (comma >= 0) headerImage = headerImage.substring(comma + 1);
            byte[] imageBytes = Base64.decode(headerImage, Base64.DEFAULT);
                header = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
            }
        }
        if (header != null) {
            appendBitmapRaster(output, header, rasterWidth);
            header.recycle();
            writePrinterText(output, "\n");
        }
        String saleStatus = value(receipt, "saleStatus", "final");
        if (saleStatus.equalsIgnoreCase("draft")) {
            output.write(new byte[]{0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01});
            writePrinterText(output, "*** DRAFT - BELUM FINAL ***\n");
            output.write(new byte[]{0x1b, 0x45, 0x00});
            writePrinterText(output, "Dokumen sementara, bukan nota final\n");
        }
        output.write(new byte[]{0x1b, 0x45, 0x00, 0x1b, 0x61, 0x00});
        writePrinterText(output, separator(columns));
        writeColumns(output, "Nomor nota:", value(receipt, "invoiceNo", "-"), columns);
        writeColumns(output, "Tanggal:", value(receipt, "date", "-"), columns);
        writeColumns(output, "Kasir:", value(receipt, "cashier", "-"), columns);
        writeColumns(output, "Customer:", value(receipt, "customer", "-"), columns);
        writePrinterText(output, separator(columns));

        JSONArray items = receipt.optJSONArray("items");
        if (items != null) {
            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.optJSONObject(index);
                if (item == null) continue;
                String note = value(item, "note", "");
                String productName = (index + 1) + ". " + value(item, "name", "Produk");
                if (!note.isEmpty()) productName += " (" + note + ")";
                output.write(new byte[]{0x1b, 0x45, 0x01});
                writeWrapped(output, productName, columns);
                output.write(new byte[]{0x1b, 0x45, 0x00});
                String detail = "    " + value(item, "quantity", "0") + " x " + value(item, "unitPrice", "0");
                writeColumns(output, detail, value(item, "total", "0"), columns);
            }
        }
        writePrinterText(output, separator(columns));
        writeColumns(output, "Subtotal", value(receipt, "subtotal", "0"), columns);
        String discount = value(receipt, "discount", "");
        if (!discount.isEmpty() && !discount.equals("0")) {
            writeColumns(output, value(receipt, "discountLabel", "Diskon"), "- " + discount, columns);
        }
        String tax = value(receipt, "tax", "");
        if (!tax.isEmpty() && !tax.equals("0")) writeColumns(output, "Pajak", tax, columns);
        // Match the taller, bold TOTAL style from the proven thermal layout.
        // GS ! 0x01 doubles height only, so Font A keeps the same column grid
        // and the amount remains on the same line and right edge.
        output.write(new byte[]{0x1b, 0x45, 0x01, 0x1d, 0x21, 0x01});
        writeTotalColumns(output, value(receipt, "total", "0"), columns);
        output.write(new byte[]{0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00});

        JSONArray payments = receipt.optJSONArray("payments");
        writePrinterText(output, separator(columns));
        String paymentStatus = saleStatus.equalsIgnoreCase("draft")
            ? "DRAFT"
            : value(receipt, "status", "-");
        writePaymentHeading(output, paymentStatus, columns, rasterWidth, narrowPaper);
        String dueAmount = value(receipt, "dueAmount", "");
        if (!dueAmount.isEmpty()) {
            output.write(new byte[]{0x1b, 0x45, 0x01});
            writeRightAligned(output, "Kekurangan bayar: " + dueAmount, columns);
            output.write(new byte[]{0x1b, 0x45, 0x00});
        }
        if (payments != null && payments.length() > 0) {
            int paymentMethodWidth = 0;
            for (int index = 0; index < payments.length(); index++) {
                JSONObject payment = payments.optJSONObject(index);
                if (payment != null) paymentMethodWidth = Math.max(paymentMethodWidth, value(payment, "method", "Pembayaran").length());
            }
            paymentMethodWidth = Math.min(paymentMethodWidth, narrowPaper ? 10 : 14);
            for (int index = 0; index < payments.length(); index++) {
                JSONObject payment = payments.optJSONObject(index);
                if (payment == null) continue;
                String method = value(payment, "method", "Pembayaran");
                String paddedMethod = method + spaces(Math.max(0, paymentMethodWidth - method.length()));
                String paymentText = paddedMethod + " - " + value(payment, "amount", "0");
                if (paymentText.length() <= columns) writePrinterText(output, paymentText + "\n");
                else writeWrapped(output, paymentText, columns);
            }
        }

        String notes = value(receipt, "notes", "");
        if (!notes.isEmpty()) {
            writePrinterText(output, separator(columns));
            writeWrapped(output, "Catatan: " + notes, columns);
        }
        writePrinterText(output, separator(columns));
        String footer = value(receipt, "footer", "TERIMA KASIH.");
        String qr = value(receipt, "qr", "");
        if (!qr.isEmpty()) {
            Bitmap footerBitmap = createFooterBitmap(footer, qr, rasterWidth, narrowPaper);
            appendBitmapRaster(output, footerBitmap, rasterWidth);
            footerBitmap.recycle();
        } else {
            output.write(new byte[]{0x1b, 0x61, 0x00, 0x1b, 0x45, 0x01});
            writeFooterWithoutQr(output, footer, rasterWidth, narrowPaper);
            output.write(new byte[]{0x1b, 0x45, 0x00});
        }
        appendFeedAndCut(output);
        return output.toByteArray();
    }

    private String value(JSONObject object, String key, String fallback) {
        String result = object.optString(key, fallback);
        return result == null || result.equals("null") ? fallback : result.trim();
    }

    private String printerSafe(String text) {
        String normalized = Normalizer.normalize(String.valueOf(text), Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .replace('\u2013', '-').replace('\u2014', '-').replace('\u2018', '\'').replace('\u2019', '\'')
            .replace('\u201c', '"').replace('\u201d', '"');
        return normalized.replaceAll("[^\\x20-\\x7E\\n]", "?");
    }

    private void writePrinterText(ByteArrayOutputStream output, String text) throws Exception {
        output.write(printerSafe(text).getBytes(StandardCharsets.US_ASCII));
    }

    private String separator(int columns) {
        return spaces(columns).replace(' ', '-') + "\n";
    }

    private void writeColumns(ByteArrayOutputStream output, String left, String right, int columns) throws Exception {
        left = printerSafe(left); right = printerSafe(right);
        int available = columns - right.length() - 1;
        if (available < 8 || left.length() > available) {
            writeWrapped(output, left, columns);
            writePrinterText(output, spaces(Math.max(0, columns - right.length())) + right + "\n");
            return;
        }
        writePrinterText(output, left + spaces(columns - left.length() - right.length()) + right + "\n");
    }

    private void writeTotalColumns(ByteArrayOutputStream output, String right, int columns) throws Exception {
        String label = "TOTAL";
        right = printerSafe(right);
        int gap = Math.max(1, columns - label.length() - right.length());
        writePrinterText(output, label + spaces(gap) + right + "\n");
    }

    private void writePaymentHeading(
        ByteArrayOutputStream output,
        String status,
        int columns,
        int rasterWidth,
        boolean narrowPaper
    ) throws Exception {
        String heading = "PEMBAYARAN";
        String statusText = "---" + printerSafe(status) + "---";
        int statusSpacing = narrowPaper ? 0 : 2;
        int fontACharacterWidth = rasterWidth / columns;
        int statusWidth = statusText.length() * (fontACharacterWidth + statusSpacing);
        int statusPosition = Math.max(
            (heading.length() + 1) * fontACharacterWidth,
            rasterWidth - statusWidth
        );

        output.write(new byte[]{0x1b, 0x61, 0x00, 0x1b, 0x45, 0x01});
        writePrinterText(output, heading);
        output.write(new byte[]{0x1b, 0x20, (byte) statusSpacing});
        writeAbsolutePosition(output, statusPosition);
        // Double-strike strengthens the 80 mm status without changing its
        // character width or line height. GS ! 0x01 made it double-width and
        // caused the printer to wrap the status onto an extra physical line.
        if (!narrowPaper) output.write(new byte[]{0x1b, 0x47, 0x01});
        writePrinterText(output, statusText + "\n");
        output.write(new byte[]{0x1b, 0x47, 0x00, 0x1b, 0x20, 0x00, 0x1b, 0x45, 0x00});
    }

    private void writeAbsolutePosition(ByteArrayOutputStream output, int positionDots) throws Exception {
        int safePosition = Math.max(0, Math.min(65535, positionDots));
        output.write(new byte[]{
            0x1b,
            0x24,
            (byte) (safePosition & 0xff),
            (byte) ((safePosition >> 8) & 0xff)
        });
    }

    private void writeRightAligned(ByteArrayOutputStream output, String text, int columns) throws Exception {
        text = printerSafe(text);
        if (text.length() > columns) {
            writeWrapped(output, text, columns);
            return;
        }
        writePrinterText(output, spaces(columns - text.length()) + text + "\n");
    }

    private String spaces(int count) {
        StringBuilder result = new StringBuilder(Math.max(0, count));
        for (int index = 0; index < count; index++) result.append(' ');
        return result.toString();
    }

    private void writeWrapped(ByteArrayOutputStream output, String text, int columns) throws Exception {
        String remaining = printerSafe(text).replaceAll("\\s+", " ").trim();
        if (remaining.isEmpty()) { writePrinterText(output, "\n"); return; }
        while (remaining.length() > columns) {
            int split = remaining.lastIndexOf(' ', columns);
            if (split < 1) split = columns;
            writePrinterText(output, remaining.substring(0, split).trim() + "\n");
            remaining = remaining.substring(split).trim();
        }
        writePrinterText(output, remaining + "\n");
    }

    private void appendQrCode(ByteArrayOutputStream output, String value) throws Exception {
        byte[] content = printerSafe(value).getBytes(StandardCharsets.US_ASCII);
        output.write(new byte[]{0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00});
        output.write(new byte[]{0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x03});
        output.write(new byte[]{0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31});
        int length = content.length + 3;
        output.write(new byte[]{0x1d, 0x28, 0x6b, (byte) (length & 0xff), (byte) ((length >> 8) & 0xff), 0x31, 0x50, 0x30});
        output.write(content);
        output.write(new byte[]{0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30});
    }

    private Bitmap createFooterBitmap(String footer, String qrValue, int width, boolean narrowPaper) throws Exception {
        int qrSize = narrowPaper ? 96 : 124;
        int padding = narrowPaper ? 6 : 8;
        float textSize = narrowPaper ? 17f : 21f;
        float whatsappTextSize = narrowPaper ? 20f : 26f;
        int textWidth = width - qrSize - padding - 1;

        Paint textPaint = new Paint();
        textPaint.setColor(Color.BLACK);
        textPaint.setTextSize(textSize);
        textPaint.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD));
        textPaint.setAntiAlias(false);
        textPaint.setDither(false);
        textPaint.setFilterBitmap(false);
        textPaint.setSubpixelText(false);
        textPaint.setFakeBoldText(true);

        Paint whatsappPaint = new Paint(textPaint);
        whatsappPaint.setTextSize(whatsappTextSize);

        List<String> lines = wrapFooterLines(printerSafe(footer), textPaint, whatsappPaint, textWidth);
        int lineGap = narrowPaper ? 3 : 4;
        int textHeight = 0;
        for (String line : lines) {
            textHeight += Math.round((line.startsWith("WHATSAPP:") ? whatsappTextSize : textSize) + lineGap);
        }
        int height = Math.max(qrSize + padding * 2, textHeight + padding * 2);
        Bitmap result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        canvas.drawColor(Color.WHITE);

        float baseline = padding;
        for (String line : lines) {
            Paint activePaint = line.startsWith("WHATSAPP:") ? whatsappPaint : textPaint;
            baseline += activePaint.getTextSize();
            drawThermalText(canvas, line, padding, Math.round(baseline), activePaint);
            baseline += lineGap;
        }

        Map<EncodeHintType, Object> hints = new HashMap<>();
        hints.put(EncodeHintType.MARGIN, 0);
        BitMatrix matrix = new QRCodeWriter().encode(qrValue, BarcodeFormat.QR_CODE, qrSize, qrSize, hints);
        Paint qrPaint = new Paint();
        qrPaint.setColor(Color.BLACK);
        qrPaint.setAntiAlias(false);
        float qrLeft = width - qrSize - padding;
        float qrTop = (height - qrSize) / 2f;
        for (int y = 0; y < qrSize; y++) {
            for (int x = 0; x < qrSize; x++) {
                if (matrix.get(x, y)) canvas.drawPoint(qrLeft + x, qrTop + y, qrPaint);
            }
        }
        return result;
    }

    /**
     * Canvas fonts have thinner stems than the glyphs generated by most ESC/POS
     * printers. Reinforce only the horizontal stroke by one printer dot so the
     * raster footer stays legible without making the adjacent QR modules bleed.
     */
    private void drawThermalText(Canvas canvas, String text, float x, float baseline, Paint paint) {
        float alignedX = Math.round(x);
        float alignedBaseline = Math.round(baseline);
        canvas.drawText(text, alignedX, alignedBaseline, paint);
        canvas.drawText(text, alignedX + 1f, alignedBaseline, paint);
    }

    private List<String> wrapFooterLines(String footer, Paint textPaint, Paint whatsappPaint, float maxWidth) {
        List<String> result = new ArrayList<>();
        for (String paragraph : footer.split("\\n")) {
            String remaining = paragraph.trim();
            if (remaining.isEmpty()) continue;
            Paint activePaint = remaining.startsWith("WHATSAPP:") ? whatsappPaint : textPaint;
            while (activePaint.measureText(remaining) > maxWidth) {
                int measuredCharacters = activePaint.breakText(remaining, true, maxWidth, null);
                int hardLimit = Math.max(1, measuredCharacters);
                int spaceSplit = remaining.lastIndexOf(' ', hardLimit);
                int slashSplit = remaining.lastIndexOf('/', hardLimit - 1);
                int split = slashSplit >= spaceSplit ? slashSplit + 1 : spaceSplit;
                if (split < 1) split = hardLimit;
                result.add(remaining.substring(0, split).trim());
                remaining = remaining.substring(split).trim();
            }
            if (!remaining.isEmpty()) result.add(remaining);
        }
        return result;
    }

    private void writeFooterWithoutQr(
        ByteArrayOutputStream output,
        String footer,
        int rasterWidth,
        boolean narrowPaper
    ) throws Exception {
        int reservedQrSize = narrowPaper ? 96 : 124;
        int padding = narrowPaper ? 6 : 8;
        float textSize = narrowPaper ? 17f : 21f;
        float whatsappTextSize = narrowPaper ? 20f : 26f;
        float textWidth = rasterWidth - reservedQrSize - padding - 1;

        Paint textPaint = new Paint();
        textPaint.setTextSize(textSize);
        textPaint.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD));
        Paint compactTextPaint = new Paint(textPaint);
        compactTextPaint.setTextSize(14f);
        Paint whatsappPaint = new Paint(textPaint);
        whatsappPaint.setTextSize(whatsappTextSize);

        for (String paragraph : printerSafe(footer).split("\\n")) {
            String trimmedParagraph = paragraph.trim();
            if (trimmedParagraph.isEmpty()) continue;
            boolean compact = narrowPaper && trimmedParagraph.toLowerCase().startsWith("barang terbeli");
            Paint activePaint = compact
                ? compactTextPaint
                : (trimmedParagraph.startsWith("WHATSAPP:") ? whatsappPaint : textPaint);
            output.write(new byte[]{0x1b, 0x4d, (byte) (compact ? 0x01 : 0x00)});
            for (String line : wrapFooterLines(trimmedParagraph, activePaint, activePaint, textWidth)) {
                writePrinterText(output, line + "\n");
            }
        }
        output.write(new byte[]{0x1b, 0x4d, 0x00});
    }

    private byte[] bitmapToEscPos(Bitmap original, int targetWidth) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(new byte[]{0x1b, 0x40, 0x1b, 0x61, 0x01});
        appendBitmapRaster(output, original, targetWidth);
        appendFeedAndCut(output);
        return output.toByteArray();
    }

    private void appendBitmapRaster(ByteArrayOutputStream output, Bitmap original, int targetWidth) throws Exception {
        int targetHeight = Math.max(1, Math.round(original.getHeight() * (targetWidth / (float) original.getWidth())));
        if (targetHeight > 65535) throw new IllegalArgumentException("Gambar terlalu panjang untuk printer.");
        boolean scaled = original.getWidth() != targetWidth || original.getHeight() != targetHeight;
        Bitmap bitmap = scaled ? Bitmap.createScaledBitmap(original, targetWidth, targetHeight, false) : original;
        int bytesPerRow = (targetWidth + 7) / 8;
        output.write(new byte[]{0x1d, 0x76, 0x30, 0x00,
            (byte) (bytesPerRow & 0xff), (byte) ((bytesPerRow >> 8) & 0xff),
            (byte) (targetHeight & 0xff), (byte) ((targetHeight >> 8) & 0xff)});
        for (int y = 0; y < targetHeight; y++) {
            for (int byteX = 0; byteX < bytesPerRow; byteX++) {
                int value = 0;
                for (int bit = 0; bit < 8; bit++) {
                    int x = byteX * 8 + bit;
                    if (x >= targetWidth) continue;
                    int pixel = bitmap.getPixel(x, y);
                    int luminance = (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000;
                    if (Color.alpha(pixel) > 80 && luminance < 175) value |= (1 << (7 - bit));
                }
                output.write(value);
            }
        }
        if (scaled) bitmap.recycle();
    }

    private void appendCut(ByteArrayOutputStream output) {
        if (printerPreferences().getBoolean("cutPaper", true)) {
            output.write(0x1d); output.write(0x56); output.write(0x00);
        }
    }

    private void appendFeedAndCut(ByteArrayOutputStream output) {
        int feedLines = printerPreferences().getInt("feedLines", 6);
        if (feedLines > 0) {
            output.write(0x1b); output.write(0x64); output.write(feedLines);
        }
        appendCut(output);
    }

    private void appendDrawerPulse(ByteArrayOutputStream output) {
        int pin = printerPreferences().getInt("drawerPin", 0);
        output.write(0x1b); output.write(0x70); output.write(pin); output.write(0x19); output.write(0xfa);
    }

    private void writeToConfiguredPrinter(byte[] data) throws Exception {
        SharedPreferences prefs = printerPreferences();
        if (prefs.getString("mode", "lan").equals("bluetooth")) {
            String address = prefs.getString("bluetoothAddress", "");
            if (address.isEmpty()) throw new IllegalStateException("Printer Bluetooth belum dipilih.");
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) throw new IllegalStateException("Bluetooth belum aktif.");
            BluetoothDevice device = adapter.getRemoteDevice(address);
            try (BluetoothSocket socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)) {
                adapter.cancelDiscovery();
                socket.connect();
                OutputStream output = socket.getOutputStream();
                int chunkSize = 512;
                for (int offset = 0; offset < data.length; offset += chunkSize) {
                    int length = Math.min(chunkSize, data.length - offset);
                    output.write(data, offset, length);
                    output.flush();
                    if (offset + length < data.length) Thread.sleep(25);
                }
                output.flush();
                Thread.sleep(1500);
            }
            return;
        }

        String host = prefs.getString("lanHost", "192.168.2.124");
        int port = prefs.getInt("lanPort", 9100);
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 5000);
            socket.setSoTimeout(5000);
            OutputStream output = socket.getOutputStream();
            output.write(data); output.flush();
        }
    }

    private String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }
}
