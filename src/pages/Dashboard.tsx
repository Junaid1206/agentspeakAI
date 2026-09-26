import Overview from "@/pages/dashboard/Overview";
import Customers from "@/pages/dashboard/Customers";
import Calls from "@/pages/dashboard/Calls";
import CallDetail from "@/pages/dashboard/CallDetail";
import CallConsole from "@/pages/dashboard/CallConsole";
import { Route, Routes } from "react-router";

export default function Dashboard() {
  return (
    <Routes>
      <Route index element={<Overview />} />
      <Route path="customers" element={<Customers />} />
      <Route path="calls" element={<Calls />} />
      <Route path="calls/:callId" element={<CallDetail />} />
      <Route path="calls/:callId/live" element={<CallConsole />} />
      <Route path="*" element={<Overview />} />
    </Routes>
  );
}
