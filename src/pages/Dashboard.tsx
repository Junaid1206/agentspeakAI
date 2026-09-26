import Overview from "@/pages/dashboard/Overview";
import Customers from "@/pages/dashboard/Customers";
import Calls from "@/pages/dashboard/Calls";
import CallDetail from "@/pages/dashboard/CallDetail";
import CallConsole from "@/pages/dashboard/CallConsole";
import Billing from "@/pages/dashboard/Billing";
import BillingCheckout from "@/pages/dashboard/BillingCheckout";
import Catalog from "@/pages/dashboard/Catalog";
import CampaignDetail from "@/pages/dashboard/CampaignDetail";
import Schedule from "@/pages/dashboard/Schedule";
import Knowledge from "@/pages/dashboard/Knowledge";
import KnowledgePost from "@/pages/dashboard/KnowledgePost";
import { Route, Routes } from "react-router";

export default function Dashboard() {
  return (
    <Routes>
      <Route index element={<Overview />} />
      <Route path="customers" element={<Customers />} />
      <Route path="calls" element={<Calls />} />
      <Route path="calls/:callId" element={<CallDetail />} />
      <Route path="calls/:callId/live" element={<CallConsole />} />
      <Route path="catalog" element={<Catalog />} />
      <Route path="catalog/:campaignId" element={<CampaignDetail />} />
      <Route path="schedule" element={<Schedule />} />
      <Route path="knowledge" element={<Knowledge />} />
      <Route path="knowledge/:postId" element={<KnowledgePost />} />
      <Route path="billing" element={<Billing />} />
      <Route path="billing/checkout/:orderId" element={<BillingCheckout />} />
      <Route path="*" element={<Overview />} />
    </Routes>
  );
}
