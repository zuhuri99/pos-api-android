import { NavLink } from "react-router-dom";
import MobileLayout from "../../../layouts/MobileLayout";

const tabs = [
  ["/payroll", "Ringkasan", true],
  ["/payroll/employees", "Karyawan"],
  ["/payroll/attendance", "Absensi"],
  ["/payroll/periods", "Periode"],
  ["/payroll/slips", "Slip"],
  ["/payroll/kasbon", "Kasbon"],
  ["/payroll/utang", "Utang"],
  ["/payroll/validation", "Validasi Payroll"],
];

export default function PayrollShell({ title, actions, children }) {
  return (
    <MobileLayout title={title}>
      <div className="-mx-4 -mt-4 mb-4 bg-white border-b border-gray-200 overflow-x-auto">
        <div className="flex min-w-max px-2">
          {tabs.map(([path, label, end]) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) => `px-3 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${isActive ? "text-[#0067b8] border-[#0067b8]" : "text-gray-500 border-transparent hover:text-gray-800"}`}
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>
      {actions && <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>}
      {children}
    </MobileLayout>
  );
}
