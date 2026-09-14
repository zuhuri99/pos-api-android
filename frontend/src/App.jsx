import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import NativeNavigation from "./components/NativeNavigation";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicOnlyRoute from "./components/PublicOnlyRoute";

const Login = lazy(() => import("./pages/PosLogin"));
const PosTransactionForm = lazy(() => import("./features/pos/pages/PosTransactionForm"));
const InvoiceDetails = lazy(() => import("./pages/InvoiceDetails"));
const ProductTransfer = lazy(() => import("./features/products/ProductTransfer"));
const SyncStatus = lazy(() => import("./features/offline/SyncStatus"));
const ThermalPrinterSettings = lazy(() => import("./pages/ThermalPrinterSettings"));

export default function App() {
  return (
    <BrowserRouter>
      <NativeNavigation />
      <Suspense fallback={<div className="p-8 text-center text-slate-600">Memuat POS…</div>}>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/" element={<Navigate replace to="/pos" />} />
          <Route path="/dashboard" element={<Navigate replace to="/pos" />} />
          <Route path="/pos" element={<ProtectedRoute><PosTransactionForm /></ProtectedRoute>} />
          <Route path="/pos/:id/edit" element={<ProtectedRoute><PosTransactionForm /></ProtectedRoute>} />
          <Route path="/invoice/:id" element={<ProtectedRoute><InvoiceDetails /></ProtectedRoute>} />
          <Route path="/products/transfer" element={<ProtectedRoute><ProductTransfer /></ProtectedRoute>} />
          <Route path="/admin/products" element={<ProtectedRoute><ProductTransfer /></ProtectedRoute>} />
          <Route path="/sync" element={<ProtectedRoute><SyncStatus /></ProtectedRoute>} />
          <Route path="/settings/printer" element={<ProtectedRoute><ThermalPrinterSettings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate replace to="/pos" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
