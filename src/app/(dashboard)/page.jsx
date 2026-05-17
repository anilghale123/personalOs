import { redirect } from "next/navigation";

/** Root of the dashboard — always lands the user on the Compass. */
export default function DashboardIndex() {
  redirect("/compass");
}
