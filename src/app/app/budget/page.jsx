import { redirect } from "next/navigation";

export default function BudgetIndexPage() {
  redirect("/budget/expenses");
}
